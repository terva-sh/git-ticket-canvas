package api

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/terva-sh/git-ticket-canvas/internal/layout"
	"github.com/terva-sh/git-ticket/ticket"
)

// Test-local wire types deliberately compile before the production guard exists.
// The opaque token is separate from an ETag and never enters layout YAML.
type captureBoardWire struct {
	CaptureToken string       `json:"captureToken"`
	Layout       layout.Board `json:"layout"`
}

func captureRead(t *testing.T, server *httptest.Server) captureBoardWire {
	t.Helper()
	b := decodeResponse[captureBoardWire](t, request(t, server, "GET", "/api/board", "", 200))
	if b.CaptureToken == "" {
		t.Fatal("complete board read has no captureToken")
	}
	return b
}
func captureGuardWire(token string) map[string]any {
	return map[string]any{"version": 1, "token": token}
}
func captureWrite(t *testing.T, token, id string, before *layout.Card, after layout.Card) string {
	t.Helper()
	return jsonBody(t, map[string]any{"cards": map[string]any{id: after},
		"expect": map[string]any{"cards": map[string]any{id: before}}, "capture": captureGuardWire(token)})
}
func captureFixture(t *testing.T) (*ticket.Store, *httptest.Server, string) {
	t.Helper()
	st := newTestStore(t)
	server := startTestServer(t, st, false)
	created := decodeResponse[ticketResponse](t, request(t, server, "POST", "/api/tickets", `{"title":"Captured","card":{"x":10,"y":20}}`, 201))
	createFrame(t, server, created.Ticket.ID)
	return st, server, created.Ticket.ID
}
func capturePositive(t *testing.T, server *httptest.Server, id string) captureBoardWire {
	t.Helper()
	before := captureRead(t, server)
	card := before.Layout.Cards[id]
	// A valid, nonempty guarded transaction must succeed before refusal cases.
	request(t, server, "PUT", "/api/layout", captureWrite(t, before.CaptureToken, id, &card, layout.Card{X: card.X + 1, Y: card.Y}), 200)
	return captureRead(t, server)
}
func captureRaw(server *httptest.Server, body string) (int, []byte, error) {
	r, err := http.NewRequest("PUT", server.URL+"/api/layout", strings.NewReader(body))
	if err != nil {
		return 0, nil, err
	}
	r.Header.Set("Content-Type", "application/json")
	response, err := server.Client().Do(r)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	return response.StatusCode, data, err
}

func TestCaptureTokenPositiveStableAndNotPersisted(t *testing.T) {
	st, server, id := captureFixture(t)
	before := captureRead(t, server)
	if again := captureRead(t, server); again.CaptureToken != before.CaptureToken {
		t.Fatal("unchanged inputs changed token")
	}
	after := capturePositive(t, server, id)
	if after.CaptureToken == before.CaptureToken {
		t.Fatal("authored card edit retained token")
	}
	if bytes.Contains(penDisk(t, st.Path()), []byte("capture")) {
		t.Fatal("capture guard leaked into authored YAML")
	}
	// ETags validate the full response, but are not accepted as capture tokens.
	response, err := server.Client().Get(server.URL + "/api/board")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.Copy(io.Discard, response.Body)
	response.Body.Close()
	etag := response.Header.Get("ETag")
	if etag == "" || etag == after.CaptureToken {
		t.Fatal("missing or conflated ETag")
	}
	card := after.Layout.Cards[id]
	request(t, server, "PUT", "/api/layout", captureWrite(t, etag, id, &card, layout.Card{X: 55}), 400)
	r, _ := http.NewRequest("GET", server.URL+"/api/board", nil)
	r.Header.Set("If-None-Match", etag)
	unchanged, err := server.Client().Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer unchanged.Body.Close()
	data, err := io.ReadAll(unchanged.Body)
	if err != nil {
		t.Fatal(err)
	}
	if unchanged.StatusCode != 304 || len(data) != 0 {
		t.Fatal("capture token broke unchanged board validation")
	}
}

func TestCaptureMalformedGuardsCannotMutate(t *testing.T) {
	st, server, id := captureFixture(t)
	current := capturePositive(t, server, id)
	for _, guard := range []any{nil, map[string]any{}, map[string]any{"version": 1},
		map[string]any{"version": 1, "token": ""}, map[string]any{"version": 2, "token": current.CaptureToken},
		map[string]any{"version": 1, "token": 42}, map[string]any{"version": 1, "token": "not-a-token"},
		map[string]any{"version": 1, "token": current.CaptureToken, "extra": true}} {
		t.Run(fmt.Sprintf("%v", guard), func(t *testing.T) {
			before := penDisk(t, st.Path())
			request(t, server, "PUT", "/api/layout", jsonBody(t, map[string]any{"capture": guard, "cards": map[string]any{id: layout.Card{X: 999}}}), 400)
			if !bytes.Equal(before, penDisk(t, st.Path())) {
				t.Fatal("malformed capture wrote layout")
			}
		})
	}
}

func TestCaptureStaleWholeInputSetIsAtomic(t *testing.T) {
	for _, change := range []string{"title", "label", "metadata", "insert-ticket", "delete-ticket", "manual", "insert-frame", "frame-title", "routing", "config"} {
		t.Run(change, func(t *testing.T) {
			st, server, id := captureFixture(t)
			other := decodeResponse[ticketResponse](t, request(t, server, "POST", "/api/tickets", `{"title":"Uncaptured"}`, 201)).Ticket
			before := capturePositive(t, server, id)
			switch change {
			case "title", "label", "metadata":
				op := Op{Op: "setTitle", Title: "A much longer unrelated title"}
				if change == "label" {
					op = Op{Op: "addLabel", Label: "trial"}
				}
				if change == "metadata" {
					op = Op{Op: "setPriority", Priority: "high"}
				}
				request(t, server, "PATCH", "/api/tickets/"+other.ID, jsonBody(t, patchRequest{IfRevision: other.Revision, Ops: []Op{op}}), 200)
			case "insert-ticket":
				request(t, server, "POST", "/api/tickets", `{"title":"New automatic card"}`, 201)
			case "delete-ticket":
				request(t, server, "DELETE", "/api/tickets/"+other.ID+"?force=true&ifRevision="+other.Revision, "", 200)
			case "manual":
				request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Cards: map[string]*layout.Card{other.ID: {X: 800, Y: 900}}}), 200)
			case "insert-frame", "frame-title":
				name, frame := "new-obstacle", apiFrame()
				var prior *layout.Frame
				if change == "frame-title" {
					name = "f"
					old := before.Layout.Frames[name]
					prior = &old
					frame = old
					frame.Title = "Wrapped control source changed"
				}
				request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Frames: map[string]*layout.Frame{name: &frame}, Expect: &layout.Expectations{Frames: map[string]*layout.Frame{name: prior}}}), 200)
			case "routing":
				penInstall(t, server)
			case "config":
				cfg := st.Config()
				cfg.Labels = append(cfg.Labels, "external-capture-label")
				if err := os.WriteFile(filepath.Join(st.Path(), "config.yml"), ticket.RenderConfig(cfg), 0600); err != nil {
					t.Fatal(err)
				}
				// No watcher wait: mutation validation must read fresh authoritative config.
			}
			unchanged := penDisk(t, st.Path())
			oldCard, oldFrame := before.Layout.Cards[id], before.Layout.Frames["f"]
			if change == "frame-title" {
				// Keep sparse expectations current so only the capture token can refuse.
				oldFrame.Title = "Wrapped control source changed"
			}
			nextFrame := oldFrame
			nextFrame.X += 300
			body := jsonBody(t, map[string]any{"capture": captureGuardWire(before.CaptureToken),
				"cards": map[string]any{id: layout.Card{X: 999, Y: 888}}, "frames": map[string]any{"f": nextFrame},
				"expect": map[string]any{"cards": map[string]any{id: oldCard}, "frames": map[string]any{"f": oldFrame}}})
			assertErrorCode(t, request(t, server, "PUT", "/api/layout", body, 409), "layout_conflict")
			if !bytes.Equal(unchanged, penDisk(t, st.Path())) {
				t.Fatal("capture conflict partially wrote cards or frames")
			}
		})
	}
}

func TestCaptureFreshTokenDoesNotReplaceSparsePreimages(t *testing.T) {
	st, server, id := captureFixture(t)
	current := capturePositive(t, server, id)
	disk := penDisk(t, st.Path())
	assertErrorCode(t, request(t, server, "PUT", "/api/layout", captureWrite(t, current.CaptureToken, id, nil, layout.Card{X: 99}), 409), "layout_conflict")
	if !bytes.Equal(disk, penDisk(t, st.Path())) {
		t.Fatal("fresh token bypassed sparse precondition")
	}
}

func TestCaptureConcurrentDisjointWritesHaveOneWinner(t *testing.T) {
	st, server, id := captureFixture(t)
	other := decodeResponse[ticketResponse](t, request(t, server, "POST", "/api/tickets", `{"title":"Other"}`, 201)).Ticket.ID
	current := capturePositive(t, server, id)
	card := current.Layout.Cards[id]
	bodies := []string{captureWrite(t, current.CaptureToken, id, &card, layout.Card{X: 700}), captureWrite(t, current.CaptureToken, other, nil, layout.Card{X: 900})}
	// Sparse preimages are disjoint. Only the whole-board token prevents two winners.
	type result struct {
		status int
		data   []byte
		err    error
	}
	results := make(chan result, 2)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for _, body := range bodies {
		wg.Add(1)
		go func(body string) {
			defer wg.Done()
			<-start
			status, data, err := captureRaw(server, body)
			results <- result{status, data, err}
		}(body)
	}
	close(start)
	wg.Wait()
	close(results)
	winners, conflicts := 0, 0
	for r := range results {
		if r.err != nil {
			t.Fatal(r.err)
		}
		switch r.status {
		case 200:
			winners++
		case 409:
			conflicts++
			assertErrorCode(t, r.data, "layout_conflict")
		default:
			t.Fatalf("unexpected %d: %s", r.status, r.data)
		}
	}
	if winners != 1 || conflicts != 1 {
		t.Fatalf("winners=%d conflicts=%d", winners, conflicts)
	}
	board, err := layout.New(st.Path()).Load(layout.DefaultBoard)
	if err != nil {
		t.Fatal(err)
	}
	if (board.Cards[id].X == 700) == (board.Cards[other].X == 900) {
		t.Fatal("disk must contain exactly one guarded change")
	}
}

func TestCaptureDerivedExpiryAndFreshExternalTicketValidation(t *testing.T) {
	st := newTestStore(t)
	card := fixtureTicket("TKT-01M245HJ7GBGQ8G8JGGY5RW2DY")
	expires := ticket.Now(fixtureTime)
	card.Claim = &ticket.Claim{Actor: testActor.ID, ExpiresAt: &expires}
	saveFixture(t, st, card)
	s := New(st, Options{Actor: testActor})
	var elapsed atomic.Int64
	s.now = func() time.Time { return fixtureTime.Add(time.Duration(elapsed.Load())) }
	server := httptest.NewServer(startAPI(t, s))
	defer server.Close()
	request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Cards: map[string]*layout.Card{card.ID: {X: 10}}}), 200)
	before := capturePositive(t, server, card.ID)
	oldCard := before.Layout.Cards[card.ID]
	disk := penDisk(t, st.Path())
	elapsed.Store(int64(time.Second))
	// Do not refresh the watcher cache first. The request must evaluate expiry now.
	assertErrorCode(t, request(t, server, "PUT", "/api/layout", captureWrite(t, before.CaptureToken, card.ID, &oldCard, layout.Card{X: 80}), 409), "layout_conflict")
	if !bytes.Equal(disk, penDisk(t, st.Path())) {
		t.Fatal("expiry conflict wrote layout")
	}
	s.live.reconcile(true, false)
	after := captureRead(t, server)
	if after.CaptureToken == before.CaptureToken {
		t.Fatal("derived expiry retained capture token")
	}
	elapsed.Store(int64(2 * time.Second))
	s.live.reconcile(true, false)
	if captureRead(t, server).CaptureToken != after.CaptureToken {
		t.Fatal("wall time alone changed token after expiry")
	}
	// External edits before validation must conflict even before a watcher event.
	card.Title = "External title with changed wrapping"
	saveFixture(t, st, card)
	assertErrorCode(t, request(t, server, "PUT", "/api/layout", captureWrite(t, after.CaptureToken, card.ID, &oldCard, layout.Card{X: 90}), 409), "layout_conflict")
	if !bytes.Equal(disk, penDisk(t, st.Path())) {
		t.Fatal("external-edit conflict wrote layout")
	}
}

func TestCaptureLegacyCompatibilityAndReadOnly(t *testing.T) {
	st, server, id := captureFixture(t)
	// No capture field is the legacy mode. This control executes on the old server.
	request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Cards: map[string]*layout.Card{id: {X: 40, Y: 50}}}), 200)
	current := captureRead(t, server)
	card := current.Layout.Cards[id]
	disk := penDisk(t, st.Path())
	readOnly := startTestServer(t, st, true)
	request(t, readOnly, "PUT", "/api/layout", captureWrite(t, current.CaptureToken, id, &card, layout.Card{X: 99}), 403)
	if !bytes.Equal(disk, penDisk(t, st.Path())) {
		t.Fatal("read-only guarded request wrote layout")
	}
}
