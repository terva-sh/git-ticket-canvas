package api

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/layout"
)

// Schema-3 wire contract, asserted independently of production routing types:
// PUT /api/layout has routing:{pens,ruleOrder,inbox} and expect.routing contains
// the COMPLETE accepted configuration. Board responses expose its fields at top
// level. A null/partial preimage is not an unconditional replacement request.
type penPointWire struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}
type penWire struct {
	Title          string       `json:"title"`
	X              float64      `json:"x"`
	Y              float64      `json:"y"`
	W              float64      `json:"w"`
	H              float64      `json:"h"`
	Color          string       `json:"color"`
	Pin            penPointWire `json:"pin"`
	RequiredLabels []string     `json:"requiredLabels"`
}
type penRoutingWire struct {
	Pens      map[string]penWire `json:"pens"`
	RuleOrder []string           `json:"ruleOrder"`
	Inbox     *penPointWire      `json:"inbox"`
}
type penBoardWire struct {
	Schema int                     `json:"schema"`
	Board  string                  `json:"board"`
	Cards  map[string]layout.Card  `json:"cards"`
	Frames map[string]layout.Frame `json:"frames"`
	penRoutingWire
}
type penEnvelopeWire struct {
	Layout penBoardWire `json:"layout"`
}

func apiPenRouting() penRoutingWire {
	return penRoutingWire{Pens: map[string]penWire{
		"bugs":   {Title: "Frontend bugs", X: 20, Y: 40, W: 620, H: 420, Color: "#759bcc", Pin: penPointWire{40, 80}, RequiredLabels: []string{"frontend", "bug"}},
		"urgent": {Title: "Frontend urgent", X: 800, Y: 40, W: 620, H: 420, Color: "#759bcc", Pin: penPointWire{820, 80}, RequiredLabels: []string{"frontend", "urgent"}},
	}, RuleOrder: []string{"bugs", "urgent"}, Inbox: &penPointWire{-400, 20}}
}
func penReadBoard(t *testing.T, server *httptest.Server) penBoardWire {
	t.Helper()
	return decodeResponse[penEnvelopeWire](t, request(t, server, "GET", "/api/board", "", 200)).Layout
}
func penPutBody(t *testing.T, next, before penRoutingWire) string {
	t.Helper()
	return jsonBody(t, map[string]any{"routing": next, "expect": map[string]any{"routing": before}})
}
func penInstall(t *testing.T, server *httptest.Server) penBoardWire {
	t.Helper()
	before := penReadBoard(t, server)
	if before.Inbox == nil || before.Pens == nil || before.RuleOrder == nil {
		t.Fatal("board response must normalize schema-3 routing before a conditional edit")
	}
	return decodeResponse[penBoardWire](t, request(t, server, "PUT", "/api/layout", penPutBody(t, apiPenRouting(), before.penRoutingWire), 200))
}
func penDisk(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(path, "canvas", "default.yml"))
	if err != nil {
		t.Fatal(err)
	}
	return data
}
func assertPenRouting(t *testing.T, got penBoardWire, want penRoutingWire) {
	t.Helper()
	if got.Schema != 3 || !reflect.DeepEqual(got.penRoutingWire, want) {
		t.Fatalf("routing response mismatch: got %+v, want %+v", got, want)
	}
}

func TestPenAPITransactionSnapshotAndExistingWriters(t *testing.T) {
	st := newTestStore(t)
	server := startTestServer(t, st, false)
	created := decodeResponse[ticketResponse](t, request(t, server, "POST", "/api/tickets", `{"title":"Member","card":{"x":30,"y":40}}`, 201))
	id := created.Ticket.ID
	frame := createFrame(t, server, id)
	before := penReadBoard(t, server)
	// The positive PUT reaches the new request contract even before normalization
	// exists, yielding an explicit unknown-routing-field failure in the red phase.
	if before.Inbox == nil {
		before.penRoutingWire = penRoutingWire{Pens: map[string]penWire{}, RuleOrder: []string{}, Inbox: &penPointWire{}}
	}
	written := decodeResponse[penBoardWire](t, request(t, server, "PUT", "/api/layout", penPutBody(t, apiPenRouting(), before.penRoutingWire), 200))
	assertPenRouting(t, written, apiPenRouting())
	if !reflect.DeepEqual(written.Cards, before.Cards) || !reflect.DeepEqual(written.Frames, before.Frames) {
		t.Fatal("routing write changed cards or frames")
	}
	assertPenRouting(t, penReadBoard(t, server), apiPenRouting())
	// Sparse card saves and existing frame transactions must retain all routing.
	request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Cards: map[string]*layout.Card{id: {X: 90, Y: 40}}}), 200)
	renamed := frame
	renamed.Title = "Next release"
	request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Frames: map[string]*layout.Frame{"f": &renamed}, Expect: &layout.Expectations{Frames: map[string]*layout.Frame{"f": &frame}}}), 200)
	request(t, server, "POST", "/api/tickets", `{"title":"New positioned ticket","card":{"x":100,"y":200}}`, 201)
	assertPenRouting(t, penReadBoard(t, server), apiPenRouting())
	request(t, server, "DELETE", "/api/tickets/"+id+"?force=true&ifRevision="+created.Ticket.Revision, "", 200)
	after := penReadBoard(t, server)
	assertPenRouting(t, after, apiPenRouting())
	if len(after.Frames["f"].Members) != 0 {
		t.Fatal("deletion failed membership cleanup")
	}
	// Read the actual renderer output, not a DTO cached before a sparse rewrite.
	loaded, err := layout.New(st.Path()).Load(layout.DefaultBoard)
	if err != nil {
		t.Fatal(err)
	}
	var disk penBoardWire
	if err := json.Unmarshal([]byte(jsonBody(t, loaded)), &disk); err != nil {
		t.Fatal(err)
	}
	assertPenRouting(t, disk, apiPenRouting())
}

func TestPenAPIStaleRoutingAndUnpinAreAtomic(t *testing.T) {
	st := newTestStore(t)
	server := startTestServer(t, st, false)
	created := decodeResponse[ticketResponse](t, request(t, server, "POST", "/api/tickets", `{"title":"Member","card":{"x":30,"y":40}}`, 201))
	id := created.Ticket.ID
	createFrame(t, server, id)
	initial := penInstall(t, server)
	next := apiPenRouting()
	next.RuleOrder = []string{"urgent", "bugs"}
	request(t, server, "PUT", "/api/layout", penPutBody(t, next, initial.penRoutingWire), 200)
	before := penDisk(t, st.Path())
	// A stale configuration must reject even an otherwise valid card write in
	// the same transaction, leaving the entire board unchanged.
	body := map[string]any{"routing": apiPenRouting(), "cards": map[string]any{id: map[string]int{"x": 500, "y": 600}},
		"expect": map[string]any{"routing": initial.penRoutingWire, "cards": map[string]any{id: map[string]int{"x": 30, "y": 40}}}}
	assertErrorCode(t, request(t, server, "PUT", "/api/layout", jsonBody(t, body), 409), "layout_conflict")
	if !reflect.DeepEqual(penDisk(t, st.Path()), before) {
		t.Fatal("stale routing partially wrote cards")
	}
	request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Cards: map[string]*layout.Card{id: {X: 70, Y: 80}}}), 200)
	before = penDisk(t, st.Path())
	assertErrorCode(t, request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Cards: map[string]*layout.Card{id: nil}, Expect: &layout.Expectations{Cards: map[string]*layout.Card{id: {X: 30, Y: 40}}}}), 409), "layout_conflict")
	if !reflect.DeepEqual(penDisk(t, st.Path()), before) {
		t.Fatal("stale unpin erased newer placement")
	}
	request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Cards: map[string]*layout.Card{id: nil}, Expect: &layout.Expectations{Cards: map[string]*layout.Card{id: {X: 70, Y: 80}}}}), 200)
	after := penReadBoard(t, server)
	assertPenRouting(t, after, next)
	if _, ok := after.Cards[id]; ok {
		t.Fatal("unpin retained manual placement")
	}
	if !reflect.DeepEqual(after.Frames["f"].Members, []string{id}) {
		t.Fatal("unpin changed membership")
	}
}

func TestPenAPIInvalidRoutingRejectsWithoutWrites(t *testing.T) {
	st := newTestStore(t)
	server := startTestServer(t, st, false)
	initial := penInstall(t, server)
	before := penDisk(t, st.Path())
	for _, variant := range []string{"empty labels", "null labels", "blank labels", "missing order", "duplicate order", "unknown order", "null Inbox", "missing expectation", "partial expectation", "null expectation", "unknown pen field", "null routing", "partial Inbox", "partial pin", "null coordinate", "partial pen expectation", "unknown pin field"} {
		t.Run(variant, func(t *testing.T) {
			next := apiPenRouting()
			var body map[string]any
			if err := json.Unmarshal([]byte(penPutBody(t, next, initial.penRoutingWire)), &body); err != nil {
				t.Fatal(err)
			}
			routing := body["routing"].(map[string]any)
			bugs := routing["pens"].(map[string]any)["bugs"].(map[string]any)
			switch variant {
			case "null routing":
				body["routing"] = nil
			case "partial Inbox":
				routing["inbox"] = map[string]any{"x": 0}
			case "partial pin":
				bugs["pin"] = map[string]any{"x": 0}
			case "null coordinate":
				bugs["x"] = nil
			case "unknown pin field":
				bugs["pin"].(map[string]any)["future"] = true
			case "partial pen expectation":
				expected := body["expect"].(map[string]any)["routing"].(map[string]any)
				delete(expected["pens"].(map[string]any)["bugs"].(map[string]any), "x")
			case "empty labels":
				bugs["requiredLabels"] = []string{}
			case "null labels":
				bugs["requiredLabels"] = nil
			case "blank labels":
				bugs["requiredLabels"] = []string{" "}
			case "missing order":
				routing["ruleOrder"] = []string{"bugs"}
			case "duplicate order":
				routing["ruleOrder"] = []string{"bugs", "bugs", "urgent"}
			case "unknown order":
				routing["ruleOrder"] = []string{"bugs", "urgent", "ghost"}
			case "null Inbox":
				routing["inbox"] = nil
			case "missing expectation":
				delete(body, "expect")
			case "partial expectation":
				body["expect"] = map[string]any{"routing": map[string]any{"pens": next.Pens}}
			case "null expectation":
				body["expect"] = map[string]any{"routing": nil}
			case "unknown pen field":
				bugs["future"] = true
			}
			request(t, server, "PUT", "/api/layout", jsonBody(t, body), 400)
			if !reflect.DeepEqual(penDisk(t, st.Path()), before) {
				t.Fatal("invalid routing changed disk")
			}
			assertPenRouting(t, penReadBoard(t, server), initial.penRoutingWire)
		})
	}
}

func TestPenAPINormalizesWritesAndAcceptsReturnedPreimage(t *testing.T) {
	st := newTestStore(t)
	server := startTestServer(t, st, false)
	initial := penInstall(t, server)
	next := apiPenRouting()
	bugs := next.Pens["bugs"]
	bugs.X = 20.1234
	bugs.Pin.X = 40.1234
	bugs.RequiredLabels = []string{"Frontend", "frontend", "frontend", "two words", "comma,label", "unused-label"}
	next.Pens["bugs"] = bugs
	next.Inbox.X = -400.1234
	out := decodeResponse[penBoardWire](t, request(t, server, "PUT", "/api/layout", penPutBody(t, next, initial.penRoutingWire), 200))
	bugs.X, bugs.Pin.X = 20.12, 40.12
	bugs.RequiredLabels = []string{"Frontend", "frontend", "two words", "comma,label", "unused-label"}
	next.Pens["bugs"] = bugs
	next.Inbox.X = -400.12
	assertPenRouting(t, out, next)
	assertPenRouting(t, penReadBoard(t, server), next)
	loaded, err := layout.New(st.Path()).Load(layout.DefaultBoard)
	if err != nil {
		t.Fatal(err)
	}
	disk := decodeResponse[penBoardWire](t, []byte(jsonBody(t, loaded)))
	assertPenRouting(t, disk, next)
	// The exact response must be usable as the next conditional preimage.
	request(t, server, "PUT", "/api/layout", penPutBody(t, next, out.penRoutingWire), 200)
}

func TestPenAPIConcurrentInsertAndReorderHaveOneWinner(t *testing.T) {
	st := newTestStore(t)
	server := startTestServer(t, st, false)
	initial := penInstall(t, server)
	insert := apiPenRouting()
	insert.Pens["third"] = insert.Pens["bugs"]
	insert.RuleOrder = append(insert.RuleOrder, "third")
	reorder := apiPenRouting()
	reorder.RuleOrder = []string{"urgent", "bugs"}
	bodies := []string{penPutBody(t, insert, initial.penRoutingWire), penPutBody(t, reorder, initial.penRoutingWire)}
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
			req, err := http.NewRequest("PUT", server.URL+"/api/layout", strings.NewReader(body))
			if err != nil {
				results <- result{err: err}
				return
			}
			res, err := server.Client().Do(req)
			if err != nil {
				results <- result{err: err}
				return
			}
			defer res.Body.Close()
			data, err := io.ReadAll(res.Body)
			results <- result{status: res.StatusCode, data: data, err: err}
		}(body)
	}
	close(start)
	wg.Wait()
	close(results)
	counts := map[int]int{}
	var accepted penBoardWire
	for r := range results {
		if r.err != nil {
			t.Fatal(r.err)
		}
		counts[r.status]++
		if r.status == 200 {
			if err := json.Unmarshal(r.data, &accepted); err != nil {
				t.Fatal(err)
			}
		}
		if r.status == 409 {
			var body errBody
			if err := json.Unmarshal(r.data, &body); err != nil || body.Code != "layout_conflict" {
				t.Fatalf("unexpected conflict: %s", r.data)
			}
		}
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatalf("concurrent routing results: %v", counts)
	}
	assertPenRouting(t, penReadBoard(t, server), accepted.penRoutingWire)
	if !reflect.DeepEqual(accepted.penRoutingWire, insert) && !reflect.DeepEqual(accepted.penRoutingWire, reorder) {
		t.Fatal("merged partial routing transaction")
	}
}

func TestPenAPIReorderInvalidatesETagAndReadOnlyPreservesDisk(t *testing.T) {
	st := newTestStore(t)
	server := startTestServer(t, st, false)
	initial := penInstall(t, server)
	res, err := server.Client().Get(server.URL + "/api/board")
	if err != nil {
		t.Fatal(err)
	}
	etag := res.Header.Get("ETag")
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("board status = %d", res.StatusCode)
	}
	if etag == "" {
		t.Fatal("missing ETag")
	}
	next := apiPenRouting()
	next.RuleOrder = []string{"urgent", "bugs"}
	request(t, server, "PUT", "/api/layout", penPutBody(t, next, initial.penRoutingWire), 200)
	req, err := http.NewRequest("GET", server.URL+"/api/board", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("If-None-Match", etag)
	changed, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer changed.Body.Close()
	if changed.StatusCode != 200 || changed.Header.Get("ETag") == etag {
		t.Fatal("routing reorder did not invalidate cached representation")
	}
	var envelope penEnvelopeWire
	if err := json.NewDecoder(changed.Body).Decode(&envelope); err != nil {
		t.Fatal(err)
	}
	assertPenRouting(t, envelope.Layout, next)
	before := penDisk(t, st.Path())
	readOnly := startTestServer(t, st, true)
	assertErrorCode(t, request(t, readOnly, "PUT", "/api/layout", penPutBody(t, initial.penRoutingWire, next), 403), "read_only")
	if !reflect.DeepEqual(penDisk(t, st.Path()), before) {
		t.Fatal("read-only changed routing")
	}
}
