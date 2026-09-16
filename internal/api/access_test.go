package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/discover"
	"github.com/terva-sh/git-ticket-canvas/internal/state"
)

// fakeAccess is one person and the stores they hold, with no identity provider
// and no grant table behind it.
//
// The registry's side of the boundary is what is under test here: given an
// answer about what a caller may read, does every route respect it. What
// decides that answer is internal/grants, tested there.
type fakeAccess struct {
	caller Caller
	// anonymous makes every request unauthenticated, which is what a served
	// canvas sees before somebody logs in.
	anonymous bool
	holds     map[string]bool
}

func (a *fakeAccess) Caller(*http.Request) (Caller, bool) {
	if a.anonymous {
		return Caller{}, false
	}
	return a.caller, true
}

func (a *fakeAccess) CanRead(_ Caller, store string) bool { return a.holds[store] }

// same reports whether two refusals are the same refusal, with the name each
// one echoes back taken out.
//
// Echoing the requested name is not a disclosure: the caller already knows what
// they asked for. What would be a disclosure is any other difference, because
// then the answer tells them whether the repository is here.
func same(a, aName, b, bName string) bool {
	return strings.ReplaceAll(a, aName, "NAME") == strings.ReplaceAll(b, bName, "NAME")
}

// grantedRegistry serves three stores, a, b and c, and grants the caller
// whichever of them are named.
func grantedRegistry(t *testing.T, access *fakeAccess) (*Registry, []string, *httptest.Server) {
	t.Helper()
	remembered, _ := stateIn(t)
	r, paths := lazyRegistry(t, RegistryOptions{State: remembered, Access: access}, 3)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	t.Cleanup(server.Close)
	return r, paths, server
}

// The store list is a permission boundary, not a convenience.
//
// It returns the name and the resolved filesystem path of every repository this
// host serves, and that is worth having even to somebody who cannot read a
// single ticket in any of them. The filter is in the handler because a filter
// in the browser is a rendering decision made after the data has left.
func TestTheStoreListIsFilteredInTheHandler(t *testing.T) {
	access := &fakeAccess{
		caller: Caller{Subject: "s1", StateKey: state.Subject("s1")},
		holds:  map[string]bool{"b": true},
	}
	_, paths, server := grantedRegistry(t, access)

	listed := decodeResponse[storesResponse](t,
		request(t, server, "GET", "/api/stores", "", http.StatusOK))
	if len(listed.Stores) != 1 || listed.Stores[0].Name != "b" {
		t.Fatalf("stores = %+v, want only the one granted", listed.Stores)
	}
	// Not the names, and not the paths either. The path is the disclosure.
	body := string(request(t, server, "GET", "/api/stores", "", http.StatusOK))
	for i, path := range paths {
		name := string(rune('a' + i))
		if name == "b" {
			continue
		}
		if strings.Contains(body, path) {
			t.Errorf("the store list discloses the path of %q, which the caller cannot read", name)
		}
	}
}

// A store nobody granted is invisible rather than forbidden. The two answers
// differ: "you may not read this" says the repository is here.
func TestAnUngrantedStoreIsNotAcknowledged(t *testing.T) {
	access := &fakeAccess{
		caller: Caller{Subject: "s1", StateKey: state.Subject("s1")},
		holds:  map[string]bool{"a": true},
	}
	_, _, server := grantedRegistry(t, access)

	// A store that exists and is not granted, and a store that does not exist
	// at all, answer identically.
	private := string(request(t, server, "GET", "/api/stores/b/board", "", http.StatusNotFound))
	absent := string(request(t, server, "GET", "/api/stores/nothing-here/board", "", http.StatusNotFound))
	if !same(private, "b", absent, "nothing-here") {
		t.Errorf("a private store answers %q and an absent one %q; the difference names the repository",
			private, absent)
	}
	if !strings.Contains(private, "unknown_store") {
		t.Errorf("a private store answered %q", private)
	}
	// The one it holds still works.
	request(t, server, "GET", "/api/stores/a/board", "", http.StatusOK)
}

// Marking a favorite must not be a way to ask whether a repository is on this
// host, which is the question the store list is filtered to avoid answering.
func TestFavoritingAnUngrantedStoreIsRefusedAsUnknown(t *testing.T) {
	access := &fakeAccess{
		caller: Caller{Subject: "s1", StateKey: state.Subject("s1")},
		holds:  map[string]bool{"a": true},
	}
	_, _, server := grantedRegistry(t, access)

	private := string(request(t, server, "PUT", "/api/favorites", `{"store":"b","favorite":true}`, http.StatusNotFound))
	absent := string(request(t, server, "PUT", "/api/favorites", `{"store":"zzz","favorite":true}`, http.StatusNotFound))
	if !same(private, "b", absent, "zzz") {
		t.Errorf("favoriting a private store answers %q and an absent one %q", private, absent)
	}
}

// Favorites are one person's. The registry files them under the caller's key,
// so a second person signing in to the same canvas sees their own.
func TestFavoritesAreKeptPerCaller(t *testing.T) {
	access := &fakeAccess{
		caller: Caller{Subject: "drew", StateKey: state.Subject("drew")},
		holds:  map[string]bool{"a": true, "b": true},
	}
	r, paths, server := grantedRegistry(t, access)

	request(t, server, "PUT", "/api/favorites", `{"store":"a","favorite":true}`, http.StatusOK)
	mine := decodeResponse[favoritesResponse](t, request(t, server, "GET", "/api/favorites", "", http.StatusOK))
	if strings.Join(mine.Stores, ",") != "a" {
		t.Errorf("favorites = %v, want a", mine.Stores)
	}

	access.caller = Caller{Subject: "robin", StateKey: state.Subject("robin")}
	theirs := decodeResponse[favoritesResponse](t, request(t, server, "GET", "/api/favorites", "", http.StatusOK))
	if len(theirs.Stores) != 0 || len(theirs.Paths) != 0 {
		t.Errorf("a second person sees %+v, want their own empty list", theirs)
	}
	// And the first person's is still there, under their own key.
	if !r.opts.State.Favorite(state.Subject("drew"), discover.Key(paths[0])) {
		t.Error("the first person's favorite was lost when somebody else asked")
	}
}

// A request nobody authenticated sees nothing at all. The guard in front of the
// registry is what normally refuses it; this is the registry's own half of the
// same rule, so that a guard somebody removes does not silently open the canvas.
func TestAnUnauthenticatedRequestSeesNothing(t *testing.T) {
	access := &fakeAccess{anonymous: true, holds: map[string]bool{"a": true, "b": true, "c": true}}
	_, _, server := grantedRegistry(t, access)

	listed := decodeResponse[storesResponse](t,
		request(t, server, "GET", "/api/stores", "", http.StatusOK))
	if len(listed.Stores) != 0 {
		t.Errorf("an unauthenticated request listed %+v", listed.Stores)
	}
	request(t, server, "GET", "/api/stores/a/board", "", http.StatusNotFound)
	favorites := decodeResponse[favoritesResponse](t,
		request(t, server, "GET", "/api/favorites", "", http.StatusOK))
	if len(favorites.Stores) != 0 || len(favorites.Paths) != 0 {
		t.Errorf("an unauthenticated request was handed favorites: %+v", favorites)
	}
	request(t, server, "PUT", "/api/favorites", `{"store":"a","favorite":true}`, http.StatusNotFound)
}

// A rescan changes which stores this process serves, which is administration
// rather than reading. It belongs to the administration surface, which is not
// built yet, so a canvas serving several people refuses it.
func TestARescanIsRefusedOnAServedCanvas(t *testing.T) {
	access := &fakeAccess{
		caller: Caller{Subject: "s1", StateKey: state.Subject("s1")},
		holds:  map[string]bool{"a": true, "b": true, "c": true},
	}
	_, _, server := grantedRegistry(t, access)
	body := string(request(t, server, "POST", "/api/stores/rescan", "", http.StatusForbidden))
	if !strings.Contains(body, "rescan_unavailable") {
		t.Errorf("rescan answered %q", body)
	}
}

// A canvas serving exactly one store answers on the unprefixed routes. The rule
// has to hold there too, and the refusal must not name the store it is refusing.
func TestTheFlatRouteRespectsTheSameRule(t *testing.T) {
	remembered, _ := stateIn(t)
	access := &fakeAccess{caller: Caller{Subject: "s1", StateKey: state.Subject("s1")}, holds: map[string]bool{}}
	r, _ := lazyRegistry(t, RegistryOptions{State: remembered, Access: access}, 1)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()

	body := string(request(t, server, "GET", "/api/board", "", http.StatusNotFound))
	if strings.Contains(body, `"a"`) {
		t.Errorf("the flat refusal names the store it is refusing: %s", body)
	}

	access.holds["a"] = true
	request(t, server, "GET", "/api/board", "", http.StatusOK)
}

// With no Access at all the registry is the canvas on somebody's desk: one
// person, every store, and nothing to check. That is the null case of the same
// model rather than a second code path, and it is what every other test in this
// package is already exercising.
func TestWithNoAccessEveryStoreIsVisible(t *testing.T) {
	remembered, _ := stateIn(t)
	r, _ := lazyRegistry(t, RegistryOptions{State: remembered}, 2)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()

	listed := decodeResponse[storesResponse](t,
		request(t, server, "GET", "/api/stores", "", http.StatusOK))
	if len(listed.Stores) != 2 {
		t.Errorf("stores = %+v, want both", listed.Stores)
	}
	request(t, server, "GET", "/api/stores/b/board", "", http.StatusOK)
}
