package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/terva-sh/git-ticket-canvas/internal/layout"
	"github.com/terva-sh/git-ticket/ticket"
)

func stateOf(s *Server) liveState {
	s.live.mu.Lock()
	defer s.live.mu.Unlock()
	return s.live.state
}

func writeFile(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}

func removeFile(t *testing.T, path string) {
	t.Helper()
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
}

func waitGeneration(t *testing.T, s *Server, old liveState) liveState {
	t.Helper()
	eventually(t, func() bool {
		state := stateOf(s)
		return state.Generation > old.Generation && !state.Stale && !state.Degraded
	})
	return stateOf(s)
}

func TestSnapshotReadinessMatchesLibrary(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	nextID := 0
	newCard := func() *ticket.Ticket { nextID++; return fixtureTicket(fmt.Sprintf("TKT-%026d", nextID)) }
	for _, status := range ticket.Statuses {
		for _, claim := range []string{"none", "held", "expired"} {
			for _, blocking := range []string{"none", "done", "waiting", "missing", "children"} {
				card := newCard()
				card.Status = status
				if claim != "none" {
					expires := ticket.Now(fixtureTime.Add(time.Hour))
					if claim == "expired" {
						expires = ticket.Now(fixtureTime.Add(-time.Hour))
					}
					card.Claim = &ticket.Claim{Actor: testActor.ID, ExpiresAt: &expires}
				}
				if blocking != "none" {
					dep := newCard()
					if blocking == "done" {
						dep.Status = "done"
					}
					if blocking == "children" {
						card.BlocksOn = ticket.BlocksOnChildren
						dep.Parent = &card.ID
					} else {
						card.Dependencies = []string{dep.ID}
					}
					if blocking != "missing" {
						saveFixture(t, st, dep)
					}
				}
				saveFixture(t, st, card)
			}
		}
	}
	fixed, err := ticket.OpenWith(st.Path(), ticket.OpenOptions{Now: func() time.Time { return fixtureTime }})
	if err != nil {
		t.Fatal(err)
	}
	all, err := fixed.List(context.Background(), ticket.Filter{All: true})
	if err != nil {
		t.Fatal(err)
	}
	want, err := fixed.Readiness(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got := snapshotReadiness(all, fixtureTime); !reflect.DeepEqual(got, want) {
		t.Fatal("captured readiness differs from ticket library")
	}
}

func TestLiveIdleReadersShareBuildAndHeaders(t *testing.T) {
	t.Parallel()
	s := New(newTestStore(t), Options{Actor: testActor})
	h := startAPI(t, s)
	first := boardRead(h, "/api/board")
	assertFullBoard(t, first)
	before := s.LiveStats()
	var wg sync.WaitGroup
	for tab := 0; tab < 8; tab++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 30; i++ {
				w := boardRead(h, "/api/board", first.Header().Get("ETag"))
				if w.Code != 304 || w.Body.Len() != 0 {
					t.Errorf("idle read = %d / %s", w.Code, w.Body.String())
				}
				for _, header := range []string{"X-Canvas-Epoch", "X-Canvas-Generation", "X-Canvas-Stale", "X-Canvas-Degraded", "X-Canvas-Rebuilds", "X-Canvas-Safety-Scans"} {
					if w.Header().Get(header) == "" || w.Header().Get(header) != first.Header().Get(header) {
						t.Errorf("unstable %s", header)
					}
				}
			}
		}()
	}
	wg.Wait()
	if got := s.LiveStats(); got != before || got.Rebuilds != 1 {
		t.Fatalf("idle tabs rebuilt store: %+v -> %+v", before, got)
	}
	for i := 0; i < 100; i++ {
		boardRead(h, fmt.Sprintf("/api/board?board=unused%d", i))
	}
	s.live.mu.Lock()
	if len(s.live.snap.reps) > len(s.live.snap.boards)+64 {
		t.Error("unbounded representation cache")
	}
	s.live.mu.Unlock()
}

func TestLiveWatcherAtomicMovesNewDirectoriesAndDeletion(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	// Make the terminal directory appear after watching starts.
	if err := os.RemoveAll(st.StatusDir("done")); err != nil {
		t.Fatal(err)
	}
	s := New(st, Options{Actor: testActor})
	h := startAPI(t, s)
	card := fixtureTicket("TKT-01M245HJ7GBGQ8G8JGGY5RW2DY")
	old := stateOf(s)
	saveFixture(t, st, card)
	old = waitGeneration(t, s, old)
	if !slices.Contains(old.Scopes, "tickets") {
		t.Fatalf("create scopes: %v", old.Scopes)
	}

	path := filepath.Join(st.StatusDir(card.Status), card.ID+".md")
	card.Title = "Atomic replacement"
	tmp := filepath.Join(filepath.Dir(path), ".save.tmp")
	writeFile(t, tmp, ticket.Render(card))
	if err := os.Rename(tmp, path); err != nil {
		t.Fatal(err)
	}
	old = waitGeneration(t, s, old)
	if got := assertFullBoard(t, boardRead(h, "/api/board")).Tickets[0].Title; got != card.Title {
		t.Fatal(got)
	}

	// The move is deliberately two operations, like an external CLI update.
	removeFile(t, path)
	card.Status = "done"
	saveFixture(t, st, card)
	old = waitGeneration(t, s, old)
	if got := assertFullBoard(t, boardRead(h, "/api/board")).Tickets[0].Status; got != "done" {
		t.Fatal(got)
	}
	path = filepath.Join(st.StatusDir(card.Status), card.ID+".md")
	card.Title = "Edit inside new directory"
	writeFile(t, path, ticket.Render(card))
	old = waitGeneration(t, s, old)
	removeFile(t, path)
	waitGeneration(t, s, old)
	if got := assertFullBoard(t, boardRead(h, "/api/board")).Tickets; len(got) != 0 {
		t.Fatal("deleted ticket remained")
	}
}

func TestLiveBurstDedupAndIrrelevantFiles(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	card := fixtureTicket("TKT-01M245HJ7GBGQ8G8JGGY5RW2DY")
	saveFixture(t, st, card)
	s := New(st, Options{Actor: testActor})
	startAPI(t, s)
	old := stateOf(s)
	for i := 0; i < 20; i++ {
		card.Title = fmt.Sprintf("burst %d", i)
		saveFixture(t, st, card)
	}
	state := waitGeneration(t, s, old)
	if state.Generation != old.Generation+1 {
		t.Fatalf("burst published %d generations", state.Generation-old.Generation)
	}
	before := s.LiveStats()
	for i := 0; i < 50; i++ {
		s.live.hint()
	}
	writeFile(t, filepath.Join(st.StatusDir("ready"), ".editor.tmp"), []byte("temporary"))
	writeFile(t, filepath.Join(st.Path(), "epics.md"), []byte("derived index"))
	time.Sleep(300 * time.Millisecond)
	if stateOf(s).Generation != state.Generation || s.LiveStats().Rebuilds != before.Rebuilds {
		t.Fatal("duplicate hints rebuilt or republished unchanged state")
	}

	// Hints that never stop cannot postpone reconciliation beyond burst cap.
	old = stateOf(s)
	card.Title = "bounded convergence"
	saveFixture(t, st, card)
	stop := make(chan struct{})
	defer close(stop)
	go func() {
		ticker := time.NewTicker(10 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				s.live.hint()
			}
		}
	}()
	waitGeneration(t, s, old)
}

func TestLiveInvalidStartupAndRecovery(t *testing.T) {
	t.Parallel()
	for _, broken := range []string{"ticket", "incomplete", "config", "layout", "duplicate", "misplaced"} {
		t.Run(broken, func(t *testing.T) {
			st := newTestStore(t)
			card := fixtureTicket("TKT-01M245HJ7GBGQ8G8JGGY5RW2DY")
			saveFixture(t, st, card)
			s := New(st, Options{Actor: testActor})
			path := filepath.Join(st.StatusDir(card.Status), card.ID+".md")
			restore := ticket.Render(card)
			switch broken {
			case "config":
				path = filepath.Join(st.Path(), "config.yml")
				restore = ticket.RenderConfig(st.Config())
			case "layout":
				if _, err := s.layout.Update("default", nil); err != nil {
					t.Fatal(err)
				}
				path = filepath.Join(s.layout.Dir(), "default.yml")
				var err error
				restore, err = os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
			case "duplicate", "misplaced":
				path = filepath.Join(st.StatusDir("done"), card.ID+".md")
				writeFile(t, path, restore)
				if broken == "misplaced" {
					removeFile(t, filepath.Join(st.StatusDir(card.Status), card.ID+".md"))
				}
			}
			if broken == "incomplete" {
				partial := *card
				partial.Type = ""
				writeFile(t, path, ticket.Render(&partial))
			} else if broken != "duplicate" && broken != "misplaced" {
				writeFile(t, path, []byte("schema: [invalid"))
			}
			h := startAPI(t, s)
			for _, endpoint := range []string{"/api/board", "/api/schema"} {
				w := boardRead(h, endpoint, "*")
				if w.Code != 503 || w.Header().Get("ETag") != "" || !strings.Contains(w.Body.String(), "snapshot_unavailable") {
					t.Fatalf("invalid startup %s: %d %s", endpoint, w.Code, w.Body.String())
				}
			}
			if broken == "duplicate" || broken == "misplaced" {
				removeFile(t, path)
				saveFixture(t, st, card)
			} else {
				writeFile(t, path, restore)
			}
			eventually(t, func() bool { return !stateOf(s).Stale })
			if got := assertFullBoard(t, boardRead(h, "/api/board")).Tickets; len(got) != 1 {
				t.Fatalf("recovery lost ticket: %v", got)
			}
		})
	}
}

func TestLiveMalformedTicketAndLayoutKeepLastValid(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	card := fixtureTicket("TKT-01M245HJ7GBGQ8G8JGGY5RW2DY")
	saveFixture(t, st, card)
	s := New(st, Options{Actor: testActor})
	if _, err := s.layout.Update("other", map[string]*layout.Card{card.ID: {X: 22}}); err != nil {
		t.Fatal(err)
	}
	h := startAPI(t, s)
	for _, path := range []string{filepath.Join(st.StatusDir(card.Status), card.ID+".md"), filepath.Join(s.layout.Dir(), "other.yml")} {
		before := boardRead(h, "/api/board?board=other")
		original, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		writeFile(t, path, []byte("broken"))
		eventually(t, func() bool { return stateOf(s).Stale })
		after := boardRead(h, "/api/board?board=other")
		if !bytes.Equal(before.Body.Bytes(), after.Body.Bytes()) || after.Header().Get("X-Canvas-Stale") != "true" {
			t.Fatal("invalid read replaced complete state")
		}
		writeFile(t, path, original)
		eventually(t, func() bool { return !stateOf(s).Stale })
	}
}

func TestLiveMixedBuildRejected(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	card := fixtureTicket("TKT-01M245HJ7GBGQ8G8JGGY5RW2DY")
	saveFixture(t, st, card)
	s := New(st, Options{Actor: testActor})
	s.live.timing.settle = 150 * time.Millisecond
	s.live.timing.debounce = 500 * time.Millisecond
	h := startAPI(t, s)
	before := boardRead(h, "/api/board")
	builds := s.LiveStats().Rebuilds
	done := make(chan struct{})
	go func() { s.live.reconcile(true, false); close(done) }()
	eventually(t, func() bool { return s.LiveStats().Rebuilds > builds })
	card.Title = "Changed during candidate settling"
	saveFixture(t, st, card)
	<-done
	if !stateOf(s).Stale {
		t.Fatal("mixed file image was accepted")
	}
	if got := boardRead(h, "/api/board"); !bytes.Equal(got.Body.Bytes(), before.Body.Bytes()) {
		t.Fatal("mixed build replaced last valid bytes")
	}
	eventually(t, func() bool { return !stateOf(s).Stale })
	if got := assertFullBoard(t, boardRead(h, "/api/board")).Tickets[0].Title; got != card.Title {
		t.Fatal(got)
	}
}

func TestLiveClaimExpiryWithoutHints(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	card := fixtureTicket("TKT-01M245HJ7GBGQ8G8JGGY5RW2DY")
	// Ticket timestamps serialize at second precision. Leave at least one
	// whole second before expiry, including time spent starting the server.
	expires := ticket.Timestamp{Time: time.Now().Add(2 * time.Second).Truncate(time.Second)}
	card.Claim = &ticket.Claim{Actor: testActor.ID, ExpiresAt: &expires}
	saveFixture(t, st, card)
	s := New(st, Options{Actor: testActor})
	h := startAPI(t, s)
	first := assertFullBoard(t, boardRead(h, "/api/board"))
	if first.Tickets[0].Claim.Expired {
		t.Fatal("fixture claim already expired")
	}
	old := stateOf(s)
	waitGeneration(t, s, old)
	after := assertFullBoard(t, boardRead(h, "/api/board"))
	if !after.Tickets[0].Claim.Expired || !after.Tickets[0].Readiness.Ready || after.Tickets[0].Revision != first.Tickets[0].Revision {
		t.Fatal("clock did not invalidate derived-only state")
	}
	if s.LiveStats().SafetyScans != 0 {
		t.Fatal("expiry relied on safety reconciliation")
	}
}

func TestLiveOverflowLostWatchAndSafetyRescan(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	card := fixtureTicket("TKT-01M245HJ7GBGQ8G8JGGY5RW2DY")
	saveFixture(t, st, card)
	s := New(st, Options{Actor: testActor})
	s.live.timing.safety = 400 * time.Millisecond
	h := startAPI(t, s)
	old := stateOf(s)
	s.live.fault <- fsnotify.ErrEventOverflow
	eventually(t, func() bool { return stateOf(s).Degraded })
	waitGeneration(t, s, old)

	// Silently remove a watch. A file edit now has no notification; periodic
	// reconciliation must both read it and restore the missing watch.
	s.live.buildMu.Lock()
	err := s.live.watcher.Remove(st.StatusDir(card.Status))
	s.live.buildMu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	old = stateOf(s)
	card.Title = "Lost notification recovered by safety scan"
	saveFixture(t, st, card)
	waitGeneration(t, s, old)
	if s.LiveStats().SafetyScans == 0 {
		t.Fatal("missing safety scan")
	}
	if got := assertFullBoard(t, boardRead(h, "/api/board")).Tickets[0].Title; got != card.Title {
		t.Fatal(got)
	}
	s.live.buildMu.Lock()
	restored := slices.Contains(s.live.watcher.WatchList(), st.StatusDir(card.Status))
	// A closed watcher is a second kind of loss, distinct from overflow.
	err = s.live.watcher.Close()
	s.live.buildMu.Unlock()
	if !restored || err != nil {
		t.Fatalf("watch restoration: %t, %v", restored, err)
	}
	eventually(t, func() bool { return stateOf(s).Degraded })
	eventually(t, func() bool { return !stateOf(s).Degraded })
}

func openEvents(t *testing.T, server *httptest.Server) (*http.Response, *bufio.Reader) {
	t.Helper()
	client := &http.Client{Timeout: 4 * time.Second}
	req, err := http.NewRequest("GET", server.URL+"/api/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", server.URL)
	req.Header.Set("Last-Event-ID", "obsolete-epoch:99999")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })
	if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "text/event-stream" || resp.Header.Get("X-Accel-Buffering") != "no" {
		t.Fatalf("stream headers: %d %v", resp.StatusCode, resp.Header)
	}
	return resp, bufio.NewReader(resp.Body)
}

func readEvent(t *testing.T, reader *bufio.Reader) liveState {
	t.Helper()
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var fields map[string]json.RawMessage
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &fields); err != nil {
			t.Fatal(err)
		}
		if len(fields) != 5 {
			t.Fatalf("event is not metadata-only: %s", line)
		}
		var state liveState
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &state); err != nil {
			t.Fatal(err)
		}
		if blank, err := reader.ReadString('\n'); err != nil || blank != "\n" {
			t.Fatalf("bad event terminator: %q %v", blank, err)
		}
		return state
	}
}

func TestLiveEventsInitialMutationHeartbeatReconnectAndRestart(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	s := New(st, Options{Actor: testActor})
	s.live.timing.heartbeat = 50 * time.Millisecond
	server := httptest.NewServer(startAPI(t, s))
	t.Cleanup(func() { _ = s.Close(); server.Close() })
	resp, reader := openEvents(t, server)
	initial := readEvent(t, reader)
	board := boardRead(s.Handler(), "/api/board")
	if initial.Epoch != board.Header().Get("X-Canvas-Epoch") || strconv.FormatUint(initial.Generation, 10) != board.Header().Get("X-Canvas-Generation") {
		t.Fatal("initial stream/read race")
	}
	if line, err := reader.ReadString('\n'); err != nil || line != ": heartbeat\n" {
		t.Fatalf("heartbeat: %q %v", line, err)
	}
	request(t, server, "POST", "/api/tickets", `{"title":"Immediate snapshot","description":"MUST NOT BE STREAMED"}`, 201)
	changed := readEvent(t, reader)
	if changed.Generation <= initial.Generation || !slices.Contains(changed.Scopes, "tickets") {
		t.Fatalf("mutation notification: %+v", changed)
	}
	if got := assertFullBoard(t, boardRead(s.Handler(), "/api/board")).Tickets; len(got) != 1 {
		t.Fatal("API response preceded snapshot convergence")
	}
	_ = resp.Body.Close()
	eventually(t, func() bool { return s.LiveStats().Subscribers == 0 })
	resp, reader = openEvents(t, server)
	reconnected := readEvent(t, reader)
	if reconnected.Epoch != changed.Epoch || reconnected.Generation != changed.Generation {
		t.Fatalf("reconnect lost current state: %+v", reconnected)
	}
	_ = s.Close()
	if _, err := io.ReadAll(resp.Body); err != nil {
		t.Fatal(err)
	}
	if s.LiveStats().Subscribers != 0 {
		t.Fatal("shutdown retained subscribers")
	}

	restarted := New(st, Options{Actor: testActor})
	server2 := httptest.NewServer(startAPI(t, restarted))
	t.Cleanup(func() { _ = restarted.Close(); server2.Close() })
	_, reader2 := openEvents(t, server2)
	state := readEvent(t, reader2)
	if state.Epoch == initial.Epoch || state.Generation != 1 {
		t.Fatalf("restart cursor collision: %+v", state)
	}
}

func TestLiveSubscribersBoundedAndCoalesced(t *testing.T) {
	t.Parallel()
	s := New(newTestStore(t), Options{Actor: testActor})
	startAPI(t, s)
	channels := make([]chan liveState, 0, maxSubscribers)
	for i := 0; i < maxSubscribers; i++ {
		ch, ok := s.live.subscribe()
		if !ok {
			t.Fatal("early capacity limit")
		}
		channels = append(channels, ch)
	}
	if _, ok := s.live.subscribe(); ok {
		t.Fatal("unbounded subscriptions")
	}
	s.live.mu.Lock()
	for i := 0; i < 1000; i++ {
		s.live.publishLocked([]string{fmt.Sprintf("layout:board%d", i)})
	}
	want := s.live.state.Generation
	s.live.mu.Unlock()
	for _, ch := range channels {
		if len(ch) != 1 {
			t.Fatal("unbounded pending messages")
		}
		state := <-ch
		if state.Generation != want || !slices.Contains(state.Scopes, "tickets") {
			t.Fatal("slow subscriber cannot resynchronize all missed scopes")
		}
		s.live.unsubscribe(ch)
	}
	if s.LiveStats().Subscribers != 0 {
		t.Fatal("unsubscribe leaked resources")
	}
}

func TestLivePartialAPIMutationAndLayoutConvergeBeforeResponse(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	s := New(st, Options{Actor: testActor})
	server := httptest.NewServer(startAPI(t, s))
	t.Cleanup(func() { _ = s.Close(); server.Close() })
	created := decodeResponse[ticketResponse](t, request(t, server, "POST", "/api/tickets", `{"title":"Initial"}`, 201))
	old := stateOf(s)
	request(t, server, "PATCH", "/api/tickets/"+created.Ticket.ID,
		jsonBody(t, patchRequest{IfRevision: created.Ticket.Revision, Ops: []Op{{Op: "setTitle", Title: "Committed before failure"}, {Op: "not-an-operation"}}}), 400)
	board := assertFullBoard(t, boardRead(s.Handler(), "/api/board"))
	if board.Tickets[0].Title != "Committed before failure" || stateOf(s).Generation <= old.Generation {
		t.Fatal("failed batch hid a committed operation")
	}
	request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Board: "new", Cards: map[string]*layout.Card{created.Ticket.ID: {X: 50}}}), 200)
	board = assertFullBoard(t, boardRead(s.Handler(), "/api/board?board=new"))
	if board.Board.Cards[created.Ticket.ID].X != 50 {
		t.Fatal("layout response preceded shared snapshot")
	}
	generation := stateOf(s).Generation
	time.Sleep(250 * time.Millisecond)
	if stateOf(s).Generation != generation {
		t.Fatal("filesystem echo republished API mutation")
	}
}

func TestLiveConfigAndLayoutScopes(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	s := New(st, Options{Actor: testActor})
	h := startAPI(t, s)
	old := stateOf(s)
	cfg := st.Config()
	cfg.Labels = []string{"external"}
	writeFile(t, filepath.Join(st.Path(), "config.yml"), ticket.RenderConfig(cfg))
	old = waitGeneration(t, s, old)
	if !slices.Equal(old.Scopes, []string{"config"}) {
		t.Fatalf("config scopes: %v", old.Scopes)
	}
	if _, err := s.layout.Update("other", map[string]*layout.Card{"ticket": {X: 1}}); err != nil {
		t.Fatal(err)
	}
	old = waitGeneration(t, s, old)
	if !slices.Contains(old.Scopes, "boards") || !slices.Contains(old.Scopes, "layout:other") {
		t.Fatalf("new layout scopes: %v", old.Scopes)
	}
	if _, err := s.layout.Update("other", map[string]*layout.Card{"ticket": {X: 2}}); err != nil {
		t.Fatal(err)
	}
	old = waitGeneration(t, s, old)
	if !slices.Equal(old.Scopes, []string{"layout:other"}) {
		t.Fatalf("layout edit scopes: %v", old.Scopes)
	}
	removeFile(t, filepath.Join(s.layout.Dir(), "other.yml"))
	old = waitGeneration(t, s, old)
	if !slices.Contains(old.Scopes, "boards") || !slices.Contains(old.Scopes, "layout:other") {
		t.Fatalf("layout delete scopes: %v", old.Scopes)
	}
	if got := assertFullBoard(t, boardRead(h, "/api/board?board=other")).Board.Cards; len(got) != 0 {
		t.Fatal("deleted layout stayed cached")
	}
}

func TestLiveStoreReplacementAndCancelledLifecycle(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	s := New(st, Options{Actor: testActor})
	h := startAPI(t, s)
	before := boardRead(h, "/api/board")
	backup := st.Path() + "-moved"
	if err := os.Rename(st.Path(), backup); err != nil {
		t.Fatal(err)
	}
	eventually(t, func() bool { return stateOf(s).Stale })
	if after := boardRead(h, "/api/board"); !bytes.Equal(before.Body.Bytes(), after.Body.Bytes()) {
		t.Fatal("missing store replaced last valid snapshot")
	}
	if err := os.Rename(backup, st.Path()); err != nil {
		t.Fatal(err)
	}
	eventually(t, func() bool { state := stateOf(s); return !state.Stale && !state.Degraded })
	card := fixtureTicket("TKT-01M245HJ7GBGQ8G8JGGY5RW2DY")
	old := stateOf(s)
	saveFixture(t, st, card)
	waitGeneration(t, s, old)

	other := New(st, Options{Actor: testActor})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	t.Cleanup(func() { _ = other.Close() })
	if err := other.Start(ctx); err != nil {
		t.Fatal(err)
	}
	ch, ok := other.live.subscribe()
	if !ok {
		t.Fatal("subscribe failed")
	}
	<-ch
	cancel()
	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("cancel left subscription open")
		}
	case <-time.After(time.Second):
		t.Fatal("cancel leaked lifecycle")
	}
	if err := other.Close(); err != nil {
		t.Fatal(err)
	}
}

type deadlineWriter struct {
	header   http.Header
	deadline time.Time
}

func (w *deadlineWriter) Header() http.Header                 { return w.header }
func (w *deadlineWriter) WriteHeader(int)                     {}
func (w *deadlineWriter) Flush()                              {}
func (w *deadlineWriter) SetWriteDeadline(at time.Time) error { w.deadline = at; return nil }
func (w *deadlineWriter) Write([]byte) (int, error) {
	if w.deadline.IsZero() {
		return 0, fmt.Errorf("stream omitted write deadline")
	}
	time.Sleep(time.Until(w.deadline))
	return 0, os.ErrDeadlineExceeded
}

func TestLiveSlowStreamDeadlineAndCapacityHTTP(t *testing.T) {
	t.Parallel()
	s := New(newTestStore(t), Options{Actor: testActor})
	s.live.timing.writeTimeout = 50 * time.Millisecond
	h := startAPI(t, s)
	writer := &deadlineWriter{header: make(http.Header)}
	start := time.Now()
	h.ServeHTTP(writer, httptest.NewRequest("GET", "/api/events", nil))
	if time.Since(start) > time.Second || s.LiveStats().Subscribers != 0 {
		t.Fatal("slow stream blocked publication or retained subscriber")
	}
	for i := 0; i < maxSubscribers; i++ {
		if _, ok := s.live.subscribe(); !ok {
			t.Fatal("early capacity limit")
		}
	}
	server := httptest.NewServer(h)
	t.Cleanup(func() { _ = s.Close(); server.Close() })
	request(t, server, "GET", "/api/events", "", 503)
}

func TestLiveOriginReadOnlyAndLifecycle(t *testing.T) {
	t.Parallel()
	s := New(newTestStore(t), Options{Actor: testActor, ReadOnly: true})
	if w := boardRead(s.Handler(), "/api/board"); w.Code != 503 {
		t.Fatal("unstarted server served a fabricated snapshot")
	}
	h := startAPI(t, s)
	for _, endpoint := range []string{"/api/events", "/api/tickets"} {
		method := "GET"
		if endpoint == "/api/tickets" {
			method = "POST"
		}
		r := httptest.NewRequest(method, endpoint, nil)
		r.Header.Set("Origin", "https://other.example")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatalf("cross-origin %s = %d", endpoint, w.Code)
		}
	}
	r := httptest.NewRequest("HEAD", "/api/events", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 405 {
		t.Fatal("HEAD opened stream")
	}
	server := httptest.NewServer(h)
	t.Cleanup(func() { _ = s.Close(); server.Close() })
	_, reader := openEvents(t, server)
	if readEvent(t, reader).Stale {
		t.Fatal("read-only stream failed")
	}
	request(t, server, "POST", "/api/tickets", `{"title":"no"}`, 403)
	_ = s.Close()
	_ = s.Close()
	if err := s.Start(context.Background()); err == nil {
		t.Fatal("closed coordinator restarted")
	}
}
