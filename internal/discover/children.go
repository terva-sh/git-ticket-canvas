package discover

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/terva-sh/git-ticket-canvas/internal/config"
)

// MaxChildDepth is how long a chain of declared children may be.
//
// A project exposing a store inside itself is the case this serves, and a
// project exposing a store inside a store inside a store is already unusual. The
// bound matters less for what it forbids than for guaranteeing the expansion
// ends even if the configuration on disk is hostile.
const MaxChildDepth = 3

// childSpec is one entry under the canvas.children key.
type childSpec struct {
	Path     string `yaml:"path"`
	Name     string `yaml:"name"`
	ReadOnly bool   `yaml:"readOnly"`
}

// Declared returns the stores that the store at path declares, transitively.
//
// It exists for a store named explicitly rather than found by a walk. A
// declaration describes the store, not how the store was reached, so an
// explicitly named parent exposes its children the same way a discovered one
// does.
func Declared(store string) Result {
	var result Result
	seen := newVisited()
	seen.record(store)
	expandDeclared(store, store, "", nil, seen, 0, &result)
	return result
}

// expandDeclared records the children one store declares, and their children in
// turn.
//
// root is the root a child's name and depth are derived against, section is the
// root its decisions are grouped under, seen carries every store already
// accepted so a cycle ends, and chain counts how many declarations deep the
// expansion has gone. The two roots differ for a store named explicitly: its
// children are named against it and reported beside it rather than under a
// root nobody configured.
func expandDeclared(parent, root, section string, exclude *Matcher, seen *visited, chain int, result *Result) {
	if chain >= MaxChildDepth {
		result.Decisions = append(result.Decisions, Decision{
			Path: parent, Action: "skip", Reason: "declared child chain limit reached", Root: section,
		})
		return
	}

	specs, warnings := readChildren(parent)
	result.Warnings = append(result.Warnings, warnings...)

	for _, spec := range specs {
		child, err := resolveChild(parent, spec.Path)
		if err != nil {
			result.Warnings = append(result.Warnings, fmt.Sprintf(
				"store %s declares the child %q, which is refused: %v", parent, spec.Path, err))
			result.Decisions = append(result.Decisions, Decision{
				Path: filepath.Join(parent, spec.Path), Action: "skip", Reason: err.Error(), Root: section,
			})
			continue
		}
		if seen.paths[child] {
			result.Decisions = append(result.Decisions, Decision{
				Path: child, Action: "skip", Reason: "already found", Root: section,
			})
			continue
		}
		seen.paths[child] = true
		// An exclusion governs what gets searched, and the person running the
		// canvas outranks the project it serves. Ask about every directory
		// between the child and the root rather than only the child's own name:
		// a store declared inside node_modules is kept out by its ancestor,
		// which is what a bare-name exclusion is for.
		if excluded, by := exclude.matchSelfOrAncestor(child); excluded {
			result.Warnings = append(result.Warnings, fmt.Sprintf(
				"store %s declares the child %s, which the exclusion %q keeps out", parent, child, by))
			result.Decisions = append(result.Decisions, Decision{
				Path: child, Action: "skip", Reason: "excluded by " + by, Root: section,
			})
			continue
		}
		result.Examined++
		if ok, reason := storeAt(child); !ok {
			if reason == "" {
				reason = "it is not a store"
			}
			result.Warnings = append(result.Warnings, fmt.Sprintf(
				"store %s declares the child %q, which is refused: %s", parent, spec.Path, reason))
			result.Decisions = append(result.Decisions, Decision{
				Path: child, Action: "skip", Reason: reason, Root: section,
			})
			continue
		}

		name := spec.Name
		if name != "" {
			if err := config.ValidName(name); err != nil {
				result.Warnings = append(result.Warnings, fmt.Sprintf(
					"store %s declares the child %s under the name %q, which is refused (%v); a name is derived instead",
					parent, child, name, err))
				name = ""
			}
		}

		// Already accepted under another path, or declared twice. Recording the
		// identity stops a cycle without needing to tell the two apart.
		if held, fresh := seen.record(child); !fresh {
			result.Decisions = append(result.Decisions, Decision{
				Path: child, Action: "skip", Reason: "the same store, already listed at " + held, Root: section,
			})
			continue
		}
		result.Stores = append(result.Stores, Found{
			Path:       child,
			Root:       root,
			Depth:      depthBelow(root, child),
			Name:       name,
			ReadOnly:   spec.ReadOnly,
			DeclaredBy: parent,
		})
		result.Decisions = append(result.Decisions, Decision{
			Path: child, Action: "store", Reason: "declared by " + parent, Root: section,
		})

		expandDeclared(child, root, section, exclude, seen, chain+1, result)
	}
}

// readChildren reads the canvas.children key out of a store's configuration.
//
// The key is optional in every sense. Absent or empty means no children and
// says nothing. Malformed means no children and one warning, because a project
// that meant to expose something and typed it wrong should hear about it, and
// because a store must open either way.
func readChildren(store string) ([]childSpec, []string) {
	data, err := os.ReadFile(filepath.Join(store, StoreDir, configFile))
	if err != nil {
		return nil, nil
	}
	// The canvas key is held as a node and decoded on its own, so that a
	// malformed value under it cannot fail the whole document and cost the
	// store its configuration.
	var doc struct {
		Canvas yaml.Node `yaml:"canvas"`
	}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, nil
	}
	if doc.Canvas.IsZero() {
		return nil, nil
	}
	var canvas struct {
		Children []childSpec `yaml:"children"`
	}
	if err := doc.Canvas.Decode(&canvas); err != nil {
		return nil, []string{fmt.Sprintf(
			"store %s: the canvas key does not parse, so it declares no children: %v", store, err)}
	}
	return canvas.Children, nil
}

// resolveChild turns a declared path into a directory to examine, or says why
// it will not.
//
// This configuration arrives from a repository that somebody else may have
// written, so the path is checked rather than trusted. Containment is tested
// twice on purpose: once on the path as written, which catches an escape
// through "..", and once on the path with its symbolic links resolved, which
// catches a link pointing somewhere else entirely. The first check does not
// catch the second case, and skipping it would mean resolving links on a path
// that was never meant to be followed.
func resolveChild(parent, declared string) (string, error) {
	entry := strings.TrimSpace(declared)
	if entry == "" {
		return "", errors.New("the path is empty")
	}
	if filepath.IsAbs(entry) {
		return "", errors.New("the path is absolute, and a declared child is relative to the store that declares it")
	}

	child := filepath.Join(parent, entry)
	if !within(parent, child) {
		return "", fmt.Errorf("the path leaves %s", parent)
	}

	realParent, err := filepath.EvalSymlinks(parent)
	if err != nil {
		return "", fmt.Errorf("the declaring store cannot be resolved: %w", err)
	}
	realChild, err := filepath.EvalSymlinks(child)
	if err != nil {
		return "", fmt.Errorf("the path cannot be resolved: %w", err)
	}
	if !within(realParent, realChild) {
		return "", fmt.Errorf("the path resolves to %s through a symbolic link, outside %s", realChild, realParent)
	}
	return child, nil
}

// within reports whether child sits strictly below parent.
//
// Strictly, so that a path resolving back to the declaring store is refused
// rather than read as a store declaring itself.
func within(parent, child string) bool {
	parent, child = filepath.Clean(parent), filepath.Clean(child)
	return child != parent && strings.HasPrefix(child, parent+string(filepath.Separator))
}

// depthBelow counts the levels between a root and a directory below it.
func depthBelow(root, dir string) int {
	rel, err := filepath.Rel(root, dir)
	if err != nil || rel == "." {
		return 0
	}
	return len(strings.Split(filepath.ToSlash(rel), "/"))
}
