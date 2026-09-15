package discover

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket/ticket"
)

// declares writes a canvas key into a store's own configuration, keeping what
// is already there.
func declares(t *testing.T, store string, body string) {
	t.Helper()
	path := filepath.Join(store, StoreDir, configFile)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(data, []byte(body)...), 0o600); err != nil {
		t.Fatal(err)
	}
}

// child is the usual declaration: one relative path under the canvas key.
func child(path string) string {
	return "canvas:\n  children:\n    - path: " + path + "\n"
}

func warningsMentioning(result Result, want string) []string {
	var hits []string
	for _, w := range result.Warnings {
		if strings.Contains(w, want) {
			hits = append(hits, w)
		}
	}
	return hits
}

// The boundary rule stops the walk at a store, so a store inside a store is
// invisible. A declaration is the one way past it.
func TestADeclaredChildIsFoundPastTheBoundary(t *testing.T) {
	root := t.TempDir()
	parent := store(t, root, "project")
	store(t, root, "project", "fixtures", "inner")

	assertFound(t, found(t, root, walkOne(root, 4)), []string{"project"})

	declares(t, parent, child("fixtures/inner"))
	assertFound(t, found(t, root, walkOne(root, 4)), []string{"project", "project/fixtures/inner"})
}

// The declaration, not the walk, is what reaches the child, so the depth that
// bounds searching does not apply to it.
func TestADeclaredChildIgnoresTheDepthLimit(t *testing.T) {
	root := t.TempDir()
	parent := store(t, root, "project")
	store(t, root, "project", "a", "b", "c", "d", "e", "inner")
	declares(t, parent, child("a/b/c/d/e/inner"))

	assertFound(t, found(t, root, walkOne(root, 1)),
		[]string{"project", "project/a/b/c/d/e/inner"})
}

func TestADeclaredChildCarriesItsNameAndMode(t *testing.T) {
	root := t.TempDir()
	parent := store(t, root, "project")
	store(t, root, "project", "inner")
	declares(t, parent, "canvas:\n  children:\n    - path: inner\n      name: fixture\n      readOnly: true\n")

	result := walkOne(root, 4)
	var got Found
	for _, f := range result.Stores {
		if filepath.Base(f.Path) == "inner" {
			got = f
		}
	}
	if got.Name != "fixture" {
		t.Errorf("name = %q, want the declared name", got.Name)
	}
	if !got.ReadOnly {
		t.Error("the declared child is not read-only")
	}
	if got.DeclaredBy != parent {
		t.Errorf("DeclaredBy = %q, want %q", got.DeclaredBy, parent)
	}
}

// A name a URL cannot hold is refused, and the child is still served under a
// derived name. Losing the store over its label would be the wrong trade.
func TestAnUnusableDeclaredNameIsDropped(t *testing.T) {
	root := t.TempDir()
	parent := store(t, root, "project")
	store(t, root, "project", "inner")
	declares(t, parent, "canvas:\n  children:\n    - path: inner\n      name: \"has spaces/and a slash\"\n")

	result := walkOne(root, 4)
	assertFound(t, found(t, root, result), []string{"project", "project/inner"})
	for _, f := range result.Stores {
		if filepath.Base(f.Path) == "inner" && f.Name != "" {
			t.Errorf("name = %q, want it dropped so one is derived", f.Name)
		}
	}
	if len(warningsMentioning(result, "name")) != 1 {
		t.Errorf("warnings = %v, want one about the name", result.Warnings)
	}
}

func TestADeclaredPathThatEscapesIsRefused(t *testing.T) {
	root := t.TempDir()
	outside := store(t, root, "elsewhere")
	link := filepath.Join(root, "project", "away")

	for _, tc := range []struct {
		name, path, want string
		setup            func()
	}{
		{name: "absolute", path: outside, want: "absolute"},
		{name: "dot dot", path: "../elsewhere", want: "leaves"},
		{name: "the parent itself", path: ".", want: "leaves"},
		{name: "missing", path: "nowhere", want: "cannot be resolved"},
		{
			name: "symbolic link",
			path: "away",
			want: "symbolic link",
			setup: func() {
				if err := os.Symlink(outside, link); err != nil {
					t.Fatal(err)
				}
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			parent := store(t, root, "project")
			if tc.setup != nil {
				tc.setup()
			}
			t.Cleanup(func() { os.Remove(link) })
			declares(t, parent, child(tc.path))

			result := Declared(parent)
			if len(result.Stores) != 0 {
				t.Errorf("found %+v, want the declaration refused", result.Stores)
			}
			if len(warningsMentioning(result, tc.want)) != 1 {
				t.Errorf("warnings = %v, want one saying %q", result.Warnings, tc.want)
			}
		})
	}
}

// A directory that is not a store is refused like any other candidate, because
// declaring something does not make it one.
func TestADeclaredPathThatIsNotAStoreIsRefused(t *testing.T) {
	root := t.TempDir()
	parent := store(t, root, "project")
	plain(t, root, "project", "docs")
	declares(t, parent, child("docs"))

	result := Declared(parent)
	if len(result.Stores) != 0 {
		t.Errorf("found %+v, want nothing", result.Stores)
	}
	if len(result.Warnings) != 1 {
		t.Errorf("warnings = %v, want one", result.Warnings)
	}
}

func TestAChainOfDeclarationsIsBounded(t *testing.T) {
	root := t.TempDir()
	parent := store(t, root, "project")
	at := parent
	for i := 0; i < MaxChildDepth+1; i++ {
		next := store(t, at, "inner")
		declares(t, at, child("inner"))
		at = next
	}

	result := Declared(parent)
	if len(result.Stores) != MaxChildDepth {
		t.Errorf("found %d stores, want the chain bounded at %d", len(result.Stores), MaxChildDepth)
	}
	var stopped bool
	for _, d := range result.Decisions {
		if strings.Contains(d.Reason, "chain limit") {
			stopped = true
		}
	}
	if !stopped {
		t.Error("nothing recorded why the chain stopped")
	}
}

// Containment makes a lexical cycle impossible, so the one worth testing is the
// one a symbolic link builds. The walk must end either way.
func TestACycleTerminates(t *testing.T) {
	root := t.TempDir()
	parent := store(t, root, "project")
	inner := store(t, root, "project", "inner")
	if err := os.Symlink(parent, filepath.Join(inner, "back")); err != nil {
		t.Fatal(err)
	}
	declares(t, parent, child("inner"))
	declares(t, inner, child("back"))

	result := Declared(parent)
	if len(result.Stores) != 1 {
		t.Errorf("found %+v, want only the child", result.Stores)
	}
}

// The person running the canvas outranks the project it serves.
func TestAnExclusionVetoesADeclaredChild(t *testing.T) {
	root := t.TempDir()
	parent := store(t, root, "project")
	store(t, root, "project", "node_modules", "inner")
	declares(t, parent, child("node_modules/inner"))

	result := walkOne(root, 4)
	assertFound(t, found(t, root, result), []string{"project"})
	if len(warningsMentioning(result, "node_modules")) != 1 {
		t.Errorf("warnings = %v, want one naming the exclusion", result.Warnings)
	}
}

// Absent, empty, and malformed all mean the same thing to the walk: a store
// that loads with no children. Only the malformed one says anything.
func TestAStoreLoadsWhateverItsCanvasKeyHolds(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		warn       bool
	}{
		{name: "absent", body: ""},
		{name: "empty", body: "canvas:\n"},
		{name: "empty children", body: "canvas:\n  children: []\n"},
		{name: "wrong type", body: "canvas: nonsense\n", warn: true},
		{name: "children not a list", body: "canvas:\n  children: nope\n", warn: true},
		{name: "unrelated keys", body: "canvas:\n  favourites: [a]\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			parent := store(t, root, "project")
			declares(t, parent, tc.body)

			result := walkOne(root, 4)
			assertFound(t, found(t, root, result), []string{"project"})
			if got := len(result.Warnings); (got > 0) != tc.warn {
				t.Errorf("warnings = %v, want warning: %v", result.Warnings, tc.warn)
			}
		})
	}
}

// The definition of done: a store carrying the key still passes
// git ticket check --strict. Strict counts warnings, so both lists must be
// empty. Asking the library rather than the binary keeps the test on the
// version this module depends on.
func TestAStoreCarryingTheKeyStillChecksStrict(t *testing.T) {
	dir := t.TempDir()
	st, err := ticket.Init(dir, ticket.InitOptions{Actor: ticket.Actor{ID: "agent:test/children", Name: "Children test"}})
	if err != nil {
		t.Fatal(err)
	}
	declares(t, dir, child("inner"))

	// Reopen, so the check reads the configuration as written rather than as
	// Init left it in memory.
	st, err = ticket.Open(st.Path())
	if err != nil {
		t.Fatalf("a store carrying the canvas key does not open: %v", err)
	}
	report, err := st.Check(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Errors) != 0 || len(report.Warnings) != 0 {
		t.Errorf("check reported %+v errors and %+v warnings, want none", report.Errors, report.Warnings)
	}
}

// A store named on the command line is still a store, so it exposes its
// children the same way a discovered one does.
func TestDeclaredWorksWithoutARoot(t *testing.T) {
	root := t.TempDir()
	parent := store(t, root, "project")
	store(t, root, "project", "inner")
	declares(t, parent, child("inner"))

	result := Declared(parent)
	if len(result.Stores) != 1 {
		t.Fatalf("found %+v, want the one child", result.Stores)
	}
	got := result.Stores[0]
	// The child is rooted at the store that declared it, which is what makes
	// its position relative to that store rather than to the search root.
	if got.Root != parent {
		t.Errorf("root = %q, want the declaring store %q", got.Root, parent)
	}
	if rel, err := filepath.Rel(got.Root, got.Path); err != nil || rel != "inner" {
		t.Errorf("path below the declaring store = %q (%v), want %q", rel, err, "inner")
	}
	if got.Depth != 1 {
		t.Errorf("depth = %d, want 1", got.Depth)
	}
}
