package discover

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/config"
)

// render runs discovery and returns what --scan would print, with the
// temporary root replaced so the text can be compared as written.
func render(t *testing.T, cfg config.Config, root string) string {
	t.Helper()
	var out strings.Builder
	if err := Format(cfg, Scan(cfg), &out); err != nil {
		t.Fatal(err)
	}
	return strings.ReplaceAll(out.String(), root, "<root>")
}

func assertText(t *testing.T, got, want string) {
	t.Helper()
	if strings.TrimSpace(got) == strings.TrimSpace(want) {
		return
	}
	gotLines, wantLines := strings.Split(got, "\n"), strings.Split(want, "\n")
	for i := 0; i < len(gotLines) || i < len(wantLines); i++ {
		g, w := "", ""
		if i < len(gotLines) {
			g = gotLines[i]
		}
		if i < len(wantLines) {
			w = wantLines[i]
		}
		if g != w {
			t.Errorf("line %d:\n got %q\nwant %q", i+1, g, w)
		}
	}
}

// One tree exercising every rule at once. Asserting against the text covers
// depth, hidden directories, exclusions, the store boundary, a .tickets that
// does not qualify, and a declared child, in something a reviewer can read.
func TestScanExplainsEveryRule(t *testing.T) {
	root := t.TempDir()
	parent := store(t, root, "project")
	store(t, root, "project", "inner")                // hidden behind the boundary
	store(t, root, "project", "fixtures", "declared") // reached by declaration
	store(t, root, "node_modules", "buried")          // excluded by default
	store(t, root, "deep", "a", "b", "c")             // past the depth limit
	plain(t, root, ".hidden")                         // not descended into
	plain(t, root, "scratch", StoreDir)               // a .tickets that does not qualify
	declares(t, parent, child("fixtures/declared"))

	cfg := config.Config{Roots: []config.Root{{Path: root, Depth: 3}}}
	assertText(t, render(t, cfg, root), `<root>  depth 3
  skip  .hidden                    hidden directory
  skip  deep/a/b                   depth limit reached
  skip  node_modules               excluded by node_modules
  ok    project                    store
  ok    project/fixtures/declared  declared by project
  skip  scratch                    has .tickets but no config.yml

Nothing below a store is searched. A store inside another is listed only if the
parent names it under canvas.children in its own .tickets/config.yml.

2 stores, 4 skipped, 7 directories examined`)
}

// A store named on the command line, and whatever it declares, has no root to
// be reported under, so it gets its own section.
func TestScanSeparatesConfiguredStores(t *testing.T) {
	root := t.TempDir()
	parent := store(t, root, "project")
	store(t, root, "project", "inner")
	declares(t, parent, child("inner"))

	cfg := config.Config{Stores: []config.Store{{Name: "project", Path: parent}}}
	assertText(t, render(t, cfg, root), `configured
  ok    <root>/project  named explicitly
  ok    <root>/project/inner  declared by <root>/project

2 stores, 0 skipped, 2 directories examined`)
}

// A store named explicitly that also sits under a root is one store, reported
// where the operator put it rather than twice.
func TestScanRecordsAnExplicitStoreOnce(t *testing.T) {
	root := t.TempDir()
	named := store(t, root, "project")
	store(t, root, "other")

	cfg := config.Config{
		Stores: []config.Store{{Name: "project", Path: named}},
		Roots:  []config.Root{{Path: root, Depth: 3}},
	}
	assertText(t, render(t, cfg, root), `configured
  ok    <root>/project  named explicitly

<root>  depth 3
  ok    other    store
  skip  project  the same store, already listed at project

Nothing below a store is searched. A store inside another is listed only if the
parent names it under canvas.children in its own .tickets/config.yml.

2 stores, 1 skipped, 4 directories examined`)
}

func TestScanGroupsByRoot(t *testing.T) {
	root := t.TempDir()
	store(t, root, "one", "project")
	store(t, root, "two", "project")

	cfg := config.Config{Roots: []config.Root{
		{Path: filepath.Join(root, "two"), Depth: 2},
		{Path: filepath.Join(root, "one"), Depth: 2},
	}}
	got := render(t, cfg, root)
	if strings.Index(got, "<root>/two") > strings.Index(got, "<root>/one") {
		t.Errorf("roots are not in configured order:\n%s", got)
	}
}

// A contradiction between naming a store and excluding its path belongs in the
// explanation, not only in the server log.
func TestScanPrintsWarnings(t *testing.T) {
	root := t.TempDir()
	named := store(t, root, "node_modules", "deliberate")

	cfg := config.Config{
		Stores: []config.Store{{Name: "deliberate", Path: named}},
		Roots:  []config.Root{{Path: root, Depth: 3}},
	}
	got := render(t, cfg, root)
	if !strings.Contains(got, "warnings") || !strings.Contains(got, "it is served anyway") {
		t.Errorf("the contradiction is not explained:\n%s", got)
	}
}

// A link to a file was never a candidate, so reporting one would bury the links
// that could have been stores.
func TestScanReportsOnlyLinksThatCouldHaveBeenStores(t *testing.T) {
	root := t.TempDir()
	target := store(t, root, "target")
	if err := os.Symlink(target, filepath.Join(root, "link-to-store")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "file"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(root, "file"), filepath.Join(root, "link-to-file")); err != nil {
		t.Fatal(err)
	}

	got := render(t, config.Config{Roots: []config.Root{{Path: root, Depth: 3}}}, root)
	if !strings.Contains(got, "link-to-store") {
		t.Errorf("a link to a directory is not reported:\n%s", got)
	}
	if strings.Contains(got, "link-to-file") {
		t.Errorf("a link to a file is reported:\n%s", got)
	}
}
