package api

import (
	"context"
	"fmt"

	"github.com/terva-sh/git-ticket-canvas/internal/layout"
	"github.com/terva-sh/git-ticket/ticket"
)

// Check only records the transaction writes. Existing dangling members may be
// removed or their frame deleted; unrelated dangling frames do not block edits.
// Store.Transaction calls this after the read set, while holding its writer lock.
func (s *Server) validateFrameTickets(ctx context.Context, req layoutRequest) error {
	needed := map[string]bool{}
	for id, card := range req.Cards {
		if card != nil {
			needed[id] = true
		}
	}
	for _, frame := range req.Frames {
		if frame != nil {
			for _, id := range frame.Members {
				needed[id] = true
			}
		}
	}
	if len(needed) == 0 {
		return nil
	}
	all, err := s.store.List(ctx, ticket.Filter{All: true})
	if err != nil {
		return err
	}
	for _, t := range all {
		delete(needed, t.ID)
	}
	for id := range needed {
		return fmt.Errorf("%w: ticket %s no longer exists", layout.ErrConflict, id)
	}
	return nil
}
