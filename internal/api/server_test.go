package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/terva-sh/git-ticket-canvas/internal/layout"
	"github.com/terva-sh/git-ticket/ticket"
)

var testActor = ticket.Actor{ID: "agent:terva/api-test", Name: "API test"}

func newTestStore(t *testing.T) *ticket.Store {
	t.Helper()
	st, err := ticket.Init(t.TempDir(), ticket.InitOptions{Actor: testActor})
	if err != nil {
		t.Fatal(err)
	}
	return st
}

func startTestServer(t *testing.T, st *ticket.Store, readOnly bool) *httptest.Server {
	t.Helper()
	// Serve the built frontend files, not fixture content. Embedding and
	// process shutdown belong to main and are outside these API tests.
	s := httptest.NewServer(New(st, Options{
		Actor: testActor, ReadOnly: readOnly, Assets: os.DirFS("../../web/dist"),
	}).Handler())
	s.Client().Timeout = 5 * time.Second
	t.Cleanup(s.Close)
	return s
}

func request(t *testing.T, s *httptest.Server, method, path, body string, status int) []byte {
	t.Helper()
	req, err := http.NewRequest(method, s.URL+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := s.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != status {
		t.Fatalf("%s %s: status %d, want %d; body: %s", method, path, resp.StatusCode, status, data)
	}
	if strings.HasPrefix(path, "/api/") && !strings.HasPrefix(resp.Header.Get("Content-Type"), "application/json") {
		t.Fatalf("%s %s: expected JSON Content-Type, got %q", method, path, resp.Header.Get("Content-Type"))
	}
	return data
}

func decodeResponse[T any](t *testing.T, data []byte) T {
	t.Helper()
	var value T
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatalf("decode response: %v; body: %s", err, data)
	}
	return value
}

func jsonBody(t *testing.T, value any) string {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func getBoard(t *testing.T, s *httptest.Server) boardResponse {
	t.Helper()
	return decodeResponse[boardResponse](t, request(t, s, "GET", "/api/board", "", http.StatusOK))
}

func assertErrorCode(t *testing.T, data []byte, code string) {
	t.Helper()
	if got := decodeResponse[errBody](t, data); got.Code != code {
		t.Fatalf("error code = %q, want %q; body: %s", got.Code, code, data)
	}
}

func assertBoardUnchanged(t *testing.T, s *httptest.Server, before boardResponse) {
	t.Helper()
	if after := getBoard(t, s); !reflect.DeepEqual(before, after) {
		t.Fatalf("refused write changed board\nbefore: %s\nafter: %s", jsonBody(t, before), jsonBody(t, after))
	}
}

func TestReadEndpoints(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	s := startTestServer(t, st, false)
	html := request(t, s, "GET", "/", "", http.StatusOK)
	if !strings.Contains(string(html), "git-ticket canvas") {
		t.Fatal("missing application title")
	}
	assets := regexp.MustCompile(`(?:src|href)="(\./assets/[^" ]+)"`).FindAllSubmatch(html, -1)
	if len(assets) == 0 {
		t.Fatal("expected at least one bundled asset link")
	}
	for _, asset := range assets {
		path := strings.TrimPrefix(string(asset[1]), ".")
		if data := request(t, s, "GET", path, "", http.StatusOK); len(data) == 0 {
			t.Errorf("empty asset: %s", path)
		}
	}
	board := getBoard(t, s)
	if board.Tickets == nil || len(board.Tickets) != 0 || board.ReadOnly || board.StorePath != st.Path() {
		t.Fatalf("unexpected empty board: %+v", board)
	}
	if board.Board == nil || board.Board.Board != "default" || board.Board.Schema != layout.Schema || len(board.Board.Cards) != 0 {
		t.Fatalf("unexpected layout: %+v", board.Board)
	}
	schema := decodeResponse[schemaBody](t, request(t, s, "GET", "/api/schema", "", http.StatusOK))
	if !reflect.DeepEqual(schema, board.Config) || schema.Actor != testActor {
		t.Fatalf("schema and board config disagree: %+v", schema)
	}
	if !reflect.DeepEqual(schema.Statuses, ticket.Statuses) || !reflect.DeepEqual(schema.Types, ticket.Types) || !reflect.DeepEqual(schema.Priorities, ticket.Priorities) {
		t.Fatalf("schema vocabulary does not match ticket library: %+v", schema)
	}
	for _, from := range ticket.Statuses {
		if !reflect.DeepEqual(schema.Transitions[from], ticket.PermittedTransitions(from)) {
			t.Errorf("transitions from %s do not match ticket library", from)
		}
	}
}

func TestRequestValidation(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, method, path, body, code string
		status                         int
	}{
		{"blank title", "POST", "/api/tickets", `{"title":" "}`, "invalid_field", 422},
		{"unknown field", "POST", "/api/tickets", `{"title":"Bad","unknown":true}`, "bad_request", 400},
		{"malformed JSON", "POST", "/api/tickets", `{"title":`, "bad_request", 400},
		{"board traversal", "GET", "/api/board?board=../escape", "", "invalid_board", 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := startTestServer(t, newTestStore(t), false)
			before := getBoard(t, s)
			assertErrorCode(t, request(t, s, tc.method, tc.path, tc.body, tc.status), tc.code)
			assertBoardUnchanged(t, s, before)
		})
	}
}

func TestTicketLifecycleAndPersistence(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	s := startTestServer(t, st, false)
	created := decodeResponse[ticketResponse](t, request(t, s, "POST", "/api/tickets",
		`{"title":"Smoke ticket","card":{"x":10,"y":20}}`, http.StatusCreated))
	id, rev := created.Ticket.ID, created.Ticket.Revision
	if id == "" || rev == "" || created.Ticket.Title != "Smoke ticket" || created.Ticket.Status != "draft" || created.Ticket.CreatedBy != testActor.Name {
		t.Fatalf("unexpected created ticket: %+v", created.Ticket)
	}
	if created.Layout == nil || created.Layout.Cards[id] != (layout.Card{X: 10, Y: 20}) {
		t.Fatalf("unexpected initial placement: %+v", created.Layout)
	}
	path := "/api/tickets/" + id
	changed := decodeResponse[ticketResponse](t, request(t, s, "PATCH", path, jsonBody(t, patchRequest{
		IfRevision: rev, Ops: []Op{{Op: "setTitle", Title: "Updated smoke"}, {Op: "setPriority", Priority: "high"}},
	}), http.StatusOK)).Ticket
	if changed.Title != "Updated smoke" || changed.Priority != "high" || changed.Revision == rev || changed.UpdatedBy != testActor.Name {
		t.Fatalf("unexpected patched ticket: %+v", changed)
	}
	before := getBoard(t, s)
	assertErrorCode(t, request(t, s, "PATCH", path, jsonBody(t, patchRequest{
		IfRevision: rev, Ops: []Op{{Op: "setTitle", Title: "Must not apply"}},
	}), http.StatusConflict), "stale_revision")
	assertBoardUnchanged(t, s, before)

	position := layout.Card{X: -120.5, Y: 80}
	placed := decodeResponse[layout.Board](t, request(t, s, "PUT", "/api/layout", jsonBody(t, layoutRequest{
		Cards: map[string]*layout.Card{id: &position},
	}), http.StatusOK))
	if placed.Cards[id] != position {
		t.Fatalf("layout update = %+v, want %+v", placed.Cards[id], position)
	}
	s.Close()
	// Reopening both the store and server rules out persistence only in memory.
	reopened, err := ticket.Open(st.Path())
	if err != nil {
		t.Fatal(err)
	}
	s = startTestServer(t, reopened, false)
	persisted := getBoard(t, s)
	if len(persisted.Tickets) != 1 || !reflect.DeepEqual(persisted.Tickets[0], changed) || persisted.Board.Cards[id] != position {
		t.Fatalf("state did not survive reopen: %s", jsonBody(t, persisted))
	}
	assertErrorCode(t, request(t, s, "DELETE", path+"?ifRevision="+url.QueryEscape(rev), "", http.StatusConflict), "stale_revision")
	assertBoardUnchanged(t, s, persisted)
	removed := decodeResponse[struct {
		Removed string `json:"removed"`
	}](t, request(t, s, "DELETE", path+"?force=true&ifRevision="+url.QueryEscape(changed.Revision), "", http.StatusOK))
	if removed.Removed != id {
		t.Fatalf("removed %q, want %q", removed.Removed, id)
	}
	board := getBoard(t, s)
	if len(board.Tickets) != 0 || len(board.Board.Cards) != 0 {
		t.Fatalf("delete left ticket or placement: %s", jsonBody(t, board))
	}
	report, err := reopened.Check(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Errors) != 0 || len(report.Warnings) != 0 {
		t.Fatalf("store integrity check failed: %+v", report)
	}
}

func TestReadOnlyRefusesEveryWrite(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	writer := startTestServer(t, st, false)
	created := decodeResponse[ticketResponse](t, request(t, writer, "POST", "/api/tickets",
		`{"title":"Keep me","card":{"x":10,"y":20}}`, http.StatusCreated))
	writer.Close()
	s := startTestServer(t, st, true)
	before := getBoard(t, s)
	if !before.ReadOnly {
		t.Fatal("board does not report read-only mode")
	}
	path := "/api/tickets/" + created.Ticket.ID
	for _, tc := range []struct{ method, path, body string }{
		{"POST", "/api/tickets", `{"title":"Forbidden"}`},
		{"PATCH", path, jsonBody(t, patchRequest{IfRevision: created.Ticket.Revision, Ops: []Op{{Op: "setTitle", Title: "Forbidden"}}})},
		{"DELETE", path + "?force=true&ifRevision=" + url.QueryEscape(created.Ticket.Revision), ""},
		{"PUT", "/api/layout", jsonBody(t, layoutRequest{Cards: map[string]*layout.Card{created.Ticket.ID: nil}})},
	} {
		t.Run(tc.method, func(t *testing.T) {
			assertErrorCode(t, request(t, s, tc.method, tc.path, tc.body, http.StatusForbidden), "read_only")
			assertBoardUnchanged(t, s, before)
		})
	}
}
