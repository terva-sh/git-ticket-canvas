package discover

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/config"
)

// store makes dir a valid ticket store: a .tickets holding a config.yml that
// parses.
func store(t *testing.T, root string, parts ...string) string {
	t.Helper()
	dir := filepath.Join(append([]string{root}, parts...)...)
	if err := os.MkdirAll(filepath.Join(dir, StoreDir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, StoreDir, configFile),
		[]byte("schema: 3\nactors: []\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return dir
}

// plain makes an ordinary directory.
func plain(t *testing.T, root string, parts ...string) string {
	t.Helper()
	dir := filepath.Join(append([]string{root}, parts...)...)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	return dir
}

// found lists the store paths relative to the root, for readable assertions.
func found(t *testing.T, root string, result Result) []string {
	t.Helper()
	var paths []string
	for _, s := range result.Stores {
		rel, err := filepath.Rel(root, s.Path)
		if err != nil {
			t.Fatal(err)
		}
		paths = append(paths, filepath.ToSlash(rel))
	}
	sort.Strings(paths)
	return paths
}

func walkOne(root string, depth int) Result {
	return Walk([]config.Root{{Path: root, Depth: depth}})
}

func assertFound(t *testing.T, got, want []string) {
	t.Helper()
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("found %v, want %v", got, want)
	}
}

func TestDepthBoundsTheWalk(t *testing.T) {
	root := t.TempDir()
	store(t, root, "shallow")               // 1 level
	store(t, root, "forge", "org", "repo")  // 3 levels
	store(t, root, "a", "b", "c", "d", "e") // 5 levels
	plain(t, root, "forge", "org", "other") // not a store
	for _, tc := range []struct {
		depth int
		want  []string
	}{
		{1, []string{"shallow"}},
		{3, []string{"forge/org/repo", "shallow"}},
		{5, []string{"a/b/c/d/e", "forge/org/repo", "shallow"}},
	} {
		t.Run("depth", func(t *testing.T) {
			assertFound(t, found(t, root, walkOne(root, tc.depth)), tc.want)
		})
	}
}

// A workspace laid out as forge/org/repo puts a store three levels down, which
// is why the default is 4 rather than 3: one level of slack.
func TestDefaultDepthCoversForgeOrgRepo(t *testing.T) {
	root := t.TempDir()
	store(t, root, "forge", "org", "repo")
	store(t, root, "deep", "a", "b", "c", "d")
	if config.DefaultDepth != 4 {
		t.Fatalf("DefaultDepth = %d, want 4", config.DefaultDepth)
	}
	// Depth 0 means "unset", so the walk uses the default.
	assertFound(t, found(t, root, walkOne(root, 0)), []string{"forge/org/repo"})
}

func TestTheRootItselfCanBeAStore(t *testing.T) {
	root := t.TempDir()
	store(t, root)
	assertFound(t, found(t, root, walkOne(root, 4)), []string{"."})
}

func TestHiddenDirectoriesAreNotDescendedButTicketsIsStillFound(t *testing.T) {
	root := t.TempDir()
	// The store lives behind a normal directory, and its own .tickets is
	// hidden. Finding it proves the two rules are separate.
	store(t, root, "project")
	store(t, root, ".hidden", "buried")
	assertFound(t, found(t, root, walkOne(root, 4)), []string{"project"})

	var sawHidden bool
	for _, d := range walkOne(root, 4).Decisions {
		if strings.HasSuffix(d.Path, ".hidden") && d.Reason == "hidden directory" {
			sawHidden = true
		}
	}
	if !sawHidden {
		t.Error("the walk did not record skipping the hidden directory")
	}
}

func TestSymbolicLinksAreNotFollowed(t *testing.T) {
	root := t.TempDir()
	target := t.TempDir()
	store(t, target, "linked")
	store(t, root, "real")
	if err := os.Symlink(target, filepath.Join(root, "link")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	assertFound(t, found(t, root, walkOne(root, 4)), []string{"real"})
}

// A link pointing at its own ancestor is the shape that hangs a naive walk.
func TestASymbolicLinkCycleDoesNotHang(t *testing.T) {
	root := t.TempDir()
	inner := plain(t, root, "inner")
	store(t, root, "inner", "project")
	if err := os.Symlink(root, filepath.Join(inner, "loop")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	// A depth well past the cycle would spin forever if links were followed.
	assertFound(t, found(t, root, walkOne(root, 12)), []string{"inner/project"})
}

func TestAStoreInsideAStoreIsNotDescendedInto(t *testing.T) {
	root := t.TempDir()
	store(t, root, "project")
	// This is the shape of this repository's own committed canvas fixture,
	// which lives under docs/artifacts inside a real store.
	store(t, root, "project", "docs", "artifacts", "fixture")
	assertFound(t, found(t, root, walkOne(root, 12)), []string{"project"})
}

func TestOnlyAParseableConfigQualifies(t *testing.T) {
	root := t.TempDir()
	store(t, root, "good")

	// A .tickets with no config.yml at all.
	if err := os.MkdirAll(filepath.Join(root, "noconfig", StoreDir), 0o755); err != nil {
		t.Fatal(err)
	}
	// A .tickets whose config.yml is not YAML.
	if err := os.MkdirAll(filepath.Join(root, "unparseable", StoreDir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "unparseable", StoreDir, configFile),
		[]byte("this: [is: not: valid\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	result := walkOne(root, 4)
	assertFound(t, found(t, root, result), []string{"good"})

	reasons := map[string]string{}
	for _, d := range result.Decisions {
		reasons[filepath.Base(d.Path)] = d.Reason
	}
	if !strings.Contains(reasons["noconfig"], "no "+configFile) {
		t.Errorf("noconfig reason = %q, want it to name the missing file", reasons["noconfig"])
	}
	if !strings.Contains(reasons["unparseable"], "does not parse") {
		t.Errorf("unparseable reason = %q, want it to say the config does not parse", reasons["unparseable"])
	}
}

// A directory holding an unusable .tickets still belongs to somebody, so the
// walk does not go underneath it looking for more.
func TestABrokenStoreIsStillABoundary(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "broken", StoreDir), 0o755); err != nil {
		t.Fatal(err)
	}
	store(t, root, "broken", "nested")
	if got := found(t, root, walkOne(root, 8)); len(got) != 0 {
		t.Errorf("found %v, want nothing below a directory that owns a .tickets", got)
	}
}

func TestSeveralRootsAndOverlap(t *testing.T) {
	root := t.TempDir()
	store(t, root, "one", "project")
	store(t, root, "two", "project")

	result := Walk([]config.Root{
		{Path: filepath.Join(root, "one"), Depth: 4},
		{Path: filepath.Join(root, "two"), Depth: 4},
	})
	assertFound(t, found(t, root, result), []string{"one/project", "two/project"})

	// Overlapping roots must not report one store twice.
	overlap := Walk([]config.Root{{Path: root, Depth: 4}, {Path: filepath.Join(root, "one"), Depth: 4}})
	assertFound(t, found(t, root, overlap), []string{"one/project", "two/project"})
}

func TestDepthIsRecordedRelativeToItsRoot(t *testing.T) {
	root := t.TempDir()
	store(t, root, "forge", "org", "repo")
	result := walkOne(root, 4)
	if len(result.Stores) != 1 {
		t.Fatalf("found %d stores, want 1", len(result.Stores))
	}
	if result.Stores[0].Depth != 3 {
		t.Errorf("depth = %d, want 3 for forge/org/repo", result.Stores[0].Depth)
	}
	if result.Stores[0].Root != root {
		t.Errorf("root = %q, want %q", result.Stores[0].Root, root)
	}
}

func TestAnUnreadableRootIsReportedNotFatal(t *testing.T) {
	root := t.TempDir()
	store(t, root, "fine")
	result := Walk([]config.Root{
		{Path: filepath.Join(root, "absent"), Depth: 4},
		{Path: root, Depth: 4},
	})
	assertFound(t, found(t, root, result), []string{"fine"})
}

// Files are not candidates and a file named .tickets is not a store.
func TestAFileNamedTicketsIsNotAStore(t *testing.T) {
	root := t.TempDir()
	dir := plain(t, root, "impostor")
	if err := os.WriteFile(filepath.Join(dir, StoreDir), []byte("not a directory"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := found(t, root, walkOne(root, 4)); len(got) != 0 {
		t.Errorf("found %v, want nothing", got)
	}
}

// A .tickets that is a symbolic link is an alias for a store kept elsewhere.
//
// This is not hypothetical. A workspace root with `.tickets -> ledger/.tickets`
// as a convenience shortcut made the whole workspace look like one store, and
// the boundary rule then hid all 22 projects under it. Found by pointing the
// walk at a real workspace, which no temporary tree had reproduced.
func TestASymlinkedTicketsIsNotAStoreAndDoesNotHideTheTree(t *testing.T) {
	root := t.TempDir()
	real := store(t, root, "ledger")
	store(t, root, "forge", "org", "repo")

	if err := os.Symlink(filepath.Join(real, StoreDir), filepath.Join(root, StoreDir)); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}

	got := found(t, root, walkOne(root, 4))
	assertFound(t, got, []string{"forge/org/repo", "ledger"})
	for _, path := range got {
		if path == "." {
			t.Error("the root was taken for a store through its symlinked .tickets")
		}
	}
}

// The store a link points at is still found once, at its real path.
func TestAnAliasedStoreIsFoundOnceAtItsRealPath(t *testing.T) {
	root := t.TempDir()
	real := store(t, root, "ledger")
	if err := os.Symlink(filepath.Join(real, StoreDir), filepath.Join(root, "alias", StoreDir)); err != nil {
		if err := os.MkdirAll(filepath.Join(root, "alias"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(filepath.Join(real, StoreDir), filepath.Join(root, "alias", StoreDir)); err != nil {
			t.Skipf("symlinks unavailable: %v", err)
		}
	}
	assertFound(t, found(t, root, walkOne(root, 4)), []string{"ledger"})
}
