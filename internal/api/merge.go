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
func Merge(cfg config.Config, found discover.Result, opts MergeOptions) ([]StoreSpec, []string, error) {
	var specs []StoreSpec
	var notes []string
	// taken maps an id to the path that holds it, so a collision can name both.
	taken := make(map[string]string, len(cfg.Stores)+len(found.Stores))
	// named maps a store's own directory to the id it ended up with, so a
	// declared child can be named after its parent.
	named := make(map[string]string, len(cfg.Stores)+len(found.Stores))
	byKey := make(map[string]int, len(cfg.Stores))

	for _, s := range cfg.Stores {
		actor := s.Actor
		if actor == "" {
			actor = opts.Actor
		}
		name := s.Name
		if s.Derived {
			name = hashedID(s.Path)
		}
		if held, clash := taken[name]; clash {
			return nil, nil, collision(name, held, s.Path)
		}
		byKey[discover.Key(s.Path)] = len(specs)
		taken[name], named[s.Path] = s.Path, name
		specs = append(specs, StoreSpec{
			Name: name,
			// A name somebody wrote is also what they want to read. A derived
			// one is replaced by the directory, as a discovered store's is.
			Display:       displayFor(s),
			Path:          s.Path,
			Actor:         actor,
			ReadOnly:      opts.ReadOnly || s.ReadOnly,
			EnforceActors: s.EnforceActors,
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
		name := hashedID(f.Path)
		if held, clash := taken[name]; clash {
			return nil, nil, collision(name, held, f.Path)
		}
		taken[name], named[f.Path] = f.Path, name
		display := f.Name
		if display == "" {
			display = DisplayName(f.Path)
		}
		specs = append(specs, StoreSpec{
			Name:     name,
			Display:  display,
			Path:     f.Path,
			Actor:    opts.Actor,
			ReadOnly: opts.ReadOnly || f.ReadOnly,
			Root:     f.Root,
			Parent:   named[f.DeclaredBy],
		})
	}
	return specs, notes, nil
}

// displayFor is what a configured store is called to a person.
func displayFor(s config.Store) string {
	if s.Derived {
		return DisplayName(s.Path)
	}
	return s.Name
}

// collision refuses two stores that hashed the same.
//
// Refusing is the point. Lengthening the hash or numbering the duplicates would
// make an id depend on what else exists, which is the defect this scheme was
// built to remove, and it would reintroduce it in the rarest and least
// reproducible case.
func collision(id, held, wants string) error {
	return fmt.Errorf("stores %s and %s both hash to the id %q; "+
		"name one of them explicitly to separate them", held, wants, id)
}

// DisplayName is what a store is called to a person: the directory that holds
// it, so /ws/org/alpine/.tickets reads as "alpine".
//
// It works on the path as given rather than on a resolved one, because a store
// that is not on disk still has to be listed with a name, and its path never
// went through discover.Nearest to gain the store directory on the end.
func DisplayName(path string) string {
	trimmed := strings.TrimSuffix(filepath.Clean(path), string(filepath.Separator)+discover.StoreDir)
	if base := filepath.Base(trimmed); base != "." && base != string(filepath.Separator) {
		return base
	}
	return trimmed
}

// IDLeafLen is how much of the readable prefix an id keeps, and IDHashLen is
// how many hexadecimal characters of hash follow it.
//
// Twelve hexadecimal characters is 48 bits. At ten thousand stores the chance
// that any two collide is about 1.8e-07 and at a hundred thousand about
// 1.8e-05, which is why a collision can be a refusal rather than a rule.
//
// Twenty characters of leaf covers every repository name in a real workspace,
// and cutting it costs nothing: the hash carries the uniqueness, so the
// readable part is free to be trimmed. That is the whole reason an id can be
// short and readable at once, where the slug it replaced could not.
const (
	IDLeafLen = 20
	IDHashLen = 12
)

// hashedID is a store's id: its directory name, trimmed, and a hash of where
// the store really is.
//
// The hash is taken over discover.Key, the resolved absolute path, which is the
// identity the rest of the canvas already uses to deduplicate stores and to key
// favorites. Three consequences follow, and all three are the point. An id does
// not move when another store is added, removed, or found in a different order.
// An id does not move when --root changes. Two paths reaching one store through
// a symbolic link produce one id rather than two entries fighting over one set
// of tickets.
func hashedID(path string) string {
	// DeriveName carries the rule for what a name may hold, so the leaf goes
	// through it rather than through a second copy of that rule here.
	leaf := config.DeriveName(DisplayName(path))
	if len(leaf) > IDLeafLen {
		leaf = strings.TrimRight(leaf[:IDLeafLen], "-_")
	}
	sum := sha256.Sum256([]byte(discover.Key(path)))
	hash := hex.EncodeToString(sum[:])[:IDHashLen]
	if leaf == "" {
		return hash
	}
	return leaf + "-" + hash
}
