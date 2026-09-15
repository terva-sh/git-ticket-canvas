package discover

import (
	"fmt"
	"path"
	"path/filepath"
	"strings"

	"github.com/terva-sh/git-ticket-canvas/internal/config"
)

// An exclusion keeps a directory out of the walk. One mechanism covers both the
// build directories nobody wants searched and the paths an operator names,
// because they are the same request and two mechanisms would need two
// explanations.
//
// An entry is classified once, by its own shape, and that shape means the same
// thing wherever the entry appears:
//
//   - An absolute path excludes that directory and everything below it.
//   - An entry holding *, ? or [ is a pattern, matched against the candidate's
//     path relative to its root, where ** spans any number of segments.
//   - An entry holding a separator but no pattern character is a relative path,
//     resolved against its root, excluding that subtree.
//   - A bare name matches any directory with that name, at any depth.
//
// The bare-name rule is what makes node_modules work as a default and is what
// somebody means when they write one.
type exclusion struct {
	raw string
	// kind is one of subtree, pattern, or name.
	kind excludeKind
	// value is the absolute path for a subtree, the pattern for a pattern, or
	// the directory name for a name.
	value string
}

type excludeKind int

const (
	excludeSubtree excludeKind = iota
	excludePattern
	excludeName
)

// Matcher decides whether a directory is excluded from one root's walk.
type Matcher struct {
	root  string
	rules []exclusion
}

// NewMatcher compiles the entries that apply to one root.
//
// Relative paths resolve against root, which is why a matcher belongs to a root
// rather than being shared across all of them.
func NewMatcher(root string, entries ...[]string) *Matcher {
	m := &Matcher{root: root}
	for _, list := range entries {
		for _, raw := range list {
			entry := strings.TrimSpace(raw)
			if entry == "" {
				continue
			}
			m.rules = append(m.rules, compile(root, entry))
		}
	}
	return m
}

func compile(root, entry string) exclusion {
	switch {
	case strings.ContainsAny(entry, "*?["):
		return exclusion{raw: entry, kind: excludePattern, value: filepath.ToSlash(entry)}
	case filepath.IsAbs(entry):
		return exclusion{raw: entry, kind: excludeSubtree, value: filepath.Clean(entry)}
	case strings.ContainsRune(entry, '/'), strings.ContainsRune(entry, filepath.Separator):
		return exclusion{raw: entry, kind: excludeSubtree, value: filepath.Join(root, entry)}
	default:
		return exclusion{raw: entry, kind: excludeName, value: entry}
	}
}

// Match reports whether a directory is excluded, and which entry excluded it.
func (m *Matcher) Match(dir string) (bool, string) {
	if m == nil {
		return false, ""
	}
	base := filepath.Base(dir)
	rel, err := filepath.Rel(m.root, dir)
	if err != nil {
		rel = dir
	}
	rel = filepath.ToSlash(rel)

	for _, rule := range m.rules {
		switch rule.kind {
		case excludeName:
			if base == rule.value {
				return true, rule.raw
			}
		case excludeSubtree:
			if dir == rule.value || strings.HasPrefix(dir, rule.value+string(filepath.Separator)) {
				return true, rule.raw
			}
		case excludePattern:
			if matchPattern(rule.value, rel) {
				return true, rule.raw
			}
			// A pattern written as **/node_modules should also catch the entry
			// at the top of the root, where the relative path has no leading
			// segment for ** to consume.
			if matchPattern(rule.value, base) {
				return true, rule.raw
			}
		}
	}
	return false, ""
}

// matchPattern matches a slash-separated pattern against a slash-separated
// path, with ** spanning any number of segments.
//
// path.Match has no **, and * there does not cross a separator, so the segments
// are walked here and path.Match decides one segment at a time.
func matchPattern(pattern, target string) bool {
	return matchSegments(strings.Split(pattern, "/"), strings.Split(target, "/"))
}

func matchSegments(pattern, target []string) bool {
	for len(pattern) > 0 {
		if pattern[0] == "**" {
			// Consume nothing, then one segment at a time, until something
			// matches or the target runs out.
			rest := pattern[1:]
			if len(rest) == 0 {
				return true
			}
			for i := 0; i <= len(target); i++ {
				if matchSegments(rest, target[i:]) {
					return true
				}
			}
			return false
		}
		if len(target) == 0 {
			return false
		}
		ok, err := path.Match(pattern[0], target[0])
		if err != nil || !ok {
			return false
		}
		pattern, target = pattern[1:], target[1:]
	}
	return len(target) == 0
}

// ExcludedExplicit names the explicitly configured stores that an exclusion
// would have matched.
//
// An exclusion governs searching, and an explicitly named store is never
// searched for, so nothing about it can be excluded. Naming a store and
// excluding its path is a contradiction rather than an instruction: the
// operator said two things, and the more specific one wins. Report it so the
// contradiction is visible instead of silently resolved.
func ExcludedExplicit(cfg config.Config) []string {
	if len(cfg.Stores) == 0 || len(cfg.Roots) == 0 {
		return nil
	}
	global := cfg.EffectiveExclude()
	var warnings []string
	for _, store := range cfg.Stores {
		for _, root := range cfg.Roots {
			m := NewMatcher(root.Path, global, root.Exclude)
			// Ask whether the walk could have reached this store, not only
			// whether its own directory name is excluded. A store inside
			// node_modules is unreachable because an ancestor is excluded, and
			// that is the contradiction worth reporting.
			if excluded, by := m.matchSelfOrAncestor(store.Path); excluded {
				warnings = append(warnings, fmt.Sprintf(
					"store %q at %s matches the exclusion %q; it is named explicitly, so it is served anyway",
					store.Name, store.Path, by))
				break
			}
		}
	}
	return warnings
}

// matchSelfOrAncestor reports whether a directory, or any directory between it
// and the root, is excluded.
//
// The walk never reaches a store whose ancestor was excluded, so asking only
// about the store's own name would miss exactly the case worth reporting: a
// store deliberately kept inside a directory the defaults skip.
func (m *Matcher) matchSelfOrAncestor(dir string) (bool, string) {
	if m == nil {
		return false, ""
	}
	root := filepath.Clean(m.root)
	for at := filepath.Clean(dir); ; {
		if excluded, by := m.Match(at); excluded {
			return true, by
		}
		if at == root {
			return false, ""
		}
		parent := filepath.Dir(at)
		// Stop at the filesystem root as well, for a store outside every root.
		if parent == at {
			return false, ""
		}
		at = parent
	}
}
