package discover

import (
	"fmt"
	"io"
	"path/filepath"
	"sort"
	"strings"

	"github.com/terva-sh/git-ticket-canvas/internal/config"
)

// Scan is everything discovery concludes about a configuration.
//
// It is the one sequence: the stores named explicitly, the children each of
// them declares, then the roots. Serving opens what Scan found and --scan
// prints it, because an explanation of a discovery that is not the discovery
// being run is worse than none.
//
// One record of what has been examined is shared across the whole sequence, so
// a store named explicitly that also sits under a root is recorded once, as
// explicit. Merging the two sets on resolved path, and the name collisions that
// come with it, is still to come.
func Scan(cfg config.Config) Result {
	var result Result
	seen := make(map[string]bool)

	for _, s := range cfg.Stores {
		if seen[s.Path] {
			continue
		}
		seen[s.Path] = true
		result.Examined++
		result.Decisions = append(result.Decisions, Decision{
			Path: s.Path, Action: "store", Reason: "named explicitly",
		})
		expandDeclared(s.Path, s.Path, "", nil, seen, 0, &result)
	}

	walkRoots(cfg, seen, &result)
	sortStores(&result)
	result.Warnings = append(result.Warnings, ExcludedExplicit(cfg)...)
	return result
}

// section is one heading and the decisions printed under it: the stores named
// explicitly, or one configured root.
type section struct {
	heading   string
	root      string
	relative  bool
	decisions []Decision
}

// Format writes one line per decision, grouped by the root that reached it.
//
// The text is the contract: it is what --scan prints and what the walk's tests
// asserts against, which is easier to review than assertions over a returned
// structure.
func Format(cfg config.Config, result Result, w io.Writer) error {
	var sections []section
	add := func(heading, root string, relative bool) {
		var picked []Decision
		for _, d := range result.Decisions {
			if d.Root == root {
				picked = append(picked, d)
			}
		}
		if len(picked) == 0 {
			return
		}
		sort.Slice(picked, func(i, j int) bool { return picked[i].Path < picked[j].Path })
		sections = append(sections, section{heading, root, relative, picked})
	}

	add("configured", "", false)
	for _, root := range cfg.Roots {
		depth := root.Depth
		if depth <= 0 {
			depth = config.DefaultDepth
		}
		add(fmt.Sprintf("%s  depth %d", root.Path, depth), root.Path, true)
	}

	var stores, skipped, walked int
	for _, section := range sections {
		if _, err := fmt.Fprintln(w, section.heading); err != nil {
			return err
		}
		// Pad to the longest path, up to a point. A single deep path would
		// otherwise push every reason on the page out past it, and truncating a
		// path to keep the columns is the one thing this output must not do.
		// Absolute paths are not padded at all: they are long enough that
		// aligning to the longest leaves a stripe of blank across the section.
		width := 0
		if section.relative {
			for _, d := range section.decisions {
				if n := len(display(d.Path, section.root, section.relative)); n > width && n <= maxPathColumn {
					width = n
				}
			}
		}
		for _, d := range section.decisions {
			if d.Action == "store" {
				stores++
				if section.relative {
					walked++
				}
			} else {
				skipped++
			}
			reason := shorten(d.Reason, section.root, section.relative)
			if reason == "" {
				reason = "store"
			}
			line := fmt.Sprintf("  %-4s  %-*s  %s",
				verb(d.Action), width, display(d.Path, section.root, section.relative), reason)
			if _, err := fmt.Fprintln(w, strings.TrimRight(line, " ")); err != nil {
				return err
			}
		}
		if _, err := fmt.Fprintln(w); err != nil {
			return err
		}
	}

	// Said once rather than on every store line. The boundary is the answer to
	// "why is my store not listed" for anything under a store, and on a
	// workspace holding twenty of them the same clause on every line is what
	// stops the output being read at all.
	if walked > 0 {
		if _, err := fmt.Fprintf(w, "Nothing below a store is searched. A store inside another is listed only if the\nparent names it under canvas.children in its own %s/%s.\n\n", StoreDir, configFile); err != nil {
			return err
		}
	}

	if len(result.Warnings) > 0 {
		if _, err := fmt.Fprintln(w, "warnings"); err != nil {
			return err
		}
		for _, warning := range result.Warnings {
			if _, err := fmt.Fprintf(w, "  %s\n", warning); err != nil {
				return err
			}
		}
		if _, err := fmt.Fprintln(w); err != nil {
			return err
		}
	}

	_, err := fmt.Fprintf(w, "%s, %d skipped, %s examined\n",
		count(stores, "store"), skipped, count(result.Examined, "directory", "directories"))
	return err
}

// maxPathColumn caps how far the reason column is pushed out.
const maxPathColumn = 56

// verb is how a decision reads in the first column.
func verb(action string) string {
	if action == "store" {
		return "ok"
	}
	return action
}

// shorten strips the root from a path quoted inside a reason, so that
// "declared by <root>/forge/org/project" reads as "declared by
// forge/org/project" under a heading that already names the root.
func shorten(reason, root string, relative bool) string {
	if !relative || root == "" {
		return reason
	}
	return strings.ReplaceAll(reason, root+string(filepath.Separator), "")
}

// display shortens a path against the root already named in the heading,
// because the repeated prefix is what makes this output hard to read.
func display(path, root string, relative bool) string {
	if !relative {
		return path
	}
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return path
	}
	if rel == "." {
		return "."
	}
	return filepath.ToSlash(rel)
}

// count writes a number with its noun, pluralized by appending "s" unless a
// plural is given.
func count(n int, noun string, plural ...string) string {
	if n == 1 {
		return fmt.Sprintf("%d %s", n, noun)
	}
	if len(plural) > 0 {
		return fmt.Sprintf("%d %s", n, plural[0])
	}
	return fmt.Sprintf("%d %ss", n, noun)
}
