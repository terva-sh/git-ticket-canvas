// Package discover finds ticket stores by walking a directory tree.
//
// The walk is bounded on purpose. On a workspace holding 22 stores it takes
// about ten milliseconds, so depth is not a speed setting: it decides what gets
// picked up. Going deeper than a project finds the test fixtures committed
// inside one, and this repository's own canvas baseline fixture is a complete
// 30-ticket store living under docs/artifacts.
//
// Nothing here opens a store. The walk answers which directories look like
// stores; opening one, resolving its actor, and reporting one that will not
// open belong to the server.
package discover

import (
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/terva-sh/git-ticket-canvas/internal/config"
)

// StoreDir is the directory a store keeps inside a project.
const StoreDir = ".tickets"

// configFile is the file whose presence and parseability make a directory a
// store, rather than a directory that merely holds a .tickets by accident.
const configFile = "config.yml"

// Found is a store the walk located.
type Found struct {
	// Path is the directory holding the .tickets, not the .tickets itself.
	Path string
	// Root is the configured root this store was found under.
	Root string
	// Depth is how many levels below Root the store sits. A workspace laid out
	// as forge/org/repo gives 3.
	Depth int
}

// Decision records what the walk did with one directory and why.
//
// It exists so that "why is my store not in the list" has an answer. Depth, the
// hidden rule, symbolic links, and the store boundary can each account for a
// directory the walk passed over, and a person looking at an empty list cannot
// tell which without being told.
type Decision struct {
	Path   string
	Action string // "store", or "skip"
	Reason string
}

// Result is everything one call to Walk concluded.
type Result struct {
	Stores    []Found
	Decisions []Decision
}

// Walk finds the stores under every root.
//
// A root that cannot be read contributes a decision rather than an error, so
// one unreadable root does not cost you the others. Walk returns no error
// today; the signature keeps one because a later deadline or cancellation would
// be a failure of the call rather than of any one directory.
func Walk(roots []config.Root) Result {
	var result Result
	seen := make(map[string]bool)
	for _, root := range roots {
		depth := root.Depth
		if depth <= 0 {
			depth = config.DefaultDepth
		}
		walkRoot(root.Path, depth, seen, &result)
	}
	sort.Slice(result.Stores, func(i, j int) bool { return result.Stores[i].Path < result.Stores[j].Path })
	return result
}

// queued is a directory waiting to be examined, with how deep it sits.
type queued struct {
	path  string
	level int
}

func walkRoot(root string, depth int, seen map[string]bool, result *Result) {
	queue := []queued{{path: root, level: 0}}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		// Two roots can overlap, and a directory examined once does not need
		// examining again.
		if seen[current.path] {
			continue
		}
		seen[current.path] = true

		switch store, reason := storeAt(current.path); {
		case store:
			result.Stores = append(result.Stores, Found{Path: current.path, Root: root, Depth: current.level})
			result.Decisions = append(result.Decisions, Decision{Path: current.path, Action: "store"})
			// A store's subtree is that store's own material. Not descending is
			// what keeps a project's committed test fixtures out of the list at
			// any depth, rather than only at the depth that happens to cut them
			// off.
			continue
		case reason != "":
			// A .tickets is here and it does not qualify. It still marks the
			// directory as somebody's, so treat it as a boundary.
			result.Decisions = append(result.Decisions, Decision{Path: current.path, Action: "skip", Reason: reason})
			continue
		}

		if current.level >= depth {
			result.Decisions = append(result.Decisions, Decision{
				Path: current.path, Action: "skip", Reason: "depth limit reached",
			})
			continue
		}

		entries, err := os.ReadDir(current.path)
		if err != nil {
			result.Decisions = append(result.Decisions, Decision{
				Path: current.path, Action: "skip", Reason: err.Error(),
			})
			continue
		}
		for _, e := range entries {
			child := filepath.Join(current.path, e.Name())
			switch {
			case e.Type()&fs.ModeSymlink != 0:
				// os.ReadDir reports with Lstat semantics, so a link to a
				// directory arrives with IsDir false and would be skipped by the
				// next case anyway. Naming it here records why, and makes the
				// walk terminate because it cannot revisit a directory rather
				// than because it noticed that it had.
				result.Decisions = append(result.Decisions, Decision{
					Path: child, Action: "skip", Reason: "symbolic link",
				})
			case !e.IsDir():
				// A plain file is not a candidate and is not worth reporting.
			case isHidden(e.Name()):
				// Do not descend into a hidden directory. This never applies to
				// the .tickets test above, which looks for a hidden child
				// directly; the two rules are separate and collapsing them into
				// one hidden check finds nothing at all.
				result.Decisions = append(result.Decisions, Decision{
					Path: child, Action: "skip", Reason: "hidden directory",
				})
			default:
				queue = append(queue, queued{path: child, level: current.level + 1})
			}
		}
	}
}

// storeAt reports whether a directory is a ticket store.
//
// The gate is deliberately cheap: .tickets/config.yml exists and parses as
// YAML. That keeps a stray .tickets out of the list without opening anything.
// The returned reason is non-empty when a .tickets is present and the directory
// still does not qualify, which the caller treats as a boundary.
func storeAt(dir string) (bool, string) {
	store := filepath.Join(dir, StoreDir)
	// Lstat, not Stat. A .tickets that is a symbolic link is an alias for a
	// store that lives somewhere else, and the walk will find that store at its
	// real path. Following the link would list one store twice under two names,
	// and, worse, would make the directory holding the alias a boundary. A
	// workspace root with a convenience link to one project's store would then
	// hide every other project under it.
	info, err := os.Lstat(store)
	if err != nil || !info.Mode().IsDir() {
		return false, ""
	}
	data, err := os.ReadFile(filepath.Join(store, configFile))
	if err != nil {
		return false, "has " + StoreDir + " but no " + configFile
	}
	var probe any
	if err := yaml.Unmarshal(data, &probe); err != nil {
		return false, StoreDir + "/" + configFile + " does not parse: " + err.Error()
	}
	return true, ""
}

// isHidden reports whether a directory name starts with a dot.
func isHidden(name string) bool {
	return strings.HasPrefix(name, ".")
}
