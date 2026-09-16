package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/config"
	"github.com/terva-sh/git-ticket-canvas/internal/discover"
	"github.com/terva-sh/git-ticket-canvas/internal/state"
)

func stateIn(t *testing.T) (*state.Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), state.FileName)
	s, warning := state.Open(path)
	if warning != "" {
		t.Fatalf("a first run warned: %s", warning)
	}
	return s, path
}

func TestFavoritesRouteSetsAndClears(t *testing.T) {
	remembered, _ := stateIn(t)
	r, paths := lazyRegistry(t, RegistryOptions{State: remembered}, 2)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()

	empty := decodeResponse[favoritesResponse](t, request(t, server, "GET", "/api/favorites", "", http.StatusOK))
	if len(empty.Stores) != 0 {
		t.Errorf("favorites = %v, want none", empty.Stores)
	}

	set := decodeResponse[favoritesResponse](t, request(t, server, "PUT", "/api/favorites",
		`{"store":"b","favorite":true}`, http.StatusOK))
	if strings.Join(set.Stores, ",") != "b" {
		t.Errorf("favorites = %v, want b", set.Stores)
	}
	if set.Paths[0] != discover.Key(paths[1]) {
		t.Errorf("stored %q, want the resolved path", set.Paths[0])
	}
	for _, s := range r.Statuses() {
		if want := s.Name == "b"; s.Favorite != want {
			t.Errorf("store %q favorite = %v, want %v", s.Name, s.Favorite, want)
		}
	}

	cleared := decodeResponse[favoritesResponse](t, request(t, server, "PUT", "/api/favorites",
		`{"store":"b","favorite":false}`, http.StatusOK))
	if len(cleared.Stores) != 0 {
		t.Errorf("favorites = %v, want none after clearing", cleared.Stores)
	}

	request(t, server, "PUT", "/api/favorites", `{"store":"nope","favorite":true}`, http.StatusNotFound)
}

// A canvas keeping nothing says so rather than accepting a favorite it will
// silently drop.
func TestFavoritesRefusedWithoutState(t *testing.T) {
	r, _ := lazyRegistry(t, RegistryOptions{}, 1)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()
	request(t, server, "PUT", "/api/favorites", `{"store":"a","favorite":true}`, http.StatusConflict)
}

// An id is derived from a path relative to a root, so changing --root renames
// every store at once. A favorite keyed by id would be lost by a flag that was
// meant to change nothing about which stores exist.
// A root change used to rename every store, which is why favorites are keyed
// on resolved paths. Hashing an id over discover.Key removed the rename, so
// this now holds the stronger property: the id does not move either.
func TestARootChangeMovesNeitherTheFavoriteNorTheID(t *testing.T) {
	root := t.TempDir()
	path := storeDir(t, root, "org", "repo")
	remembered, _ := stateIn(t)

	serve := func(rootPath string, depth int) []StoreStatus {
		t.Helper()
		cfg := config.Config{Roots: []config.Root{{Path: rootPath, Depth: depth}}}
		specs, _, err := Merge(cfg, discover.Scan(cfg), MergeOptions{})
		if err != nil {
			t.Fatal(err)
		}
		r := NewRegistry(RegistryOptions{State: remembered})
		defer r.Close()
		for _, spec := range specs {
			if err := r.Register(spec); err != nil {
				t.Fatal(err)
			}
		}
		return r.Statuses()
	}

	first := serve(root, 3)
	if len(first) != 1 {
		t.Fatalf("stores = %+v, want one", first)
	}
	if err := remembered.SetFavorite(state.LocalUser, discover.Key(path), true); err != nil {
		t.Fatal(err)
	}

	// The same store, reached under a root one level down. The id is derived
	// from the store's own resolved path, so nothing about it depends on this.
	second := serve(filepath.Join(root, "org"), 2)
	if len(second) != 1 {
		t.Fatalf("stores = %+v, want one", second)
	}
	if second[0].Name != first[0].Name {
		t.Errorf("--root moved the id from %q to %q", first[0].Name, second[0].Name)
	}
	if second[0].Display != "repo" {
		t.Errorf("store displays %q, want %q", second[0].Display, "repo")
	}
	if !second[0].Favorite {
		t.Error("the favorite was lost across the root change")
	}
}

// Nothing here writes a configuration file. That file is written by hand, and a
// tool that rewrites it loses the comments and the ordering somebody put there.
func TestNoConfigurationFileIsRewritten(t *testing.T) {
	dir := t.TempDir()
	configFile := filepath.Join(dir, "canvas.yml")
	original := "# mine\nstores:\n  - name: a\n    path: " + dir + "\n"
	if err := os.WriteFile(configFile, []byte(original), 0o600); err != nil {
		t.Fatal(err)
	}

	remembered, statePath := stateIn(t)
	r, _ := lazyRegistry(t, RegistryOptions{State: remembered}, 1)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()
	request(t, server, "PUT", "/api/favorites", `{"store":"a","favorite":true}`, http.StatusOK)

	after, err := os.ReadFile(configFile)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != original {
		t.Errorf("the configuration file was rewritten:\n%s", after)
	}
	if _, err := os.Stat(statePath); err != nil {
		t.Errorf("the favorite was not written to the state file: %v", err)
	}
}

// The warm list from TKT-01M2HPBAB, filled for the first time with a real one.
func TestFavoritesAreOpenedAtStartup(t *testing.T) {
	remembered, _ := stateIn(t)
	r, paths := lazyRegistry(t, RegistryOptions{State: remembered}, 3)
	if err := remembered.SetFavorite(state.LocalUser, discover.Key(paths[2]), true); err != nil {
		t.Fatal(err)
	}
	r.opts.Warm = remembered.Warm(state.LocalUser)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, s := range r.Statuses() {
		if want := s.Name == "c"; s.Active != want {
			t.Errorf("store %q active = %v, want %v", s.Name, s.Active, want)
		}
	}
}

// Looking at a store records it, so the next run opens it without being asked.
func TestTheStoreLastLookedAtIsRemembered(t *testing.T) {
	remembered, _ := stateIn(t)
	r, paths := lazyRegistry(t, RegistryOptions{State: remembered}, 2)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()
	request(t, server, "GET", "/api/stores/b/board", "", http.StatusOK)

	if got := remembered.Snapshot(state.LocalUser).LastStore; got != discover.Key(paths[1]) {
		t.Errorf("last store = %q, want the one just looked at", got)
	}
	if got := remembered.Warm(state.LocalUser); len(got) == 0 || got[0] != discover.Key(paths[1]) {
		t.Errorf("warm = %v, want the store just looked at first", got)
	}
}

// The registry files what it remembers under the no-auth key, and under
// nothing else.
//
// A canvas on a desk has one person at it, so there is one key and this test
// can only see one half of the property. It is here so that teaching the
// registry to read a signed-in subject off the request is a change somebody
// makes on purpose, rather than one the suite happens to keep passing through.
func TestFavoritesAreFiledUnderTheNoAuthKey(t *testing.T) {
	remembered, _ := stateIn(t)
	r, paths := lazyRegistry(t, RegistryOptions{State: remembered}, 1)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()
	request(t, server, "PUT", "/api/favorites", `{"store":"a","favorite":true}`, http.StatusOK)
	request(t, server, "GET", "/api/stores/a/board", "", http.StatusOK)

	key := discover.Key(paths[0])
	if !remembered.Favorite(state.LocalUser, key) {
		t.Errorf("the favorite was not filed under %q", state.LocalUser)
	}
	if got := remembered.Snapshot(state.LocalUser).LastStore; got != key {
		t.Errorf("last store under %q = %q, want the store just looked at", state.LocalUser, got)
	}
	someone := state.Subject("someone-who-has-not-signed-in")
	if remembered.Favorite(someone, key) || remembered.Snapshot(someone).LastStore != "" {
		t.Error("a key nobody wrote under picked up the desk canvas's state")
	}
}
