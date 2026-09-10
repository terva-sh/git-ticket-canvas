package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"

	"github.com/terva-sh/git-ticket-canvas/internal/layout"
)

var captureTokenSyntax = regexp.MustCompile(`^capture-v1:[0-9a-f]{64}$`)

func parseCapture(raw json.RawMessage) (string, error) {
	var guard struct {
		Version int    `json:"version"`
		Token   string `json:"token"`
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&guard); err != nil {
		return "", err
	}
	if guard.Version != 1 || !captureTokenSyntax.MatchString(guard.Token) {
		return "", errors.New("invalid capture guard")
	}
	return guard.Token, nil
}

// captureToken hashes public values, not transport metadata or raw wall time.
// Round-trip through maps so object keys, including struct fields, sort alike.
func captureToken(board *layout.Board, tickets []Ticket, config schemaBody) (string, error) {
	tickets = append([]Ticket{}, tickets...)
	sort.Slice(tickets, func(i, j int) bool { return tickets[i].ID < tickets[j].ID })
	data, err := json.Marshal(map[string]any{"version": 1, "board": board, "tickets": tickets, "config": config})
	if err != nil {
		return "", err
	}
	var canonical any
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(&canonical); err != nil {
		return "", err
	}
	data, err = json.Marshal(canonical)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("capture-v1:%x", sha256.Sum256(data)), nil
}

// Called only under Server.mutations. Never use the watcher cache here.
// External editors after this read are not excluded by this process's mutex.
func (s *Server) validateCapture(board, token string) error {
	image, err := s.image()
	if err != nil {
		return err
	}
	snapshot, err := s.buildSnapshot(image)
	if err != nil {
		return err
	}
	selected := snapshot.boards[board]
	if selected == nil {
		selected = layout.Empty(board)
	}
	current, err := captureToken(selected, snapshot.base.Tickets, snapshot.base.Config)
	if err != nil {
		return err
	}
	if current != token {
		return fmt.Errorf("%w: capture inputs changed", layout.ErrConflict)
	}
	return nil
}
