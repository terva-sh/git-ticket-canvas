package state

import (
	"os"
	"path/filepath"
	"runtime"
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
	if err := s.SetFavorite("/src/one", true); err != nil {
		t.Fatal(err)
	}
	if err := s.SetLastStore("/src/two"); err != nil {
		t.Fatal(err)
	}

	again, warning := Open(path)
	if warning != "" {
		t.Fatalf("reopening warned: %s", warning)
	}
	if !again.Favorite("/src/one") {
		t.Error("the favorite did not survive")
	}
	if got := again.Snapshot().LastStore; got != "/src/two" {
		t.Errorf("last store = %q, want the one recorded", got)
	}
}

func TestSettingAndClearing(t *testing.T) {
	s, _ := openIn(t)
	for _, want := range []bool{true, false, true} {
		if err := s.SetFavorite("/src/one", want); err != nil {
			t.Fatal(err)
		}
		if got := s.Favorite("/src/one"); got != want {
			t.Errorf("favorite = %v, want %v", got, want)
		}
	}
	// Setting what is already set is not an error and does not duplicate.
	if err := s.SetFavorite("/src/one", true); err != nil {
		t.Fatal(err)
	}
	if got := s.Snapshot().Favorites; len(got) != 1 {
		t.Errorf("favorites = %v, want one entry", got)
	}
}

// The store last used comes first, because it is the one most likely wanted,
// and it is not repeated when it is also a favorite.
func TestWarmLeadsWithTheLastStore(t *testing.T) {
	s, _ := openIn(t)
	for _, path := range []string{"/src/a", "/src/b"} {
		if err := s.SetFavorite(path, true); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.SetLastStore("/src/b"); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(s.Warm(), ","); got != "/src/b,/src/a" {
		t.Errorf("warm = %q, want the last store first and no repeat", got)
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
	if len(s.Snapshot().Favorites) != 0 {
		t.Error("a corrupted state file produced favorites")
	}
	if err := s.SetFavorite("/src/one", true); err != nil {
		t.Fatal(err)
	}
	repaired, warning := Open(path)
	if warning != "" || !repaired.Favorite("/src/one") {
		t.Errorf("the file was not repaired by the next write: %s", warning)
	}
}

// An interrupted write must leave the previous state rather than half of the
// next one, which is what writing through a temporary name and renaming buys.
func TestWritingLeavesNoPartialFile(t *testing.T) {
	s, path := openIn(t)
	if err := s.SetFavorite("/src/one", true); err != nil {
		t.Fatal(err)
	}
	if err := s.SetFavorite("/src/two", true); err != nil {
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

func TestDirFollowsXDG(t *testing.T) {
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
