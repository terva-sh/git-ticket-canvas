package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/terva-sh/git-ticket-canvas/internal/layout"
	"github.com/terva-sh/git-ticket/ticket"
)

// BenchmarkBoardRead measures complete handler requests through httptest, with
// filesystem reads, readiness, DTOs, JSON encoding and response-buffer writes.
// It excludes network/compression and fixture creation. The synthetic fixture
// has 120 ready cards and placements, matching the browser test's card count.
// Normal cards have a 32-byte description. Body-heavy adds 64 KiB descriptions
// and 16 KiB each of plan, summary, notes and comments per card (128 KiB total).
// legacy200 reproduces the pre-validator read path for a compute/allocation
// baseline; full200 and conditional304 exercise the production handler.
// Run: go test ./internal/api -run '^$' -bench '^BenchmarkBoardRead$' -benchmem -count=3
func BenchmarkBoardRead(b *testing.B) {
	for _, heavy := range []bool{false, true} {
		name := "normal120"
		if heavy {
			name = "bodyHeavy120"
		}
		b.Run(name, func(b *testing.B) {
			st, err := ticket.Init(b.TempDir(), ticket.InitOptions{Actor: testActor})
			if err != nil {
				b.Fatal(err)
			}
			s := New(st, Options{Actor: testActor})
			s.now = func() time.Time { return fixtureTime }
			placements := make(map[string]*layout.Card, 120)
			for i := 0; i < 120; i++ {
				card := fixtureTicket(fmt.Sprintf("TKT-01M245HJ7G%016d", i))
				card.Title = fmt.Sprintf("Board benchmark card %03d", i)
				card.Body.Description = strings.Repeat("d", 32)
				if heavy {
					card.Body.Description = strings.Repeat("description txt ", 4096)
					card.Body.ImplementationPlan = strings.Repeat("plan text here! ", 1024)
					card.Body.Summary = strings.Repeat("summary content ", 1024)
					card.Body.Notes = strings.Repeat("note entry text ", 1024)
					card.Body.Comments = strings.Repeat("comment content ", 1024)
				}
				saveFixture(b, st, card)
				placements[card.ID] = &layout.Card{X: float64(i%12) * 240, Y: float64(i/12) * 160}
			}
			if _, err := s.layout.Update(layout.DefaultBoard, placements); err != nil {
				b.Fatal(err)
			}
			first := boardRead(startAPI(b, s), "/api/board")
			if first.Code != 200 {
				b.Fatalf("fixture read: %d %s", first.Code, first.Body.String())
			}
			var snapshot boardResponse
			if err := json.Unmarshal(first.Body.Bytes(), &snapshot); err != nil {
				b.Fatal(err)
			}
			if len(snapshot.Tickets) != 120 || len(snapshot.Board.Cards) != 120 {
				b.Fatal("fixture must contain 120 tickets and placements")
			}
			legacy := boardRead(legacyBoardHandler(s), "/api/board")
			if legacy.Code != 200 || !bytes.Equal(legacy.Body.Bytes(), first.Body.Bytes()) {
				b.Fatal("legacy baseline must return the same representation")
			}
			etag := first.Header().Get("ETag")
			for _, mode := range []string{"legacy200", "full200", "conditional304"} {
				b.Run(mode, func(b *testing.B) {
					h := s.Handler()
					var validators []string
					wantStatus, payload := http.StatusOK, first.Body.Len()
					if mode == "legacy200" {
						h = legacyBoardHandler(s)
					}
					if mode == "conditional304" {
						validators = []string{etag}
						wantStatus, payload = http.StatusNotModified, 0
					}
					b.ReportAllocs()
					b.ResetTimer()
					for i := 0; i < b.N; i++ {
						w := boardRead(h, "/api/board", validators...)
						if w.Code != wantStatus || w.Body.Len() != payload {
							b.Fatalf("request returned %d, %d bytes; want %d, %d", w.Code, w.Body.Len(), wantStatus, payload)
						}
					}
					b.ReportMetric(float64(payload), "payload-B/op")
				})
			}
		})
	}
}

// Keep the baseline local to benchmarks. This is the original board pipeline,
// not an alternative production implementation or a shortcut around store IO.
func legacyBoardHandler(s *Server) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tickets, err := s.store.List(r.Context(), ticket.Filter{All: true})
		if err != nil {
			fail(w, err)
			return
		}
		ready, err := s.store.Readiness(r.Context())
		if err != nil {
			fail(w, err)
			return
		}
		ids := make([]string, 0, len(tickets))
		for _, t := range tickets {
			ids = append(ids, t.ID)
		}
		short := ticket.ShortestUniqueAcrossSeries(ids)
		out := make([]Ticket, 0, len(tickets))
		for _, t := range tickets {
			out = append(out, toDTO(t, short[t.ID], ready[t.ID], s.now()))
		}
		board, err := s.layout.Load(layout.DefaultBoard)
		if err != nil {
			fail(w, err)
			return
		}
		boards, err := s.layout.Boards()
		if err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, http.StatusOK, boardResponse{
			Board: board, Boards: boards, Tickets: out, Config: s.schema(),
			StorePath: s.store.Path(), ReadOnly: s.readOnly,
		})
	})
}
