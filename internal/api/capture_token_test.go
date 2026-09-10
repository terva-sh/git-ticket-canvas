package api

import (
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/layout"
)

func TestCaptureCanonicalProjection(t *testing.T) {
	board := layout.Empty("default")
	board.Cards["b"] = layout.Card{X: 2}
	board.Cards["a"] = layout.Card{X: 1}
	tickets := []Ticket{{ID: "b", Labels: []string{"x", "y"}}, {ID: "a"}}
	token := func(b *layout.Board, ts []Ticket, cfg schemaBody) string {
		t.Helper()
		value, err := captureToken(b, ts, cfg)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	first := token(board, tickets, schemaBody{})
	if !captureTokenSyntax.MatchString(first) {
		t.Fatal(first)
	}
	reordered := layout.Empty("default")
	reordered.Cards["a"] = board.Cards["a"]
	reordered.Cards["b"] = board.Cards["b"]
	if token(reordered, []Ticket{tickets[1], tickets[0]}, schemaBody{}) != first {
		t.Fatal("map/ticket ordering changed token")
	}
	tickets[0].Labels = []string{"y", "x"}
	if token(board, tickets, schemaBody{}) == first {
		t.Fatal("non-ticket array order lost")
	}
	tickets[0].Labels = []string{"x", "y"}
	tickets[1].Title = "changed"
	if token(board, tickets, schemaBody{}) == first {
		t.Fatal("public ticket field omitted")
	}
}

func TestCaptureGuardSyntax(t *testing.T) {
	valid := `{"version":1,"token":"capture-v1:` + strings.Repeat("a", 64) + `"}`
	if _, err := parseCapture([]byte(valid)); err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{`null`, `{}`, `[]`, `{"version":null}`, strings.Replace(valid, `"version":1`, `"version":1.5`, 1), strings.Replace(valid, `"version":1`, `"version":2`, 1), strings.Replace(valid, `"version":1`, `"extra":true,"version":1`, 1)} {
		if _, err := parseCapture([]byte(raw)); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
}

func TestCaptureGuardRequiresSparseExpectations(t *testing.T) {
	st, server, id := captureFixture(t)
	current := capturePositive(t, server, id)
	before := string(penDisk(t, st.Path()))
	request(t, server, "PUT", "/api/layout", jsonBody(t, map[string]any{"capture": captureGuardWire(current.CaptureToken), "cards": map[string]any{id: layout.Card{X: 999}}}), 400)
	if string(penDisk(t, st.Path())) != before {
		t.Fatal("guard bypassed missing expectations")
	}
}
