package api

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/config"
	"github.com/terva-sh/git-ticket-canvas/internal/discover"
)

// storeDir makes a directory that discovery accepts as a store. The merge needs
// only the shape on disk, so this is cheaper than initializing a real one.
func storeDir(t *testing.T, parts ...string) string {
	t.Helper()
	dir := filepath.Join(parts...)
	if err := os.MkdirAll(filepath.Join(dir, ".tickets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".tickets", "config.yml"),
		[]byte("schema: 3\nactors: []\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return dir
}

func names(specs []StoreSpec) []string {
	var out []string
	for _, s := range specs {
		out = append(out, s.Name)
	}
	return out
}

// Naming a store is the instruction. A root, a depth, and an exclusion all
// govern searching, and none of them can take back something you asked for.
func TestMergeServesAnExplicitStoreWhateverTheSearchSays(t *testing.T) {
	root := t.TempDir()
	outside := storeDir(t, t.TempDir(), "elsewhere")
	excluded := storeDir(t, root, "node_modules", "deliberate")

	cfg := config.Config{
		Stores: []config.Store{
			{Name: "outside", Path: outside},
			{Name: "deliberate", Path: excluded},
		},
		Roots: []config.Root{{Path: root, Depth: 4}},
	}
	specs, _, _ := Merge(cfg, discover.Scan(cfg), MergeOptions{})
	if got := names(specs); strings.Join(got, ",") != "outside,deliberate" {
		t.Errorf("stores = %v, want both named entries", got)
	}
}

// A store that is not on disk keeps its place. The registry lists it as
// unavailable with the reason, which is more use than its silent absence.
func TestMergeKeepsANamedStoreThatIsNotThere(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "gone")
	cfg := config.Config{Stores: []config.Store{{Name: "gone", Path: missing}}}

	specs, _, _ := Merge(cfg, discover.Scan(cfg), MergeOptions{})
	if len(specs) != 1 || specs[0].Path != missing {
		t.Fatalf("specs = %+v, want the missing store kept", specs)
	}

	r := NewRegistry(RegistryOptions{})
	if err := r.OpenStore(specs[0]); err != nil {
		t.Fatal(err)
	}
	status := r.Statuses()[0]
	if status.Available || status.Reason == "" {
		t.Errorf("status = %+v, want unavailable with a reason", status)
	}
}

// Everything the explicit entry sets wins. Discovery contributes the fact that
// the store was also found, and nothing else.
func TestMergeLetsTheExplicitEntryWin(t *testing.T) {
	root := t.TempDir()
	path := storeDir(t, root, "project")

	cfg := config.Config{
		Stores: []config.Store{{Name: "mine", Path: path, Actor: "human:me", ReadOnly: true}},
		Roots:  []config.Root{{Path: root, Depth: 4}},
	}
	specs, notes, _ := Merge(cfg, discover.Scan(cfg), MergeOptions{Actor: "agent:other"})
	if len(specs) != 1 {
		t.Fatalf("stores = %v, want one", names(specs))
	}
	if specs[0].Name != "mine" || specs[0].Actor != "human:me" || !specs[0].ReadOnly {
		t.Errorf("spec = %+v, want the configured name, actor, and mode", specs[0])
	}
	// Discovery dropped the duplicate before the merge saw it, so the note comes
	// from the scan. Either way the overlap is reported rather than silent.
	var said bool
	for _, line := range append(notes, decisionReasons(discover.Scan(cfg))...) {
		if strings.Contains(line, "the same store") || strings.Contains(line, "also found") {
			said = true
		}
	}
	if !said {
		t.Error("the overlap between the named store and the search was not reported")
	}
}

// Merge is also correct on a plain walk, which is what a rescan of one root
// will hand it.
func TestMergeDropsADiscoveredDuplicateOfANamedStore(t *testing.T) {
	root := t.TempDir()
	path := storeDir(t, root, "project")
	cfg := config.Config{
		Stores: []config.Store{{Name: "mine", Path: path}},
		Roots:  []config.Root{{Path: root, Depth: 4}},
	}
	specs, notes, _ := Merge(cfg, discover.Walk(cfg), MergeOptions{})
	if got := names(specs); len(got) != 1 || got[0] != "mine" {
		t.Errorf("stores = %v, want only the named entry", got)
	}
	if len(notes) != 1 || !strings.Contains(notes[0], "also found") {
		t.Errorf("notes = %v, want one saying the store was also found", notes)
	}
}

// One store reached by two paths is one store. A workspace reached through a
// link and the same workspace reached directly are the ordinary case.
func TestMergeJoinsPathsThatDifferByASymbolicLink(t *testing.T) {
	root := t.TempDir()
	real := storeDir(t, root, "real", "project")
	link := filepath.Join(root, "link")
	if err := os.Symlink(filepath.Join(root, "real"), link); err != nil {
		t.Fatal(err)
	}

	cfg := config.Config{
		Stores: []config.Store{{Name: "named", Path: filepath.Join(link, "project")}},
		Roots:  []config.Root{{Path: filepath.Dir(real), Depth: 2}},
	}
	specs, _, _ := Merge(cfg, discover.Scan(cfg), MergeOptions{})
	if got := names(specs); len(got) != 1 || got[0] != "named" {
		t.Errorf("stores = %v, want one entry under the configured name", got)
	}
}

// ~ is expanded before anything else sees it, so the two spellings arrive here
// as one path. The test holds that promise from the outside.
func TestMergeJoinsATildePathWithADiscoveredOne(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	storeDir(t, home, "project")

	cfg, err := config.Load("", "", []string{"~/project"}, home)
	if err != nil {
		t.Fatal(err)
	}
	if err := cfg.AddRoots([]string{home}, 2, home); err != nil {
		t.Fatal(err)
	}
	specs, _, _ := Merge(cfg, discover.Scan(cfg), MergeOptions{})
	if len(specs) != 1 {
		t.Errorf("stores = %v, want one", names(specs))
	}
}

// A path inside a repository names the repository, because that is the store
// ticket.Discover opens when the path is served.
func TestMergeJoinsAPathInsideAStoreWithTheStore(t *testing.T) {
	root := t.TempDir()
	path := storeDir(t, root, "project")
	inside := filepath.Join(path, "docs")
	if err := os.MkdirAll(inside, 0o755); err != nil {
		t.Fatal(err)
	}

	cfg := config.Config{
		Stores: []config.Store{{Name: "named", Path: inside}},
		Roots:  []config.Root{{Path: root, Depth: 4}},
	}
	specs, _, _ := Merge(cfg, discover.Scan(cfg), MergeOptions{})
	if got := names(specs); len(got) != 1 || got[0] != "named" {
		t.Errorf("stores = %v, want one entry", got)
	}
}

// Two roots laid out the same way is an ordinary workspace, not a mistake.
// Keeping both, under ids that do not move between runs, is the whole point.
func TestMergeKeepsBothStoresWhenTheNamesCollide(t *testing.T) {
	root := t.TempDir()
	storeDir(t, root, "one", "org", "repo")
	storeDir(t, root, "two", "org", "repo")

	cfg := config.Config{Roots: []config.Root{
		{Path: filepath.Join(root, "one"), Depth: 3},
		{Path: filepath.Join(root, "two"), Depth: 3},
	}}
	specs, _, _ := Merge(cfg, discover.Scan(cfg), MergeOptions{})
	if len(specs) != 2 {
		t.Fatalf("stores = %v, want both", names(specs))
	}
	if specs[0].Name == specs[1].Name {
		t.Fatalf("both stores are called %q", specs[0].Name)
	}
	for _, s := range specs {
		if err := config.ValidName(s.Name); err != nil {
			t.Errorf("name %q is not usable in a URL: %v", s.Name, err)
		}
	}
	again, _, _ := Merge(cfg, discover.Scan(cfg), MergeOptions{})
	if strings.Join(names(again), ",") != strings.Join(names(specs), ",") {
		t.Errorf("names moved between runs: %v then %v", names(specs), names(again))
	}
}

// An id is a function of a path alone, so a child's id no longer spells out its
// parent. The relationship travels in Parent, which is what the browser nests
// by, and in the display name, which is what a person reads.
func TestMergeRecordsAChildsParentRatherThanEncodingIt(t *testing.T) {
	root := t.TempDir()
	parent := storeDir(t, root, "project")
	inner := storeDir(t, parent, "fixtures", "inner")
	declareChild(t, parent, "fixtures/inner")

	cfg := config.Config{Roots: []config.Root{{Path: root, Depth: 3}}}
	specs, _, _ := Merge(cfg, discover.Scan(cfg), MergeOptions{})
	byPath := map[string]StoreSpec{}
	for _, s := range specs {
		byPath[s.Path] = s
	}
	child, ok := byPath[inner]
	if !ok {
		t.Fatalf("the declared child is missing from %v", names(specs))
	}
	if child.Parent != byPath[parent].Name {
		t.Errorf("child parent = %q, want the parent's id %q", child.Parent, byPath[parent].Name)
	}
	if strings.Contains(child.Name, byPath[parent].Name) {
		t.Errorf("child id %q spells out its parent; an id is a function of its own path", child.Name)
	}
	if child.Display != "inner" {
		t.Errorf("child displays %q, want %q", child.Display, "inner")
	}
}

// The global flag forces read-only over anything a store or a declaration asks
// for. A flag that only sometimes refuses writes is worse than no flag.
func TestMergeGlobalReadOnlyBeatsEveryStore(t *testing.T) {
	root := t.TempDir()
	storeDir(t, root, "project")
	cfg := config.Config{
		Stores: []config.Store{{Name: "writable", Path: storeDir(t, root, "named")}},
		Roots:  []config.Root{{Path: root, Depth: 3}},
	}
	specs, _, _ := Merge(cfg, discover.Scan(cfg), MergeOptions{ReadOnly: true})
	for _, s := range specs {
		if !s.ReadOnly {
			t.Errorf("store %q is writable under --read-only", s.Name)
		}
	}
}

// Every id has to be usable as a URL path segment, whatever the path it came
// from. The hash is hexadecimal and the leaf is trimmed, so the only way this
// fails is a leaf that ends in a separator after trimming.
func TestHashedIDIsAlwaysAValidName(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{
		"repo",
		"weird name",
		"with.dots",
		strings.Repeat("long", 40),
		"....",
		"-leading-dash",
	} {
		dir := storeDir(t, root, name)
		id := hashedID(dir)
		if err := config.ValidName(id); err != nil {
			t.Errorf("hashedID for %q = %q, which is not a valid name: %v", name, id, err)
		}
		if len(id) > IDLeafLen+1+IDHashLen {
			t.Errorf("hashedID for %q = %q, %d characters, over the bound", name, id, len(id))
		}
	}
}

// declareChild writes a canvas.children entry into a store's configuration.
func declareChild(t *testing.T, store, path string) {
	t.Helper()
	file := filepath.Join(store, ".tickets", "config.yml")
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	body := append(data, []byte("canvas:\n  children:\n    - path: "+path+"\n")...)
	if err := os.WriteFile(file, body, 0o600); err != nil {
		t.Fatal(err)
	}
}

func decisionReasons(result discover.Result) []string {
	var out []string
	for _, d := range result.Decisions {
		out = append(out, d.Reason)
	}
	return out
}

// A display name is what the row shows, and it is the directory holding the
// store rather than the id, which has a workspace to stay unique across.
func TestDisplayName(t *testing.T) {
	for _, c := range []struct{ path, want string }{
		{"/ws/org/alpine/.tickets", "alpine"},
		{"/ws/org/alpine", "alpine"},
		{"/ws/org/alpine/", "alpine"},
		{"/ws/ledger/.tickets", "ledger"},
		// A path that never reached discover.Nearest, which is every store
		// that was named and is not on disk.
		{"/ws/org/not-there", "not-there"},
	} {
		if got := DisplayName(c.path); got != c.want {
			t.Errorf("DisplayName(%q) = %q, want %q", c.path, got, c.want)
		}
	}
}

// The rule is what the operator wrote. A name a person chose is kept, and a
// name the canvas derived is replaced by something readable.
func TestMergeFillsDisplayNames(t *testing.T) {
	root := t.TempDir()
	deep := storeDir(t, root, "forge", "org", "alpine")
	// Two directories sharing a base name, which must display the same and
	// stay distinct as ids.
	twinA := storeDir(t, root, "forge", "one", "docs")
	twinB := storeDir(t, root, "forge", "two", "docs")
	child := storeDir(t, root, "forge", "org", "alpine", "fixture")
	chosen := storeDir(t, root, "elsewhere")
	missing := filepath.Join(root, "not-there")

	cfg := config.Config{Stores: []config.Store{
		{Name: "chosen", Path: chosen},
		{Name: "gone", Path: missing},
	}}
	found := discover.Result{Stores: []discover.Found{
		{Path: deep, Root: root},
		{Path: twinA, Root: root},
		{Path: twinB, Root: root},
		{Path: child, Root: root, Name: "declared-name", DeclaredBy: deep},
	}}
	specs, _, _ := Merge(cfg, found, MergeOptions{})

	display := map[string]string{}
	for _, spec := range specs {
		if spec.Display == "" {
			t.Errorf("store %q has no display name", spec.Name)
		}
		display[spec.Path] = spec.Display
	}

	for path, want := range map[string]string{
		chosen:  "chosen",        // a name a person wrote is kept
		missing: "gone",          // and is kept when the store is not on disk
		deep:    "alpine",        // a derived id gets the directory instead
		child:   "declared-name", // a child keeps what its parent called it
		twinA:   "docs",
		twinB:   "docs",
	} {
		if got := display[path]; got != want {
			t.Errorf("%s displays %q, want %q", path, got, want)
		}
	}

	// Sharing a display name must not make two stores one store.
	var twins []string
	for _, spec := range specs {
		if spec.Path == twinA || spec.Path == twinB {
			twins = append(twins, spec.Name)
		}
	}
	if len(twins) != 2 || twins[0] == twins[1] {
		t.Errorf("twin ids %v, want two distinct", twins)
	}
	for _, id := range twins {
		if strings.Contains(id, "docs-") && len(id) < 10 {
			t.Errorf("id %q looks like a disambiguating suffix on the display name", id)
		}
	}
}

// The defect this scheme replaced: an id moved when an unrelated store was
// added, and the bare id it vacated began resolving to the new store.
func TestAnIDDoesNotMoveWhenAnotherStoreIsAdded(t *testing.T) {
	root := t.TempDir()
	tail := filepath.Join("platform-services", "data-plane", "ingestion", "collectors", "otel-collector")
	alpha := storeDir(t, root, "alpha-organisation", tail)
	beta := storeDir(t, root, "beta-organisation", tail)

	ids := func() map[string]string {
		cfg := config.Config{Roots: []config.Root{{Path: root, Depth: 10}}}
		specs, _, err := Merge(cfg, discover.Scan(cfg), MergeOptions{})
		if err != nil {
			t.Fatal(err)
		}
		out := map[string]string{}
		for _, s := range specs {
			out[s.Path] = s.Name
		}
		return out
	}

	before := ids()
	// Two stores differing only near the root, which the slug scheme trimmed
	// away and then collided.
	if before[alpha] == before[beta] {
		t.Fatalf("alpha and beta share the id %q", before[alpha])
	}

	// A third organisation, sorting ahead of both, is what used to move them.
	storeDir(t, root, "aaa-organisation", tail)
	after := ids()
	for _, path := range []string{alpha, beta} {
		if before[path] != after[path] {
			t.Errorf("id for %s moved from %q to %q when an unrelated store was added",
				filepath.Base(filepath.Dir(path)), before[path], after[path])
		}
	}
}

// One store reached two ways is one store. Resolving the link is what stops
// two registry entries holding two watchers over one set of tickets.
func TestASymlinkedPathProducesTheSameID(t *testing.T) {
	root := t.TempDir()
	real := storeDir(t, root, "real", "repo")
	link := filepath.Join(root, "link")
	if err := os.Symlink(filepath.Join(root, "real"), link); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if direct, through := hashedID(real), hashedID(filepath.Join(link, "repo")); direct != through {
		t.Errorf("the same store has ids %q and %q depending on the path used", direct, through)
	}
}

// A collision refuses rather than renaming. Two written names that are equal
// reach the same refusal a hash collision would, which is the only way to
// exercise it without 48 bits of luck.
func TestTwoStoresClaimingOneIDRefuse(t *testing.T) {
	root := t.TempDir()
	first := storeDir(t, root, "first")
	second := storeDir(t, root, "second")
	cfg := config.Config{Stores: []config.Store{
		{Name: "same", Path: first},
		{Name: "same", Path: second},
	}}
	_, _, err := Merge(cfg, discover.Result{}, MergeOptions{})
	if err == nil {
		t.Fatal("two stores claiming one id were accepted")
	}
	for _, want := range []string{first, second, "same"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("refusal %q does not name %q", err, want)
		}
	}
}

// An unnamed --store is a derived name, so it is hashed. Two of them whose
// directories share a base name used to derive one name and fail to register.
func TestUnnamedStoresSharingABaseNameGetDistinctIDs(t *testing.T) {
	root := t.TempDir()
	first := storeDir(t, root, "one", "docs")
	second := storeDir(t, root, "two", "docs")
	cfg := config.Config{Stores: []config.Store{
		{Name: config.DeriveName(first), Derived: true, Path: first},
		{Name: config.DeriveName(second), Derived: true, Path: second},
	}}
	specs, _, err := Merge(cfg, discover.Result{}, MergeOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if specs[0].Name == specs[1].Name {
		t.Errorf("both stores took the id %q", specs[0].Name)
	}
	for _, s := range specs {
		if s.Display != "docs" {
			t.Errorf("store %q displays %q, want %q", s.Name, s.Display, "docs")
		}
	}
}
