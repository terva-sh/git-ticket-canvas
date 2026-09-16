package state

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/testpath"
)

func openIn(t *testing.T) (*Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), FileName)
	s, warning := Open(path)
	if warning != "" {
		t.Fatalf("a first run warned: %s", warning)
	}
	return s, path
}

// The point of the file: what you marked is still marked next time.
func TestAFavoriteSurvivesARestart(t *testing.T) {
	s, path := openIn(t)
	if err := s.SetFavorite(LocalUser, "/src/one", true); err != nil {
		t.Fatal(err)
	}
	if err := s.SetLastStore(LocalUser, "/src/two"); err != nil {
		t.Fatal(err)
	}

	again, warning := Open(path)
	if warning != "" {
		t.Fatalf("reopening warned: %s", warning)
	}
	if !again.Favorite(LocalUser, "/src/one") {
		t.Error("the favorite did not survive")
	}
	if got := again.Snapshot(LocalUser).LastStore; got != "/src/two" {
		t.Errorf("last store = %q, want the one recorded", got)
	}
}

func TestSettingAndClearing(t *testing.T) {
	s, _ := openIn(t)
	for _, want := range []bool{true, false, true} {
		if err := s.SetFavorite(LocalUser, "/src/one", want); err != nil {
			t.Fatal(err)
		}
		if got := s.Favorite(LocalUser, "/src/one"); got != want {
			t.Errorf("favorite = %v, want %v", got, want)
		}
	}
	// Setting what is already set is not an error and does not duplicate.
	if err := s.SetFavorite(LocalUser, "/src/one", true); err != nil {
		t.Fatal(err)
	}
	if got := s.Snapshot(LocalUser).Favorites; len(got) != 1 {
		t.Errorf("favorites = %v, want one entry", got)
	}
}

// The reason the file is keyed at all: a canvas serving two people must not
// show one of them the other's favorites, or drop them into the store the
// other had open.
func TestOnePersonsStateIsInvisibleToAnother(t *testing.T) {
	s, path := openIn(t)
	drew, robin := Subject("drew"), Subject("robin")
	if err := s.SetFavorite(drew, "/src/ledger", true); err != nil {
		t.Fatal(err)
	}
	if err := s.SetLastStore(drew, "/src/ledger"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetFavorite(robin, "/src/website", true); err != nil {
		t.Fatal(err)
	}

	for _, c := range []struct {
		who   string
		wants string
		not   string
	}{
		{drew, "/src/ledger", "/src/website"},
		{robin, "/src/website", "/src/ledger"},
	} {
		if !s.Favorite(c.who, c.wants) {
			t.Errorf("%s lost their own favorite", c.who)
		}
		if s.Favorite(c.who, c.not) {
			t.Errorf("%s can see somebody else's favorite %s", c.who, c.not)
		}
	}
	if got := s.Snapshot(robin).LastStore; got != "" {
		t.Errorf("robin's last store = %q, want nothing; that was drew's", got)
	}
	if got := s.Warm(robin); len(got) != 1 || got[0] != "/src/website" {
		t.Errorf("robin's warm list = %v, want only their own favorite", got)
	}
	// Nobody signed in as the desk user, so the desk user has nothing. This is
	// the half that a global fallback would get wrong.
	if got := s.Snapshot(LocalUser); len(got.Favorites) != 0 || got.LastStore != "" {
		t.Errorf("the no-auth key inherited state from a signed-in user: %+v", got)
	}

	again, warning := Open(path)
	if warning != "" {
		t.Fatalf("reopening warned: %s", warning)
	}
	if !again.Favorite(drew, "/src/ledger") || again.Favorite(drew, "/src/website") {
		t.Error("the keys did not survive a restart separately")
	}
}

// A subject is an arbitrary string the provider chose, so one that happens to
// be the no-auth key must not collect the desk canvas's favorites.
func TestASubjectCannotCollideWithTheNoAuthKey(t *testing.T) {
	s, _ := openIn(t)
	if err := s.SetFavorite(LocalUser, "/src/desk", true); err != nil {
		t.Fatal(err)
	}
	if got := Subject(LocalUser); got == LocalUser {
		t.Fatalf("Subject(%q) = %q, which is the no-auth key", LocalUser, got)
	}
	if s.Favorite(Subject(LocalUser), "/src/desk") {
		t.Error("a user whose subject is the no-auth key inherited the desk canvas's favorites")
	}
}

// The store last used comes first, because it is the one most likely wanted,
// and it is not repeated when it is also a favorite.
func TestWarmLeadsWithTheLastStore(t *testing.T) {
	s, _ := openIn(t)
	for _, path := range []string{"/src/a", "/src/b"} {
		if err := s.SetFavorite(LocalUser, path, true); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.SetLastStore(LocalUser, "/src/b"); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(s.Warm(LocalUser), ","); got != "/src/b,/src/a" {
		t.Errorf("warm = %q, want the last store first and no repeat", got)
	}
}

// A file written before the canvas was keyed belonged to the one person at the
// desk, so it becomes that person's entry rather than nobody's.
func TestAVersionOneFileIsReadAndUpgradedInPlace(t *testing.T) {
	path := filepath.Join(t.TempDir(), FileName)
	const old = `{
  "version": 1,
  "favorites": ["/src/one", "/src/two"],
  "lastStore": "/src/two"
}
`
	if err := os.WriteFile(path, []byte(old), 0o600); err != nil {
		t.Fatal(err)
	}
	s, warning := Open(path)
	if warning != "" {
		t.Fatalf("reading a version 1 file warned: %s", warning)
	}
	held := s.Snapshot(LocalUser)
	if strings.Join(held.Favorites, ",") != "/src/one,/src/two" {
		t.Errorf("favorites = %v, want both carried over", held.Favorites)
	}
	if held.LastStore != "/src/two" {
		t.Errorf("last store = %q, want the one recorded", held.LastStore)
	}

	// Rewritten straight away, not at the next write, so a canvas that read the
	// file and then stopped has already answered whose the favorites were.
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var onDisk State
	if err := json.Unmarshal(data, &onDisk); err != nil {
		t.Fatal(err)
	}
	if onDisk.Version != currentVersion {
		t.Errorf("on-disk version = %d, want %d", onDisk.Version, currentVersion)
	}
	if got := onDisk.Users[LocalUser].LastStore; got != "/src/two" {
		t.Errorf("on-disk last store under %q = %q, want it moved there", LocalUser, got)
	}
	if !strings.Contains(string(data), `"favorites"`) {
		t.Error("the upgraded file lost the favorites key entirely")
	}
	// The version 1 fields are gone from the top level rather than duplicated.
	var top map[string]json.RawMessage
	if err := json.Unmarshal(data, &top); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"favorites", "lastStore"} {
		if _, ok := top[key]; ok {
			t.Errorf("the upgraded file still carries %q at the top level", key)
		}
	}
}

// An empty version 1 file has nothing to move, and must not invent an entry
// for somebody. A canvas that serves people also records who has used it.
func TestAnEmptyVersionOneFileUpgradesToNoUsers(t *testing.T) {
	path := filepath.Join(t.TempDir(), FileName)
	if err := os.WriteFile(path, []byte(`{"version":1}`), 0o600); err != nil {
		t.Fatal(err)
	}
	s, warning := Open(path)
	if warning != "" {
		t.Fatalf("reading an empty version 1 file warned: %s", warning)
	}
	if got := len(s.state.Users); got != 0 {
		t.Errorf("users = %d, want none", got)
	}
}

// Unmarking the last favorite leaves no entry, so the file does not become a
// list of everyone who has ever opened the canvas.
func TestAnEmptiedEntryIsDropped(t *testing.T) {
	s, path := openIn(t)
	who := Subject("passing-through")
	if err := s.SetFavorite(who, "/src/one", true); err != nil {
		t.Fatal(err)
	}
	if err := s.SetFavorite(who, "/src/one", false); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), who) {
		t.Errorf("an entry with nothing in it was kept: %s", data)
	}
}

// Losing a canvas over a corrupted list of favorites would be the wrong trade,
// so a broken file warns and starts empty, and the next write repairs it.
func TestACorruptedFileWarnsAndStartsEmpty(t *testing.T) {
	path := filepath.Join(t.TempDir(), FileName)
	if err := os.WriteFile(path, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	s, warning := Open(path)
	if warning == "" {
		t.Error("a corrupted state file loaded silently")
	}
	if len(s.Snapshot(LocalUser).Favorites) != 0 {
		t.Error("a corrupted state file produced favorites")
	}
	if err := s.SetFavorite(LocalUser, "/src/one", true); err != nil {
		t.Fatal(err)
	}
	repaired, warning := Open(path)
	if warning != "" || !repaired.Favorite(LocalUser, "/src/one") {
		t.Errorf("the file was not repaired by the next write: %s", warning)
	}
}

// An interrupted write must leave the previous state rather than half of the
// next one, which is what writing through a temporary name and renaming buys.
func TestWritingLeavesNoPartialFile(t *testing.T) {
	s, path := openIn(t)
	if err := s.SetFavorite(LocalUser, "/src/one", true); err != nil {
		t.Fatal(err)
	}
	if err := s.SetFavorite(LocalUser, "/src/two", true); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Errorf("a temporary file was left behind: %s", e.Name())
		}
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	// Windows has no Unix permission bits and reports -rw-rw-rw- for every
	// file, so the assertion cannot hold there. The file records favorites and
	// the last store rather than anything secret, which is why this is skipped
	// rather than replaced with an ACL check.
	if runtime.GOOS == "windows" {
		t.Skip("file modes are not enforced on Windows")
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("state file mode = %v, want 0600", perm)
	}
}

// Upgrading a version 1 file writes it, so the rewrite has to land under the
// same mode as every other write rather than under whatever the old file had.
func TestAnUpgradeKeepsTheFileMode(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("file modes are not enforced on Windows")
	}
	path := filepath.Join(t.TempDir(), FileName)
	if err := os.WriteFile(path, []byte(`{"version":1,"favorites":["/src/one"]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, warning := Open(path); warning != "" {
		t.Fatalf("upgrading warned: %s", warning)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("upgraded state file mode = %v, want 0600", perm)
	}
}

// Grants must not arrive in this file. A bug in the favorites path should not
// be able to corrupt a permission table, and the two have different owners.
//
// This is a shape assertion rather than a search for a word: it fails when a
// key is added, whatever it is called, so nobody has to have guessed the name
// in advance.
func TestTheFileHoldsNoPermissionData(t *testing.T) {
	s, path := openIn(t)
	if err := s.SetFavorite(Subject("drew"), "/src/one", true); err != nil {
		t.Fatal(err)
	}
	if err := s.SetLastStore(Subject("drew"), "/src/one"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	var top map[string]json.RawMessage
	if err := json.Unmarshal(data, &top); err != nil {
		t.Fatal(err)
	}
	assertKeys(t, "the state file", top, []string{"version", "users"})

	var users map[string]map[string]json.RawMessage
	if err := json.Unmarshal(top["users"], &users); err != nil {
		t.Fatal(err)
	}
	for who, held := range users {
		assertKeys(t, "the entry for "+who, held, []string{"favorites", "lastStore"})
	}
}

// assertKeys fails when an object carries anything but the keys named. The
// message says where a new one belongs instead, because the next person to add
// a field here will be reading this failure rather than the design document.
func assertKeys[V any](t *testing.T, what string, got map[string]V, want []string) {
	t.Helper()
	have := make([]string, 0, len(got))
	for key := range got {
		have = append(have, key)
	}
	sort.Strings(have)
	sort.Strings(want)
	if strings.Join(have, ",") == strings.Join(want, ",") {
		return
	}
	t.Errorf("%s carries %v, want exactly %v; preferences live here and permissions do not, "+
		"so a grant, a role, or an audit entry belongs in its own file", what, have, want)
}

func TestDirFollowsXDG(t *testing.T) {
	// XDG is not the rule on macOS or Windows, where Dir() answers from
	// Library/Application Support and LOCALAPPDATA. Asserting XDG semantics
	// there reports a defect that is not present, which is what the Windows
	// lane did. Those two branches are covered by the platform table below,
	// which needs no particular host to check them.
	if runtime.GOOS == "darwin" || runtime.GOOS == "windows" {
		t.Skipf("%s resolves by its own convention rather than XDG", runtime.GOOS)
	}
	state := testpath.Abs("/somewhere/state")
	t.Setenv("XDG_STATE_HOME", state)
	got, err := Dir()
	if err != nil {
		t.Fatal(err)
	}
	if got != filepath.Join(state, "git-ticket-canvas") {
		t.Errorf("Dir() = %q, want it under XDG_STATE_HOME", got)
	}

	// A relative value is not a state directory, so the default applies. The
	// home directory is read rather than set, because the variable that names
	// it differs by platform and this is a test about XDG, not about that.
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("no home directory in this environment")
	}
	t.Setenv("XDG_STATE_HOME", "relative")
	got, err = Dir()
	if err != nil {
		t.Fatal(err)
	}
	if got != filepath.Join(home, ".local", "state", "git-ticket-canvas") {
		t.Errorf("Dir() = %q, want the default under the home directory", got)
	}
}

// Every branch, on one machine, whichever machine that is.
//
// Every `want` here is a literal. Building one with filepath would ask the host
// what a path looks like, and the host is the thing these cases are written to
// disagree with: a Windows expectation assembled on Linux is not a Windows
// expectation. That is how this passed on Linux while three of its four
// branches were checking the resolver against the wrong platform's rules.
func TestTheStateDirectoryFollowsThePlatform(t *testing.T) {
	const home = "/home/person"
	const winHome = `C:\Users\p`
	for _, c := range []struct {
		name, goos, xdg, localAppData, home, want string
	}{
		{"macOS ignores XDG", "darwin", "/xdg", "", home,
			"/home/person/Library/Application Support/git-ticket-canvas"},
		{"Windows takes LOCALAPPDATA", "windows", "", `C:\Users\p\AppData\Local`, winHome,
			`C:\Users\p\AppData\Local\git-ticket-canvas`},
		{"Windows without it falls back", "windows", "", "", winHome,
			`C:\Users\p\.local\state\git-ticket-canvas`},
		// Rooted on the current drive rather than absolute, so it is not a
		// state directory: it would move with the working directory.
		{"Windows ignores a drive-relative XDG", "windows", `\state`, "", winHome,
			`C:\Users\p\.local\state\git-ticket-canvas`},
		{"Windows takes a volume-qualified XDG", "windows", `D:\state`, "", winHome,
			`D:\state\git-ticket-canvas`},
		{"Linux takes an absolute XDG", "linux", "/xdg", "", home, "/xdg/git-ticket-canvas"},
		// The specification says relative values are ignored, and a relative
		// state directory would put the actor record wherever the canvas
		// happened to be started from.
		{"Linux ignores a relative XDG", "linux", "relative/path", "", home,
			"/home/person/.local/state/git-ticket-canvas"},
		// A Windows path is not absolute to Linux either, and a value carried
		// between machines must not silently become a relative one.
		{"Linux ignores a Windows XDG", "linux", `C:\state`, "", home,
			"/home/person/.local/state/git-ticket-canvas"},
		{"Linux without XDG", "linux", "", "", home,
			"/home/person/.local/state/git-ticket-canvas"},
		{"nothing to go on", "linux", "", "", "", ""},
	} {
		t.Run(c.name, func(t *testing.T) {
			if got := dirFor(c.goos, c.xdg, c.localAppData, c.home); got != c.want {
				t.Errorf("dirFor(%q, %q, %q, %q) = %q, want %q",
					c.goos, c.xdg, c.localAppData, c.home, got, c.want)
			}
		})
	}
}

// macOS and Windows resolve somewhere new, so a canvas that ran before must not
// look as though it has never run. Nothing is moved; the old place is found.
func TestTheLegacyDirectoryIsStillFindable(t *testing.T) {
	legacy, err := LegacyDir()
	if err != nil {
		t.Skip("no home directory here")
	}
	if !strings.HasSuffix(filepath.ToSlash(legacy), ".local/state/"+Product) {
		t.Errorf("LegacyDir() = %q", legacy)
	}
}
