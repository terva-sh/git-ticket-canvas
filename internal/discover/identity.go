package discover

import (
	"path/filepath"
)

// Key is what decides whether two paths name the same store.
//
// It is the nearest directory at or above path that holds a valid store, with
// symbolic links resolved. Two steps, and both earn their place. Resolving
// links is what makes a workspace reached through a link and the same workspace
// reached directly one store. Walking up is what makes `--store .`, run from
// inside a repository, the same store a search finds at the repository root:
// ticket.Discover walks up when it opens, so a merge that did not would serve
// one set of tickets twice under two names.
//
// A path that resolves to no store keeps its cleaned form. A store that was
// named and is not on disk has to stay in the list, carrying the reason, and it
// can only do that if it still has an identity.
func Key(path string) string {
	clean := filepath.Clean(path)
	at := clean
	for {
		if ok, _ := storeAt(at); ok {
			if real, err := filepath.EvalSymlinks(at); err == nil {
				return real
			}
			return at
		}
		parent := filepath.Dir(at)
		if parent == at {
			break
		}
		at = parent
	}
	if real, err := filepath.EvalSymlinks(clean); err == nil {
		return real
	}
	return clean
}

// visited is what one run of discovery has already accounted for.
//
// The two maps answer different questions. paths stops the walk examining a
// directory twice, and is lexical because that is what the queue holds. keys
// decides whether a candidate is a store already in the list, and is resolved
// because that is what identity means. Keeping them apart is what lets the walk
// terminate on the paths it walked while still merging stores reached by
// different paths.
type visited struct {
	paths map[string]bool
	keys  map[string]string
}

func newVisited() *visited {
	return &visited{paths: make(map[string]bool), keys: make(map[string]string)}
}

// walked reports whether a directory has been examined, and marks it.
func (v *visited) walked(path string) bool {
	if v.paths[path] {
		return true
	}
	v.paths[path] = true
	return false
}

// record claims a store's identity, returning the path that already held it.
func (v *visited) record(path string) (string, bool) {
	key := Key(path)
	if held, ok := v.keys[key]; ok {
		return held, false
	}
	v.keys[key] = path
	return "", true
}
