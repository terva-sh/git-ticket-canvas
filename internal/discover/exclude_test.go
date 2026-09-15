package discover

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/config"
	"github.com/terva-sh/git-ticket-canvas/internal/testpath"
)

func TestMatchPattern(t *testing.T) {
	for _, tc := range []struct {
		pattern, target string
		want            bool
	}{
		{"**/node_modules", "a/b/node_modules", true},
		{"**/node_modules", "node_modules", true},
		{"**/node_modules", "a/node_modules/b", false},
		{"node_modules/**", "node_modules/a/b", true},
		{"a/**/c", "a/c", true},
		{"a/**/c", "a/b/c", true},
		{"a/**/c", "a/b/x/c", true},
		{"a/**/c", "a/b/x", false},
		{"**", "anything/at/all", true},
		{"*.tmp", "scratch.tmp", true},
		{"*.tmp", "a/scratch.tmp", false},
		{"**/*.tmp", "a/scratch.tmp", true},
		{"org/?epo", "org/repo", true},
		{"org/repo", "org/other", false},
		// * does not cross a separator, which is what path.Match gives per
		// segment and what ** exists to do instead.
		{"a/*", "a/b/c", false},
	} {
		if got := matchPattern(tc.pattern, tc.target); got != tc.want {
			t.Errorf("matchPattern(%q, %q) = %v, want %v", tc.pattern, tc.target, got, tc.want)
		}
	}
}

func TestMatcherClassifiesByShape(t *testing.T) {
	root := testpath.Abs("/ws")
	for _, tc := range []struct {
		name, entry, dir string
		want             bool
	}{
		{"bare name at depth", "node_modules", "/ws/a/b/node_modules", true},
		{"bare name at top", "node_modules", "/ws/node_modules", true},
		{"bare name does not match a prefix", "node", "/ws/node_modules", false},
		{"absolute subtree", "/ws/org", "/ws/org", true},
		{"absolute subtree below", "/ws/org", "/ws/org/repo", true},
		{"absolute subtree sibling", "/ws/org", "/ws/organism", false},
		{"relative path from root", "archive", "/ws/archive", true},
		{"relative multi-segment", "old/stuff", "/ws/old/stuff", true},
		{"relative multi-segment below", "old/stuff", "/ws/old/stuff/deep", true},
		{"relative does not match elsewhere", "old/stuff", "/ws/other/old/stuff", false},
		{"pattern", "**/node_modules", "/ws/a/node_modules", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// An entry written as an absolute path has to be absolute on this
			// platform too, or the matcher classifies it as a relative one.
			entry := tc.entry
			if strings.HasPrefix(entry, "/") {
				entry = testpath.Abs(entry)
			}
			m := NewMatcher(root, []string{entry})
			got, by := m.Match(testpath.Abs(tc.dir))
			if got != tc.want {
				t.Errorf("Match(%q) with %q = %v, want %v", tc.dir, entry, got, tc.want)
			}
			if got && by != entry {
				t.Errorf("matched by %q, want the entry %q reported back", by, entry)
			}
		})
	}
}

// A bare name is scoped to its root, which is what "relative to that root"
// asks for: a per-root exclusion must not reach into a different root.
func TestAPerRootExclusionStaysInItsRoot(t *testing.T) {
	root := t.TempDir()
	store(t, root, "one", "archive", "project")
	store(t, root, "two", "archive", "project")

	result := Walk(config.Config{Roots: []config.Root{
		{Path: filepath.Join(root, "one"), Depth: 4, Exclude: []string{"archive"}},
		{Path: filepath.Join(root, "two"), Depth: 4},
	}})
	assertFound(t, found(t, root, result), []string{"two/archive/project"})
}

func TestAnExcludedSubtreeIsNeverEntered(t *testing.T) {
	root := t.TempDir()
	store(t, root, "keep", "project")
	store(t, root, "drop", "project")

	result := Walk(config.Config{
		Roots:   []config.Root{{Path: root, Depth: 6}},
		Exclude: []string{filepath.Join(root, "drop")},
	})
	assertFound(t, found(t, root, result), []string{"keep/project"})

	// Skipped where the child was about to be enqueued, so nothing below it was
	// ever read. A decision for the store inside it would mean the walk went in
	// and filtered afterwards.
	for _, d := range result.Decisions {
		if strings.Contains(d.Path, filepath.Join("drop", "project")) {
			t.Errorf("the walk entered the excluded subtree: %+v", d)
		}
	}
}

func TestTheExcludingEntryIsRecorded(t *testing.T) {
	root := t.TempDir()
	store(t, root, "skipme", "project")
	result := Walk(config.Config{
		Roots:   []config.Root{{Path: root, Depth: 4}},
		Exclude: []string{"skipme"},
	})
	var reason string
	for _, d := range result.Decisions {
		if filepath.Base(d.Path) == "skipme" {
			reason = d.Reason
		}
	}
	if !strings.Contains(reason, "skipme") {
		t.Errorf("reason = %q, want it to name the entry that excluded the directory", reason)
	}
}

func TestDefaultExclusionsApply(t *testing.T) {
	root := t.TempDir()
	store(t, root, "project")
	for _, name := range config.DefaultExclude {
		store(t, root, name, "buried")
	}
	assertFound(t, found(t, root, walkOne(root, 6)), []string{"project"})
}

func TestDefaultExclusionsCanBeReplaced(t *testing.T) {
	root := t.TempDir()
	store(t, root, "node_modules", "buried")
	off := false
	result := Walk(config.Config{
		Roots:           []config.Root{{Path: root, Depth: 4}},
		ExcludeDefaults: &off,
	})
	assertFound(t, found(t, root, result), []string{"node_modules/buried"})
}

func TestConfiguredExclusionsExtendTheDefaults(t *testing.T) {
	root := t.TempDir()
	store(t, root, "project")
	store(t, root, "node_modules", "buried")
	store(t, root, "mine", "buried")
	result := Walk(config.Config{
		Roots:   []config.Root{{Path: root, Depth: 4}},
		Exclude: []string{"mine"},
	})
	// Adding one entry must not lose the built-in list.
	assertFound(t, found(t, root, result), []string{"project"})
}

// An exclusion governs searching. A store somebody named is never searched for,
// so it survives, and the contradiction is reported rather than resolved in
// silence.
func TestAnExclusionDoesNotRemoveAnExplicitStore(t *testing.T) {
	root := t.TempDir()
	named := store(t, root, "node_modules", "deliberate")

	cfg := config.Config{
		Roots:  []config.Root{{Path: root, Depth: 4}},
		Stores: []config.Store{{Name: "deliberate", Path: named}},
	}

	// The walk does not find it, because searching is what exclusions govern.
	if got := found(t, root, Walk(cfg)); len(got) != 0 {
		t.Errorf("the walk found %v, want nothing inside an excluded directory", got)
	}

	warnings := ExcludedExplicit(cfg)
	if len(warnings) != 1 {
		t.Fatalf("warnings = %v, want one", warnings)
	}
	for _, want := range []string{"deliberate", "node_modules"} {
		if !strings.Contains(warnings[0], want) {
			t.Errorf("warning %q does not mention %q", warnings[0], want)
		}
	}
}

func TestNoWarningWithoutAContradiction(t *testing.T) {
	root := t.TempDir()
	named := store(t, root, "ordinary")
	cfg := config.Config{
		Roots:  []config.Root{{Path: root, Depth: 4}},
		Stores: []config.Store{{Name: "ordinary", Path: named}},
	}
	if got := ExcludedExplicit(cfg); len(got) != 0 {
		t.Errorf("warnings = %v, want none", got)
	}
	// Nor when nothing is being searched at all.
	if got := ExcludedExplicit(config.Config{Stores: cfg.Stores}); len(got) != 0 {
		t.Errorf("warnings = %v, want none when there are no roots", got)
	}
}

func TestBlankEntriesAreIgnored(t *testing.T) {
	m := NewMatcher("/ws", []string{"", "   "})
	if got, _ := m.Match("/ws/anything"); got {
		t.Error("a blank exclusion matched")
	}
}
