package api

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/terva-sh/git-ticket-canvas/internal/layout"
	"github.com/terva-sh/git-ticket/ticket"
)

var fixtureTime = time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)

func boardRead(h http.Handler, path string, validators ...string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, path, nil)
	for _, v := range validators {
		r.Header.Add("If-None-Match", v)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func assertFullBoard(t *testing.T, w *httptest.ResponseRecorder) boardResponse {
	t.Helper()
	if w.Code != http.StatusOK {
		t.Fatalf("board status = %d: %s", w.Code, w.Body.String())
	}
	if got, want := w.Header().Get("ETag"), fmt.Sprintf(`"%x"`, sha256.Sum256(w.Body.Bytes())); got != want {
		t.Fatalf("ETag = %q, want exact response hash %q", got, want)
	}
	if got := w.Header().Get("Cache-Control"); got != "private, no-cache" {
		t.Fatalf("Cache-Control = %q", got)
	}
	if got := w.Header().Get("Content-Type"); got != "application/json; charset=utf-8" {
		t.Fatalf("Content-Type = %q", got)
	}
	return decodeResponse[boardResponse](t, w.Body.Bytes())
}

func fixtureTicket(id string) *ticket.Ticket {
	return &ticket.Ticket{
		Schema: ticket.SchemaVersion, ID: id, Title: "Conditional read fixture",
		Type: "task", Status: "ready", Priority: "normal", BlocksOn: "none",
		CreatedAt: ticket.Now(fixtureTime), UpdatedAt: ticket.Now(fixtureTime),
		Body: ticket.Body{Description: "A board card with a description."},
	}
}

// Direct fixture writes model external edits, including edits that do not pass
// through the API. These paths always belong to the test's temporary store.
func saveFixture(tb testing.TB, st *ticket.Store, card *ticket.Ticket) {
	tb.Helper()
	path := filepath.Join(st.StatusDir(card.Status), card.ID+".md")
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		tb.Fatal(err)
	}
	if err := os.WriteFile(path, ticket.Render(card), 0644); err != nil {
		tb.Fatal(err)
	}
}

func TestBoardConditionalValidators(t *testing.T) {
	t.Parallel()
	s := New(newTestStore(t), Options{Actor: testActor})
	h := s.Handler()
	first := boardRead(h, "/api/board")
	assertFullBoard(t, first)
	etag := first.Header().Get("ETag")
	for _, tc := range []struct {
		name   string
		values []string
		match  bool
	}{
		{"absent", nil, false},
		{"strong", []string{etag}, true},
		{"weak", []string{"W/" + etag}, true},
		{"wildcard", []string{" \t*\t "}, true},
		{"stale", []string{`"stale"`}, false},
		{"list", []string{`"old", W/` + etag + `, "other"`}, true},
		{"multiple lines", []string{`"old"`, "W/" + etag}, true},
		{"empty list elements", []string{", , " + etag + ","}, true},
		{"quoted comma", []string{`"old,tag", ` + etag}, true},
		{"unquoted", []string{etag[1 : len(etag)-1]}, false},
		{"lowercase weak", []string{"w/" + etag}, false},
		{"broken quote", []string{etag[:len(etag)-1]}, false},
		{"trailing garbage", []string{etag + " garbage"}, false},
		{"invalid list member", []string{etag + ", broken"}, false},
		{"invalid first member", []string{"broken, " + etag}, false},
		{"missing separator", []string{etag + " " + etag}, false},
		{"wildcard list", []string{"*, " + etag}, false},
		{"weak wildcard", []string{"W/*"}, false},
		{"space in tag", []string{`"bad tag", ` + etag}, false},
		{"control in tag", []string{"\"bad\x7ftag\", " + etag}, false},
		{"empty tag", []string{`""`}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := boardRead(h, "/api/board", tc.values...)
			if w.Header().Get("ETag") != etag || w.Header().Get("Cache-Control") != first.Header().Get("Cache-Control") {
				t.Fatalf("validator/cache metadata changed: %v", w.Header())
			}
			if tc.match {
				if w.Code != http.StatusNotModified || w.Body.Len() != 0 || w.Header().Get("Content-Length") != "" {
					t.Fatalf("expected bodyless 304, got %d %q %v", w.Code, w.Body.String(), w.Header())
				}
			} else {
				assertFullBoard(t, w)
				if !bytes.Equal(first.Body.Bytes(), w.Body.Bytes()) {
					t.Fatal("unchanged full read was not deterministic")
				}
			}
		})
	}
	// A condition does not bypass validation or make an invalid board exist.
	w := boardRead(h, "/api/board?board=../escape", "*")
	if w.Code != 400 || w.Header().Get("ETag") != "" {
		t.Fatalf("invalid board conditional read: %d %v", w.Code, w.Header())
	}
}

func TestBoardValidatorObservableChanges(t *testing.T) {
	t.Parallel()
	for _, change := range []string{"body", "layout", "boards", "config", "readOnly", "actor", "storePath", "readiness", "short ID", "delete"} {
		t.Run(change, func(t *testing.T) {
			st := newTestStore(t)
			card := fixtureTicket("TKT-01M245HJ7GBGQ8G8JGGY5RW2DY")
			saveFixture(t, st, card)
			s := New(st, Options{Actor: testActor})
			s.now = func() time.Time { return fixtureTime }
			if change == "readiness" {
				card.Dependencies = []string{"TKT-01M245KD7WVBWTWMB86C8CE6CH"}
				saveFixture(t, st, card)
				saveFixture(t, st, fixtureTicket(card.Dependencies[0]))
			}
			before := boardRead(s.Handler(), "/api/board")
			old := assertFullBoard(t, before)
			switch change {
			case "body":
				card.Body = ticket.Body{Description: "Changed description", ImplementationPlan: "New plan", Summary: "New summary", AcceptanceCriteria: "- [x] Works", DefinitionOfDone: "- [ ] Checked", Notes: "New note", Comments: "New comment"}
				saveFixture(t, st, card)
			case "layout", "boards":
				name := layout.DefaultBoard
				if change == "boards" {
					name = "another"
				}
				if _, err := s.layout.Update(name, map[string]*layout.Card{card.ID: {X: 123, Y: 456}}); err != nil {
					t.Fatal(err)
				}
			case "config":
				cfg := st.Config()
				cfg.Labels = []string{"new-label"}
				cfg.Milestones = []string{"release"}
				if err := os.WriteFile(filepath.Join(st.Path(), "config.yml"), ticket.RenderConfig(cfg), 0644); err != nil {
					t.Fatal(err)
				}
			case "readOnly":
				s.readOnly = true
			case "actor":
				s.actor = ticket.Actor{ID: "agent:other", Name: "Other"}
			case "storePath":
				other := newTestStore(t)
				saveFixture(t, other, card)
				s = New(other, Options{Actor: testActor})
			case "readiness":
				dependency := fixtureTicket(card.Dependencies[0])
				if err := os.Remove(filepath.Join(st.StatusDir(dependency.Status), dependency.ID+".md")); err != nil {
					t.Fatal(err)
				}
				dependency.Status = "done"
				saveFixture(t, st, dependency)
			case "short ID":
				saveFixture(t, st, fixtureTicket("TKT-01M245HJ7GBGQ8G8JGGY5RW2DZ"))
			case "delete":
				if err := os.Remove(filepath.Join(st.StatusDir(card.Status), card.ID+".md")); err != nil {
					t.Fatal(err)
				}
			}
			w := boardRead(s.Handler(), "/api/board", before.Header().Get("ETag"))
			after := assertFullBoard(t, w)
			if w.Header().Get("ETag") == before.Header().Get("ETag") {
				t.Fatal("observable change retained validator")
			}
			if change == "readiness" || change == "short ID" {
				var got Ticket
				for _, x := range after.Tickets {
					if x.ID == card.ID {
						got = x
					}
				}
				if got.Revision != old.Tickets[0].Revision {
					t.Fatal("derived change changed original file revision")
				}
				if change == "readiness" && (!got.Readiness.Ready || reflect.DeepEqual(got.Readiness, old.Tickets[0].Readiness)) {
					t.Fatal("readiness did not change")
				}
				if change == "short ID" && got.Short == old.Tickets[0].Short {
					t.Fatal("short ID did not change")
				}
			} else if change != "body" && change != "delete" && !reflect.DeepEqual(old.Tickets, after.Tickets) {
				t.Fatal("metadata-only change changed ticket records")
			}
			if again := boardRead(s.Handler(), "/api/board", w.Header().Get("ETag")); again.Code != 304 || again.Body.Len() != 0 {
				t.Fatal("new validator did not revalidate")
			}
		})
	}
}

func TestConfigRefreshAgreesAcrossBoardSchemaAndMutations(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	s := startTestServer(t, st, false)
	// Change configuration after server construction, not before its store opens.
	cfg := st.Config()
	cfg.Series = []string{"TKT", "BUG"}
	cfg.Labels = []string{"new-label"}
	if err := os.WriteFile(filepath.Join(st.Path(), "config.yml"), ticket.RenderConfig(cfg), 0644); err != nil {
		t.Fatal(err)
	}
	board := decodeResponse[boardResponse](t, request(t, s, "GET", "/api/board", "", 200))
	schema := decodeResponse[schemaBody](t, request(t, s, "GET", "/api/schema", "", 200))
	if !reflect.DeepEqual(board.Config, schema) || !reflect.DeepEqual(schema.Series, cfg.Series) {
		t.Fatalf("board/schema configuration mismatch: %+v / %+v", board.Config, schema)
	}
	created := decodeResponse[ticketResponse](t, request(t, s, "POST", "/api/tickets", `{"title":"Fresh series","series":"BUG","labels":["new-label"]}`, 201))
	if !strings.HasPrefix(created.Ticket.ID, "BUG-") {
		t.Fatalf("new series was not used: %s", created.Ticket.ID)
	}
	patched := decodeResponse[ticketResponse](t, request(t, s, "PATCH", "/api/tickets/"+created.Ticket.ID,
		jsonBody(t, patchRequest{IfRevision: created.Ticket.Revision, Ops: []Op{{Op: "setTitle", Title: "Edited fresh series"}}}), 200))
	if patched.Ticket.Title != "Edited fresh series" {
		t.Fatal("patch did not use the refreshed series configuration")
	}
	request(t, s, "DELETE", "/api/tickets/"+patched.Ticket.ID+"?ifRevision="+patched.Ticket.Revision, "", 200)
}

func TestBoardClaimExpiryUsesOneInstant(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	expires := ticket.Now(fixtureTime)
	for _, id := range []string{"TKT-01M245HJ7GBGQ8G8JGGY5RW2DY", "TKT-01M245KD7WVBWTWMB86C8CE6CH"} {
		card := fixtureTicket(id)
		card.Claim = &ticket.Claim{Actor: testActor.ID, ExpiresAt: &expires}
		saveFixture(t, st, card)
	}
	s := New(st, Options{Actor: testActor})
	calls := 0
	now := fixtureTime
	s.now = func() time.Time {
		calls++
		value := now
		now = now.Add(time.Second)
		return value
	}
	first := boardRead(s.Handler(), "/api/board")
	before := assertFullBoard(t, first)
	if len(before.Tickets) != 2 {
		t.Fatalf("claim fixture has %d tickets, want 2", len(before.Tickets))
	}
	if calls != 1 {
		t.Fatalf("clock calls per board = %d, want 1", calls)
	}
	for _, card := range before.Tickets {
		if card.Claim.Expired || card.Readiness.Ready || card.Readiness.Reason != ticket.ReasonClaimed {
			t.Fatalf("claim at expiry inconsistent: %+v", card)
		}
	}
	second := boardRead(s.Handler(), "/api/board", first.Header().Get("ETag"))
	after := assertFullBoard(t, second)
	if calls != 2 {
		t.Fatalf("clock calls for two boards = %d", calls)
	}
	for i, card := range after.Tickets {
		if !card.Claim.Expired || !card.Readiness.Ready || card.Revision != before.Tickets[i].Revision {
			t.Fatalf("expiry did not change derived state only: %+v", card)
		}
	}
	if w := boardRead(s.Handler(), "/api/board", second.Header().Get("ETag")); w.Code != 304 {
		t.Fatalf("time passing without observable change = %d", w.Code)
	}
}

func TestBoardConditionalHTTP(t *testing.T) {
	t.Parallel()
	s := httptest.NewServer(New(newTestStore(t), Options{Actor: testActor}).Handler())
	defer s.Close()
	etag := ""
	for _, method := range []string{http.MethodGet, http.MethodGet, http.MethodHead} {
		r, err := http.NewRequest(method, s.URL+"/api/board", nil)
		if err != nil {
			t.Fatal(err)
		}
		r.Header.Set("If-None-Match", etag)
		resp, err := s.Client().Do(r)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		if etag == "" {
			if resp.StatusCode != 200 || len(body) == 0 {
				t.Fatalf("full response: %d, %d bytes", resp.StatusCode, len(body))
			}
		} else if resp.StatusCode != 304 || len(body) != 0 || resp.Header.Get("ETag") != etag {
			t.Fatalf("conditional %s: %d, %d bytes, headers %v", method, resp.StatusCode, len(body), resp.Header)
		}
		etag = resp.Header.Get("ETag")
		if etag == "" || resp.Header.Get("Cache-Control") != "private, no-cache" {
			t.Fatalf("missing response metadata: %v", resp.Header)
		}
	}
}

func TestBoardConditionalReadStillRecomputes(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	h := New(st, Options{Actor: testActor}).Handler()
	first := boardRead(h, "/api/board")
	assertFullBoard(t, first)
	path := filepath.Join(st.Path(), "config.yml")
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("schema: [invalid"), 0644); err != nil {
		t.Fatal(err)
	}
	w := boardRead(h, "/api/board", first.Header().Get("ETag"))
	if w.Code == 200 || w.Code == 304 || w.Header().Get("ETag") != "" {
		t.Fatalf("invalid config reused cached success: %d %v", w.Code, w.Header())
	}
	if err := os.WriteFile(path, original, 0644); err != nil {
		t.Fatal(err)
	}
	if w := boardRead(h, "/api/board", first.Header().Get("ETag")); w.Code != 304 {
		t.Fatalf("restored config did not recover: %d %s", w.Code, w.Body.String())
	}
}

func TestBoardValidatorsSeparateBoards(t *testing.T) {
	t.Parallel()
	s := New(newTestStore(t), Options{Actor: testActor})
	h := s.Handler()
	first := boardRead(h, "/api/board")
	assertFullBoard(t, first)
	other := boardRead(h, "/api/board?board=other", first.Header().Get("ETag"))
	assertFullBoard(t, other)
	if first.Header().Get("ETag") == other.Header().Get("ETag") {
		t.Fatal("empty named boards share a validator")
	}
	if w := boardRead(h, "/api/board?board=default", first.Header().Get("ETag")); w.Code != 304 {
		t.Fatal("default board alias changed representation")
	}
	if w := boardRead(h, "/api/board", other.Header().Get("ETag")); w.Code != 200 {
		t.Fatal("other board validator suppressed full read")
	}
}
