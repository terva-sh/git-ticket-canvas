package api

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/terva-sh/git-ticket-canvas/internal/layout"
	"github.com/terva-sh/git-ticket/ticket"
)

type representation struct {
	data []byte
	etag string
}

// A snapshot's authoritative values never change after publication. Only the
// bounded representation cache for empty, as-yet-unsaved board names is mutable,
// under coordinator.mu. No board read opens the store or recomputes readiness.
type snapshot struct {
	base   boardResponse
	boards map[string]*layout.Board
	reps   map[string]representation
	scopes map[string][32]byte
	expiry time.Time
}

func (s *Server) ticketDirs() []string {
	var dirs []string
	for _, status := range ticket.Statuses {
		dir := s.store.StatusDir(status)
		if !slices.Contains(dirs, dir) {
			dirs = append(dirs, dir)
		}
	}
	sort.Strings(dirs)
	return dirs
}

func (s *Server) authoritativeFile(path string) bool {
	if path == filepath.Join(s.store.Path(), "config.yml") {
		return true
	}
	base := filepath.Base(path)
	if strings.HasPrefix(base, ".") {
		return false
	}
	if filepath.Dir(path) == s.layout.Dir() {
		return strings.HasSuffix(base, ".yml")
	}
	return slices.Contains(s.ticketDirs(), filepath.Dir(path)) && strings.HasSuffix(base, ".md")
}

type fileImage struct {
	data map[string][]byte
	hash [32]byte
}

// image reads exactly the directories that the ticket and layout libraries
// read. Missing status directories are valid, but missing config/store is not.
// Hash contents, not mtimes, so atomic replacements and same-size edits count.
func (s *Server) image() (fileImage, error) {
	image := fileImage{data: make(map[string][]byte)}
	config := filepath.Join(s.store.Path(), "config.yml")
	info, err := os.Lstat(config)
	if err != nil {
		return image, err
	}
	if !info.Mode().IsRegular() {
		return image, errors.New("config is not a regular file")
	}
	data, err := os.ReadFile(config)
	if err != nil {
		return image, err
	}
	image.data[config] = data
	for _, dir := range append(s.ticketDirs(), s.layout.Dir()) {
		info, err := os.Lstat(dir)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return image, err
		}
		if !info.IsDir() {
			return image, errors.New("authoritative directory is not a directory")
		}
		entries, err := os.ReadDir(dir)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return image, err
		}
		for _, entry := range entries {
			path := filepath.Join(dir, entry.Name())
			if entry.IsDir() || !s.authoritativeFile(path) {
				continue
			}
			// Reject symlinks outside watched directories and devices/FIFOs
			// that could turn a reconciliation read into an unbounded wait.
			if !entry.Type().IsRegular() {
				return image, errors.New("authoritative file is not regular")
			}
			data, err := os.ReadFile(path)
			if err != nil {
				return image, err
			}
			image.data[path] = data
		}
	}
	paths := make([]string, 0, len(image.data))
	for path := range image.data {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	hash := sha256.New()
	for _, path := range paths {
		fmt.Fprintf(hash, "%d:%s%d:", len(path), path, len(image.data[path]))
		_, _ = hash.Write(image.data[path])
	}
	copy(image.hash[:], hash.Sum(nil))
	return image, nil
}

func (c *coordinator) reconcileLocked(force, safety bool) {
	c.mu.Lock()
	if safety {
		c.stats.SafetyScans++
	}
	c.mu.Unlock()
	before, err := c.s.image()
	if err == nil && !force && c.hasLast && before.hash == c.last {
		c.mu.Lock()
		if c.state.Stale || c.state.Degraded == c.watchOK {
			c.state.Stale, c.state.Degraded = false, !c.watchOK
			c.publishLocked(nil)
		}
		c.mu.Unlock()
		return
	}
	var next *snapshot
	if err == nil {
		c.mu.Lock()
		c.stats.Rebuilds++
		c.mu.Unlock()
		next, err = c.build(before)
	}
	if err == nil {
		// A filesystem operation is not a transaction. Require the same file
		// image before and after candidate construction and a settling interval.
		// This rejects known mixed reads, not undetectable valid intermediate
		// states of a multi-file checkout paused longer than the interval.
		timer := time.NewTimer(c.timing.settle)
		select {
		case <-c.ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		after, readErr := c.s.image()
		if readErr != nil || before.hash != after.hash {
			err = errors.New("store changed during reconciliation")
		}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if err != nil {
		c.hasLast = false
		// Retry deadlines take precedence over an already elapsed expiry.
		c.nextExpiry = time.Time{}
		if !c.state.Stale || c.state.Degraded != !c.watchOK {
			c.state.Stale, c.state.Degraded = true, !c.watchOK
			c.publishLocked(nil)
		}
		return
	}
	var scopes []string
	for scope, hash := range next.scopes {
		if c.snap == nil || c.snap.scopes[scope] != hash {
			scopes = append(scopes, scope)
		}
	}
	if c.snap != nil {
		for scope := range c.snap.scopes {
			if _, ok := next.scopes[scope]; !ok {
				scopes = append(scopes, scope)
			}
		}
	}
	sort.Strings(scopes)
	changed := c.snap == nil || len(scopes) != 0 || c.state.Stale || c.state.Degraded != !c.watchOK
	c.snap, c.last, c.hasLast = next, before.hash, true
	c.nextExpiry = next.expiry
	c.state.Stale, c.state.Degraded = false, !c.watchOK
	if changed {
		c.publishLocked(scopes)
	}
}

func (c *coordinator) build(image fileImage) (*snapshot, error) {
	s := c.s
	now := s.now()
	cfg, err := ticket.ParseConfig(image.data[filepath.Join(s.store.Path(), "config.yml")])
	if err != nil {
		return nil, err
	}
	// List deliberately skips parse errors. Parse the captured image instead,
	// then derive everything from those exact bytes and one evaluation time.
	seen := make(map[string]bool)
	all := make([]*ticket.Ticket, 0)
	for path, data := range image.data {
		if !slices.Contains(s.ticketDirs(), filepath.Dir(path)) {
			continue
		}
		t, err := ticket.Parse(data)
		if err != nil {
			return nil, err
		}
		series, _ := ticket.SplitID(t.ID)
		if !ticket.ValidID(t.ID) || !cfg.KnownSeries(series) || !ticket.ValidStatus(t.Status) ||
			!ticket.ValidType(t.Type) || !ticket.ValidPriority(t.Priority) || !ticket.ValidBlocksOn(t.BlocksOn) ||
			strings.TrimSpace(t.Title) == "" || t.CreatedAt.Time.IsZero() || t.UpdatedAt.Time.IsZero() {
			return nil, errors.New("invalid or incomplete ticket fields")
		}
		if seen[t.ID] || filepath.Dir(path) != s.store.StatusDir(t.Status) || filepath.Base(path) != t.ID+".md" {
			return nil, errors.New("duplicate or misplaced ticket")
		}
		seen[t.ID] = true
		all = append(all, t)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].ID < all[j].ID })
	ready := snapshotReadiness(all, now)
	ids := make([]string, 0, len(all))
	for _, t := range all {
		ids = append(ids, t.ID)
	}
	short := ticket.ShortestUniqueAcrossSeries(ids)
	next := &snapshot{boards: make(map[string]*layout.Board), reps: make(map[string]representation), scopes: make(map[string][32]byte)}
	out := make([]Ticket, 0, len(all))
	for _, t := range all {
		out = append(out, toDTO(t, short[t.ID], ready[t.ID], now))
		if t.Claim != nil && t.Claim.ExpiresAt != nil && !t.Claim.Expired(now) {
			// Claim expiry is strictly after ExpiresAt in the ticket library.
			at := time.Now().Add(t.Claim.ExpiresAt.Time.Sub(now) + time.Millisecond)
			if next.expiry.IsZero() || at.Before(next.expiry) {
				next.expiry = at
			}
		}
	}
	var names []string
	for path, data := range image.data {
		if filepath.Dir(path) != s.layout.Dir() {
			continue
		}
		name := strings.TrimSuffix(filepath.Base(path), ".yml")
		if !validBoardName(name) {
			return nil, errors.New("invalid board name")
		}
		board, err := layout.Parse(name, data)
		if err != nil {
			return nil, err
		}
		next.boards[name] = board
		names = append(names, name)
	}
	if len(names) == 0 {
		names = []string{layout.DefaultBoard}
		next.boards[layout.DefaultBoard] = layout.Empty(layout.DefaultBoard)
	}
	sort.Strings(names)
	for name, board := range next.boards {
		next.scopes["layout:"+name] = jsonHash(board)
	}
	next.base = boardResponse{Boards: names, Tickets: out, Config: s.schemaFor(cfg), StorePath: s.store.Path(), ReadOnly: s.readOnly}
	next.scopes["tickets"] = jsonHash(out)
	next.scopes["config"] = jsonHash(next.base.Config)
	next.scopes["boards"] = jsonHash(names)
	for _, name := range names {
		if _, err := next.representation(name); err != nil {
			return nil, err
		}
	}
	return next, nil
}

// snapshotReadiness mirrors the library's working-tree readiness rules over
// captured tickets. Store.Readiness rereads disk and skips broken files, so it
// cannot derive a validated snapshot. A parity test guards library upgrades.
// The caller has already rejected duplicate IDs.
func snapshotReadiness(all []*ticket.Ticket, now time.Time) map[string]ticket.Readiness {
	byID := make(map[string]*ticket.Ticket, len(all))
	children := make(map[string][]*ticket.Ticket)
	for _, t := range all {
		byID[t.ID] = t
		if t.Parent != nil && *t.Parent != "" {
			children[*t.Parent] = append(children[*t.Parent], t)
		}
	}
	out := make(map[string]ticket.Readiness, len(all))
	for _, t := range all {
		var r ticket.Readiness
		for _, dep := range t.Dependencies {
			other := byID[dep]
			if other == nil {
				r.Missing = append(r.Missing, dep)
			} else if !other.SatisfiesDependency() {
				r.Blocking = append(r.Blocking, dep)
			}
		}
		if t.BlocksOn == ticket.BlocksOnChildren {
			for _, child := range children[t.ID] {
				if !child.SatisfiesDependency() {
					r.BlockingChildren = append(r.BlockingChildren, child.ID)
				}
			}
		}
		sort.Strings(r.Blocking)
		sort.Strings(r.Missing)
		sort.Strings(r.BlockingChildren)
		r.Blocked = len(r.Blocking)+len(r.Missing)+len(r.BlockingChildren) != 0
		held := t.Claim != nil && !t.Claim.Expired(now)
		r.Ready = t.Status == ticket.StatusReady && !r.Blocked && !held
		switch {
		case t.Status != ticket.StatusReady:
			r.Reason = t.Status
		case r.Blocked:
			r.Reason = ticket.ReasonWaitingOnDependencies
		case held:
			r.Reason = ticket.ReasonClaimed
		}
		out[t.ID] = r
	}
	return out
}

func jsonHash(v any) [32]byte {
	data, _ := json.Marshal(v)
	return sha256.Sum256(data)
}

func validBoardName(name string) bool {
	if name == "" || len(name) > 64 {
		return false
	}
	for _, r := range name {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
			return false
		}
	}
	return true
}

func (s *snapshot) representation(name string) (representation, error) {
	if rep, ok := s.reps[name]; ok {
		return rep, nil
	}
	out := s.base
	out.Board = s.boards[name]
	if out.Board == nil {
		out.Board = layout.Empty(name)
	}
	data, err := json.Marshal(out)
	if err != nil {
		return representation{}, err
	}
	data = append(data, '\n')
	rep := representation{data: data, etag: fmt.Sprintf(`"%x"`, sha256.Sum256(data))}
	// Bound cache growth from arbitrary valid board query names. Saved boards
	// are prebuilt; allow at most 64 additional empty representations.
	if len(s.reps) >= len(s.boards)+64 {
		for key := range s.reps {
			if s.boards[key] == nil {
				delete(s.reps, key)
				break
			}
		}
	}
	s.reps[name] = rep
	return rep, nil
}
