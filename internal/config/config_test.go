package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/testpath"
)

// abs names an absolute path on the platform running the test. A bare
// "/srv/store" is not absolute on Windows, so resolve would treat it as
// relative and join it against the base. See internal/testpath.
func abs(slash string) string { return testpath.Abs(slash) }

// write puts a configuration file in a temporary directory and returns its path.
func write(t *testing.T, body string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "canvas.yml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// sep joins entries the way GIT_TICKET_CANVAS_STORES does on this platform.
func sep(parts ...string) string {
	return strings.Join(parts, string(os.PathListSeparator))
}

func TestLoadReadsEachSource(t *testing.T) {
	file := write(t, `
stores:
  - name: fromfile
    path: /srv/one
`)
	cfg, err := Load(file, sep("fromenv=/srv/two"), []string{"fromflag=/srv/three"}, "/base")
	if err != nil {
		t.Fatal(err)
	}
	got := cfg.SortedNames()
	want := []string{"fromenv", "fromfile", "fromflag"}
	if len(got) != len(want) {
		t.Fatalf("names = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("names = %v, want %v", got, want)
		}
	}
}

func TestPrecedenceByName(t *testing.T) {
	// The paths are absolute so that the file alone case asserts the file's own
	// value. A relative path in a configuration file resolves against that
	// file's directory, which is a temporary directory here.
	fromFile := abs("/from/file")
	file := write(t, "stores:\n  - name: shared\n    path: "+fromFile+
		"\n  - name: onlyfile\n    path: "+abs("/only/file")+"\n")
	for _, tc := range []struct {
		name  string
		env   string
		flags []string
		want  string
	}{
		{"env beats file", sep("shared=" + abs("/from/env")), nil, abs("/from/env")},
		{"flag beats file", "", []string{"shared=" + abs("/from/flag")}, abs("/from/flag")},
		{"flag beats env", sep("shared=" + abs("/from/env")), []string{"shared=" + abs("/from/flag")}, abs("/from/flag")},
		{"file alone", "", nil, fromFile},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg, err := Load(file, tc.env, tc.flags, abs("/base"))
			if err != nil {
				t.Fatal(err)
			}
			store, ok := cfg.Lookup("shared")
			if !ok {
				t.Fatal("store shared is missing")
			}
			if store.Path != tc.want {
				t.Errorf("path = %q, want %q", store.Path, tc.want)
			}
			// A higher-ranked source replaces one store, not the whole list.
			if _, ok := cfg.Lookup("onlyfile"); !ok {
				t.Error("onlyfile was dropped; precedence replaced the list instead of the entry")
			}
		})
	}
}

func TestFileRelativePathResolvesAgainstFileDirectory(t *testing.T) {
	file := write(t, `
stores:
  - name: rel
    path: ../sibling
`)
	cfg, err := Load(file, "", nil, "/somewhere/else")
	if err != nil {
		t.Fatal(err)
	}
	store, _ := cfg.Lookup("rel")
	want := filepath.Join(filepath.Dir(filepath.Dir(file)), "sibling")
	if store.Path != want {
		t.Errorf("path = %q, want %q; a relative path in the file must resolve against the file", store.Path, want)
	}
}

func TestFlagRelativePathResolvesAgainstBase(t *testing.T) {
	base := abs("/work/base")
	cfg, err := Load("", "", []string{"rel=sub/dir"}, base)
	if err != nil {
		t.Fatal(err)
	}
	store, _ := cfg.Lookup("rel")
	if want := filepath.Join(base, "sub", "dir"); store.Path != want {
		t.Errorf("path = %q, want %q", store.Path, want)
	}
}

// A forward slash after the tilde is the portable spelling and the one people
// write, so it expands everywhere. Accepting only filepath.Separator left
// "~/notes" unexpanded on Windows and joined against the base instead.
func TestTildeExpands(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("no home directory in this environment")
	}
	forms := []string{"~/notes", "~"}
	wants := []string{filepath.Join(home, "notes"), home}
	if filepath.Separator != '/' {
		forms = append(forms, "~"+string(filepath.Separator)+"notes")
		wants = append(wants, filepath.Join(home, "notes"))
	}
	for i, form := range forms {
		t.Run(form, func(t *testing.T) {
			cfg, err := Load("", "", []string{"h=" + form}, abs("/base"))
			if err != nil {
				t.Fatal(err)
			}
			store, _ := cfg.Lookup("h")
			if store.Path != wants[i] {
				t.Errorf("path = %q, want %q", store.Path, wants[i])
			}
		})
	}
}

func TestBarePathTakesNameFromDirectory(t *testing.T) {
	cfg, err := Load("", "", []string{"/srv/git-ticket-canvas"}, "/base")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := cfg.Lookup("git-ticket-canvas"); !ok {
		t.Fatalf("names = %v, want a store named git-ticket-canvas", cfg.Names())
	}
}

// The bare form is what keeps `git-ticket-canvas --store .` working.
func TestBareDotKeepsWorking(t *testing.T) {
	base := abs("/work/project")
	cfg, err := Load("", "", []string{"."}, base)
	if err != nil {
		t.Fatal(err)
	}
	store, ok := cfg.Lookup("project")
	if !ok {
		t.Fatalf("names = %v, want a store named project", cfg.Names())
	}
	if store.Path != base {
		t.Errorf("path = %q, want %q", store.Path, base)
	}
}

func TestNameSplitsOnFirstEqualsOnly(t *testing.T) {
	// A Windows path carries a colon, and the list separator there is a
	// semicolon, so only the first '=' may split a NAME=PATH entry.
	got, err := ParseFlags([]string{`win=C:\srv\store`}, `/base`)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Name != "win" {
		t.Fatalf("got %+v, want one store named win", got)
	}
	// The path keeps everything after the first '=', colon included. Where it
	// resolves to depends on the platform, so assert only that the colon
	// survived rather than the resolved form.
	if !strings.Contains(got[0].Path, `C:\srv\store`) {
		t.Errorf("path = %q, want it to hold everything after the first =", got[0].Path)
	}
}

func TestPathHoldingEqualsIsNotMistakenForAName(t *testing.T) {
	// An absolute path holding '=' has no valid name before it, so the whole
	// value is the path.
	odd := abs("/srv/odd=dir")
	got, err := ParseFlags([]string{odd}, abs("/base"))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d stores, want 1", len(got))
	}
	if got[0].Path != odd {
		t.Errorf("path = %q, want %q", got[0].Path, odd)
	}
}

func TestDuplicateNameInOneSourceIsRejected(t *testing.T) {
	_, err := Load("", sep("same=/a", "same=/b"), nil, "/base")
	if err == nil {
		t.Fatal("want an error for two stores named the same in one source")
	}
	if !strings.Contains(err.Error(), "same") {
		t.Errorf("error %q does not name the offending store", err)
	}
	if !strings.Contains(err.Error(), EnvStores) {
		t.Errorf("error %q does not say which source it came from", err)
	}
}

func TestTwoNamesForOnePathAreRejected(t *testing.T) {
	store := abs("/srv/store")
	_, err := Load("", sep("one="+store, "two="+store), nil, abs("/base"))
	if err == nil {
		t.Fatal("want an error when two names share one path")
	}
	for _, want := range []string{"one", "two", store} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q does not mention %q", err, want)
		}
	}
}

func TestInvalidNameIsRejected(t *testing.T) {
	for _, name := range []string{"has space", "has/slash", "has.dot", strings.Repeat("x", MaxNameLen+1)} {
		t.Run(name, func(t *testing.T) {
			if err := ValidName(name); err == nil {
				t.Errorf("ValidName(%q) = nil, want an error", name)
			}
		})
	}
	for _, name := range []string{"ok", "with-dash", "with_underscore", "MixedCase99"} {
		t.Run(name, func(t *testing.T) {
			if err := ValidName(name); err != nil {
				t.Errorf("ValidName(%q) = %v, want nil", name, err)
			}
		})
	}
}

func TestInvalidNameFromFileIsRejected(t *testing.T) {
	file := write(t, `
stores:
  - name: "bad name"
    path: /srv/one
`)
	if _, err := Load(file, "", nil, "/base"); err == nil {
		t.Fatal("want an error for an invalid store name in the file")
	}
}

func TestEmptyFileIsValid(t *testing.T) {
	cfg, err := Load(write(t, ""), "", nil, "/base")
	if err != nil {
		t.Fatalf("an empty configuration file is a valid empty list: %v", err)
	}
	if len(cfg.Stores) != 0 {
		t.Errorf("stores = %v, want none", cfg.Stores)
	}
}

func TestUnknownKeyIsRejected(t *testing.T) {
	// `store:` written for `stores:` must fail at startup rather than serving
	// an empty list.
	file := write(t, `
store:
  - name: typo
    path: /srv/one
`)
	if _, err := Load(file, "", nil, "/base"); err == nil {
		t.Fatal("want an error for an unknown configuration key")
	}
}

func TestRootDefaultsToDefaultDepth(t *testing.T) {
	file := write(t, `
roots:
  - path: /srv/workspace
  - path: /srv/other
    depth: 2
`)
	cfg, err := Load(file, "", nil, "/base")
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Roots) != 2 {
		t.Fatalf("roots = %d, want 2", len(cfg.Roots))
	}
	if cfg.Roots[0].Depth != DefaultDepth {
		t.Errorf("depth = %d, want the default %d", cfg.Roots[0].Depth, DefaultDepth)
	}
	if cfg.Roots[1].Depth != 2 {
		t.Errorf("depth = %d, want the configured 2", cfg.Roots[1].Depth)
	}
}

func TestNegativeDepthIsRejected(t *testing.T) {
	file := write(t, `
roots:
  - path: /srv/workspace
    depth: -1
`)
	if _, err := Load(file, "", nil, "/base"); err == nil {
		t.Fatal("want an error for a negative depth")
	}
}

func TestPerStoreOverridesSurvive(t *testing.T) {
	file := write(t, `
stores:
  - name: personal
    path: /srv/notes
    readOnly: true
    actor: agent:canvas/local
`)
	cfg, err := Load(file, "", nil, "/base")
	if err != nil {
		t.Fatal(err)
	}
	store, _ := cfg.Lookup("personal")
	if !store.ReadOnly {
		t.Error("readOnly was dropped")
	}
	if store.Actor != "agent:canvas/local" {
		t.Errorf("actor = %q, want agent:canvas/local", store.Actor)
	}
}

func TestExcludeSurvives(t *testing.T) {
	file := write(t, `
exclude:
  - "**/node_modules"
roots:
  - path: /srv/workspace
    exclude: [archive]
`)
	cfg, err := Load(file, "", nil, "/base")
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Exclude) != 1 || cfg.Exclude[0] != "**/node_modules" {
		t.Errorf("exclude = %v, want [**/node_modules]", cfg.Exclude)
	}
	if len(cfg.Roots) != 1 || len(cfg.Roots[0].Exclude) != 1 || cfg.Roots[0].Exclude[0] != "archive" {
		t.Errorf("root exclude = %v, want [archive]", cfg.Roots)
	}
}

func TestDeriveName(t *testing.T) {
	for _, tc := range []struct{ path, want string }{
		{"/srv/git-ticket-canvas", "git-ticket-canvas"},
		{"/srv/my.project", "my-project"},
		{"/srv/with space", "with-space"},
		{"/", "store"},
	} {
		if got := DeriveName(tc.path); got != tc.want {
			t.Errorf("DeriveName(%q) = %q, want %q", tc.path, got, tc.want)
		}
	}
}

func TestMissingFileIsAnError(t *testing.T) {
	if _, err := Load(filepath.Join(t.TempDir(), "absent.yml"), "", nil, "/base"); err == nil {
		t.Fatal("want an error for a configuration file that is not there")
	}
}

func TestEmptyEnvAndFlagsAreIgnored(t *testing.T) {
	cfg, err := Load("", sep("", ""), []string{"", "  "}, "/base")
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Stores) != 0 {
		t.Errorf("stores = %v, want none", cfg.Stores)
	}
}

func TestAddRootsResolvesAndDefaultsDepth(t *testing.T) {
	var cfg Config
	base, absolute := abs("/base"), abs("/abs/ws")
	if err := cfg.AddRoots([]string{"ws", absolute, "", "  "}, 0, base); err != nil {
		t.Fatal(err)
	}
	if len(cfg.Roots) != 2 {
		t.Fatalf("roots = %v, want 2; blank values are ignored", cfg.Roots)
	}
	if cfg.Roots[0].Path != filepath.Join(base, "ws") || cfg.Roots[1].Path != absolute {
		t.Errorf("paths = %q, %q", cfg.Roots[0].Path, cfg.Roots[1].Path)
	}
	for _, r := range cfg.Roots {
		if r.Depth != DefaultDepth {
			t.Errorf("depth = %d, want the default %d", r.Depth, DefaultDepth)
		}
	}
}

// Roots from the file keep their own depth, so adding one from the command
// line appends rather than rewriting what the file asked for.
func TestAddRootsAppendsToFileRoots(t *testing.T) {
	file := write(t, `
roots:
  - path: /from/file
    depth: 2
`)
	cfg, err := Load(file, "", nil, "/base")
	if err != nil {
		t.Fatal(err)
	}
	if err := cfg.AddRoots([]string{"/from/flag"}, 6, "/base"); err != nil {
		t.Fatal(err)
	}
	if len(cfg.Roots) != 2 {
		t.Fatalf("roots = %v, want 2", cfg.Roots)
	}
	if cfg.Roots[0].Depth != 2 {
		t.Errorf("file root depth = %d, want its configured 2", cfg.Roots[0].Depth)
	}
	if cfg.Roots[1].Depth != 6 {
		t.Errorf("flag root depth = %d, want 6", cfg.Roots[1].Depth)
	}
}

func TestEffectiveExclude(t *testing.T) {
	on, off := true, false
	base := Config{Exclude: []string{"mine"}}
	if got := base.EffectiveExclude(); len(got) != len(DefaultExclude)+1 {
		t.Errorf("EffectiveExclude = %v, want the defaults plus mine", got)
	}
	base.ExcludeDefaults = &on
	if got := base.EffectiveExclude(); len(got) != len(DefaultExclude)+1 {
		t.Errorf("EffectiveExclude with defaults on = %v", got)
	}
	base.ExcludeDefaults = &off
	if got := base.EffectiveExclude(); len(got) != 1 || got[0] != "mine" {
		t.Errorf("EffectiveExclude with defaults off = %v, want [mine]", got)
	}
}
