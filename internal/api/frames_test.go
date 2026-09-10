package api

import (
	"fmt"
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

func apiFrame(ids ...string) layout.Frame {
	return layout.Frame{Title: "Delivery", X: 10, Y: 20, W: 620, H: 420, Color: "#759bcc", Members: append([]string{}, ids...)}
}
func createFrame(t *testing.T, server *httptest.Server, id string) layout.Frame {
	t.Helper()
	f := apiFrame(id)
	b := decodeResponse[layout.Board](t, request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Frames: map[string]*layout.Frame{"f": &f}, Expect: &layout.Expectations{Frames: map[string]*layout.Frame{"f": nil}}}), http.StatusOK))
	return b.Frames["f"]
}
func TestFrameAPIYAMLSensitiveNamesSurviveSnapshotAndReload(t *testing.T) {
	for _, name := range []string{"null", "Null", "NULL", "-"} {
		t.Run(name, func(t *testing.T) {
			st := newTestStore(t)
			server := startTestServer(t, st, false)
			created := decodeResponse[ticketResponse](t, request(t, server, "POST", "/api/tickets", `{"title":"Member"}`, http.StatusCreated))
			f := apiFrame(created.Ticket.ID)
			written := decodeResponse[layout.Board](t, request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{
				Board: name, Frames: map[string]*layout.Frame{name: &f},
				Expect: &layout.Expectations{Frames: map[string]*layout.Frame{name: nil}},
			}), http.StatusOK))
			for range 2 {
				board := decodeResponse[boardResponse](t, request(t, server, "GET", "/api/board?board="+name, "", http.StatusOK))
				if !reflect.DeepEqual(board.Board, &written) {
					t.Fatalf("live snapshot lost layout: got %+v, want %+v", board.Board, written)
				}
				loaded, err := layout.New(st.Path()).Load(name)
				if err != nil || !reflect.DeepEqual(loaded, &written) {
					t.Fatalf("disk reload lost layout: got %+v, error %v", loaded, err)
				}
				// A later write must preserve membership rather than deleting
				// the frame dropped by a previous snapshot decode.
				request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Board: name, Cards: map[string]*layout.Card{}}), http.StatusOK)
			}
			getBoard(t, server) // A sensitive name must not poison other boards.
		})
	}
}

func TestFrameAPITransactionConflictsAndCleanup(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	server := startTestServer(t, st, false)
	created := decodeResponse[ticketResponse](t, request(t, server, "POST", "/api/tickets", `{"title":"Member","card":{"x":30,"y":40}}`, 201))
	id := created.Ticket.ID
	f := createFrame(t, server, id)
	initial := getBoard(t, server)
	if initial.Board.Frames["f"].Title != f.Title {
		t.Fatal("API response preceded live frame snapshot")
	}
	moved := f
	moved.X += 100
	req := layoutRequest{Cards: map[string]*layout.Card{id: {X: 130, Y: 40}}, Frames: map[string]*layout.Frame{"f": &moved}, Expect: &layout.Expectations{Cards: map[string]*layout.Card{id: {X: 30, Y: 40}}, Frames: map[string]*layout.Frame{"f": &f}}}
	after := decodeResponse[layout.Board](t, request(t, server, "PUT", "/api/layout", jsonBody(t, req), 200))
	if after.Cards[id].X != 130 || after.Frames["f"].X != moved.X {
		t.Fatal("partial move")
	}
	before := getBoard(t, server)
	assertErrorCode(t, request(t, server, "PUT", "/api/layout", jsonBody(t, req), 409), "layout_conflict")
	assertBoardUnchanged(t, server, before)
	// A stale frame must report conflict before validation of a proposed invalid frame.
	bad := moved
	bad.Color = "invalid"
	req.Frames["f"] = &bad
	req.Cards = nil
	req.Expect.Cards = nil
	assertErrorCode(t, request(t, server, "PUT", "/api/layout", jsonBody(t, req), 409), "layout_conflict")
	assertBoardUnchanged(t, server, before)
	// Undo restores automatic placement without removing explicit membership.
	request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Cards: map[string]*layout.Card{id: nil}, Frames: map[string]*layout.Frame{"f": &f}, Expect: &layout.Expectations{Cards: map[string]*layout.Card{id: {X: 130, Y: 40}}, Frames: map[string]*layout.Frame{"f": &moved}}}), 200)
	automatic := getBoard(t, server)
	if _, ok := automatic.Board.Cards[id]; ok {
		t.Fatal("undo retained manual position")
	}
	if !reflect.DeepEqual(automatic.Board.Frames["f"].Members, []string{id}) {
		t.Fatal("undo removed membership")
	}
	// Ticket deletion has a separate membership cleanup path.
	request(t, server, "DELETE", "/api/tickets/"+id+"?force=true&ifRevision="+created.Ticket.Revision, "", 200)
	deleted := getBoard(t, server)
	if len(deleted.Board.Frames["f"].Members) != 0 {
		t.Fatal("delete left membership")
	}
	// A deleted ticket cannot be revived as a layout record by a stale history entry.
	clean := deleted.Board.Frames["f"]
	assertErrorCode(t, request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Cards: map[string]*layout.Card{id: {X: 30, Y: 40}}, Frames: map[string]*layout.Frame{"f": &f}, Expect: &layout.Expectations{Cards: map[string]*layout.Card{id: nil}, Frames: map[string]*layout.Frame{"f": &clean}}}), 409), "layout_conflict")
	assertBoardUnchanged(t, server, deleted)
}

func TestFrameAPIValidationAndExternalDanglingCleanup(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	server := startTestServer(t, st, false)
	missing := "TKT-01M24411DDC98WXKT2MY2FMHQN"
	f := apiFrame(missing)
	// Membership cannot reference a missing ticket even without manual coordinates.
	assertErrorCode(t, request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Frames: map[string]*layout.Frame{"f": &f}, Expect: &layout.Expectations{Frames: map[string]*layout.Frame{"f": nil}}}), 409), "layout_conflict")
	if len(getBoard(t, server).Board.Frames) != 0 {
		t.Fatal("missing identity partially saved")
	}
	for _, body := range []string{
		`{"frames":{"f":null}}`,
		`{"frames":{"f":null},"expect":{"frames":{}}}`,
		`{"cards":{"` + missing + `":null},"frames":{},"expect":{"cards":{}}}`,
		`{"frames":{"f":{"title":"x","x":0,"y":0,"w":1,"h":1,"color":"#759bcc","members":[],"future":true}},"expect":{"frames":{"f":null}}}`,
	} {
		request(t, server, "PUT", "/api/layout", body, 400)
	}
	// An external writer may leave valid IDs whose tickets were removed. Loading
	// those frames stays possible, and cleanup does not require resurrecting IDs.
	ls := layout.New(st.Path())
	b := layout.Empty(layout.DefaultBoard)
	b.Frames["f"] = f
	if err := ls.Save(b); err != nil {
		t.Fatal(err)
	}
	eventually(t, func() bool { return len(getBoard(t, server).Board.Frames) == 1 })
	clean := f
	clean.Members = []string{}
	request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Frames: map[string]*layout.Frame{"f": &clean}, Expect: &layout.Expectations{Frames: map[string]*layout.Frame{"f": &f}}}), 200)
	if len(getBoard(t, server).Board.Frames["f"].Members) != 0 {
		t.Fatal("dangling member cleanup failed")
	}
	// Frame deletion also permits dangling membership cleanup.
	if err := ls.Save(b); err != nil {
		t.Fatal(err)
	}
	request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Frames: map[string]*layout.Frame{"f": nil}, Expect: &layout.Expectations{Frames: map[string]*layout.Frame{"f": &f}}}), 200)
}

func TestFrameAPIExtraReadSetAndConcurrentWrites(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	server := startTestServer(t, st, false)
	created := decodeResponse[ticketResponse](t, request(t, server, "POST", "/api/tickets", `{"title":"Member"}`, 201))
	id := created.Ticket.ID
	f := createFrame(t, server, id)
	independent := apiFrame()
	independent.Title = "Other frame"
	request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Frames: map[string]*layout.Frame{"other": &independent}, Expect: &layout.Expectations{Frames: map[string]*layout.Frame{"other": nil}}}), 200)
	changed := independent
	changed.Title = "Renamed"
	request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Frames: map[string]*layout.Frame{"other": &changed}, Expect: &layout.Expectations{Frames: map[string]*layout.Frame{"other": &independent}}}), 200)
	renamed := f
	renamed.Title = "New name"
	assertErrorCode(t, request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Frames: map[string]*layout.Frame{"f": &renamed}, Expect: &layout.Expectations{Frames: map[string]*layout.Frame{"f": &f, "other": &independent}}}), 409), "layout_conflict")
	// Omitting the unrelated read permits the operation. Two identical read sets
	// racing at the save boundary still produce only one accepted grouped edit.
	body := jsonBody(t, layoutRequest{Cards: map[string]*layout.Card{id: {X: 30, Y: 40}}, Frames: map[string]*layout.Frame{"f": &renamed}, Expect: &layout.Expectations{Cards: map[string]*layout.Card{id: nil}, Frames: map[string]*layout.Frame{"f": &f}}})
	var wg sync.WaitGroup
	results := make(chan int, 2)
	failures := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req, err := http.NewRequest("PUT", server.URL+"/api/layout", strings.NewReader(body))
			if err != nil {
				failures <- err
				return
			}
			res, err := server.Client().Do(req)
			if err != nil {
				failures <- err
				return
			}
			defer res.Body.Close()
			results <- res.StatusCode
		}()
	}
	wg.Wait()
	close(results)
	close(failures)
	for err := range failures {
		t.Fatal(err)
	}
	counts := map[int]int{}
	for status := range results {
		counts[status]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatalf("concurrent responses: %v", counts)
	}
}

func TestFrameAPIReadOnlyAndUnknownFieldsKeepSnapshot(t *testing.T) {
	t.Parallel()
	st := newTestStore(t)
	ls := layout.New(st.Path())
	b := layout.Empty(layout.DefaultBoard)
	f := apiFrame()
	b.Frames["f"] = f
	if err := ls.Save(b); err != nil {
		t.Fatal(err)
	}
	server := startTestServer(t, st, true)
	before := getBoard(t, server)
	assertErrorCode(t, request(t, server, "PUT", "/api/layout", jsonBody(t, layoutRequest{Frames: map[string]*layout.Frame{"f": nil}, Expect: &layout.Expectations{Frames: map[string]*layout.Frame{"f": &f}}}), 403), "read_only")
	assertBoardUnchanged(t, server, before)
	data, err := os.ReadFile(filepath.Join(ls.Dir(), "default.yml"))
	if err != nil {
		t.Fatal(err)
	}
	// Snapshot parsing must use the same strict schema checks as write parsing.
	bad := strings.Replace(string(data), "title:", "future: true, title:", 1)
	if err := os.WriteFile(filepath.Join(ls.Dir(), "default.yml"), []byte(bad), 0644); err != nil {
		t.Fatal(err)
	}
	eventually(t, func() bool {
		res, err := server.Client().Get(server.URL + "/api/board")
		if err != nil {
			return false
		}
		defer res.Body.Close()
		return res.Header.Get("X-Canvas-Stale") == "true"
	})
	after := getBoard(t, server)
	if !reflect.DeepEqual(after.Board, before.Board) {
		t.Fatalf("unknown frame fields lost last valid board: %s", fmt.Sprint(after.Board))
	}
}
