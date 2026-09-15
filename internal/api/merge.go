package api

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/terva-sh/git-ticket-canvas/internal/config"
	"github.com/terva-sh/git-ticket-canvas/internal/discover"
)

// MergeOptions carries the settings that apply to every store.
type MergeOptions struct {
	// Actor is the global --actor, used by any store that does not name its
	// own.
	Actor string
	// ReadOnly is the global --read-only. It forces read-only over anything a
	// store or a declaration asks for, because a flag that only sometimes
	// refuses writes is worse than no flag.
	ReadOnly bool
}

// Merge turns a configuration and a discovery result into the stores to serve.
//
// An explicitly named store comes first, in configured order, and is served
// whatever a root, a depth, or an exclusion says: naming it is the instruction.
// Everything the explicit entry sets wins, its name, its actor, and its
// read-only setting, and a store that was also found by searching contributes
// only that fact, returned as a note.
//
// This lives beside the registry rather than in main, because a rescan needs
// the same rule and main will not be running then.
func Merge(cfg config.Config, found discover.Result, opts MergeOptions) ([]StoreSpec, []string) {
	var specs []StoreSpec
	var notes []string
	taken := make(map[string]bool, len(cfg.Stores)+len(found.Stores))
	// named maps a store's own directory to the id it ended up with, so a
	// declared child can be named after its parent.
	named := make(map[string]string, len(cfg.Stores)+len(found.Stores))
	byKey := make(map[string]int, len(cfg.Stores))

	for _, s := range cfg.Stores {
		actor := s.Actor
		if actor == "" {
			actor = opts.Actor
		}
		byKey[discover.Key(s.Path)] = len(specs)
		taken[s.Name], named[s.Path] = true, s.Name
		specs = append(specs, StoreSpec{
			Name:     s.Name,
			Path:     s.Path,
			Actor:    actor,
			ReadOnly: opts.ReadOnly || s.ReadOnly,
		})
	}

	for _, f := range found.Stores {
		// Discovery running against the same configuration drops these before
		// they reach here. Merge still checks, so that it is correct when called
		// with a plain walk.
		if at, ok := byKey[discover.Key(f.Path)]; ok {
			notes = append(notes, fmt.Sprintf(
				"store %q was also found by searching, at %s; the configured entry stands",
				specs[at].Name, f.Path))
			continue
		}
		name := unique(derivedName(f, named), f.Path, taken)
		taken[name], named[f.Path] = true, name
		specs = append(specs, StoreSpec{
			Name:     name,
			Path:     f.Path,
			Actor:    opts.Actor,
			ReadOnly: opts.ReadOnly || f.ReadOnly,
		})
	}
	return specs, notes
}

// derivedName is what a store nobody named is called.
//
// A declared child keeps the name its parent gave it when a URL can hold one,
// and otherwise takes its parent's id joined to its own relative path, so that
// children sort next to their parent. Everything else is named for its path
// below the root it was found under.
func derivedName(f discover.Found, named map[string]string) string {
	if f.Name != "" {
		return f.Name
	}
	if parent, ok := named[f.DeclaredBy]; ok {
		return trimName(parent + "_" + config.SlugName(f.DeclaredBy, f.Path))
	}
	return config.SlugName(f.Root, f.Path)
}

// unique keeps two stores that derive the same name.
//
// The alternative, skipping the second, silently costs you a store: two roots
// holding org/repo is an ordinary way to lay out a workspace, not a mistake to
// be punished. The suffix is a hash of the store's identity rather than a
// counter, so it is the same on the next run and does not move when another
// store is added ahead of it.
func unique(name, path string, taken map[string]bool) string {
	if !taken[name] {
		return name
	}
	suffix := "-" + shortHash(discover.Key(path))
	candidate := trimName(name, len(suffix)) + suffix
	for i := 2; taken[candidate]; i++ {
		numbered := fmt.Sprintf("%s-%d", suffix, i)
		candidate = trimName(name, len(numbered)) + numbered
	}
	return candidate
}

// trimName cuts a name to the length a URL path segment is allowed, leaving
// room for a suffix.
//
// The tail is kept rather than the head: the repository name carries more
// meaning than the forge it was mirrored from, which is the same choice
// config.SlugName makes.
func trimName(name string, reserve ...int) string {
	limit := config.MaxNameLen
	for _, r := range reserve {
		limit -= r
	}
	if limit < 1 {
		limit = 1
	}
	if len(name) <= limit {
		return name
	}
	return strings.TrimLeft(name[len(name)-limit:], "-_")
}

// shortHash is six hexadecimal characters of a path's hash, enough to separate
// the handful of stores that collide without making the id unreadable.
func shortHash(path string) string {
	sum := sha256.Sum256([]byte(filepath.Clean(path)))
	return hex.EncodeToString(sum[:3])
}
