package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/actors"
	"github.com/terva-sh/git-ticket-canvas/internal/state"
)

func bindingsIn(t *testing.T) *actors.Bindings {
	t.Helper()
	bound, err := actors.Open(filepath.Join(t.TempDir(), actors.FileName))
	if err != nil {
		t.Fatal(err)
	}
	return bound
}

// actorRegistry serves one store, granted to the caller, with the actor routes
// live.
func actorRegistry(t *testing.T, access *fakeAccess, enforce bool) (*Registry, *actors.Bindings, *httptest.Server) {
	t.Helper()
	remembered, _ := stateIn(t)
	bound := bindingsIn(t)
	r, _ := lazyRegistry(t, RegistryOptions{State: remembered, Access: access, Actors: bound}, 1)
	if enforce {
		r.mu.Lock()
		r.entries["a"].spec.EnforceActors = true
		r.mu.Unlock()
	}
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	t.Cleanup(server.Close)
	return r, bound, server
}

func caller(subject, actor string) Caller {
	return Caller{Subject: subject, StateKey: state.Subject(subject), Actor: actor}
}

// Nobody has to think about an actor id on a first login: one is offered,
// built from the identity provider's claims, and it is marked as a suggestion
// rather than as something they agreed to.
func TestAFirstLoginIsOfferedAnActorAndCanChangeIt(t *testing.T) {
	access := &fakeAccess{caller: caller("subject-a", "human:drew"), holds: map[string]bool{"a": true}}
	_, bound, server := actorRegistry(t, access, false)

	offered := decodeResponse[actorResponse](t,
		request(t, server, "GET", "/api/stores/a/actor", "", http.StatusOK))
	if offered.Actor != "human:drew" || offered.Chosen {
		t.Errorf("offered = %+v, want human:drew as a suggestion", offered)
	}
	if _, bindingExists := bound.SubjectOf("a", "human:drew"); bindingExists {
		t.Error("a suggestion was bound before anybody accepted it")
	}

	chosen := decodeResponse[actorResponse](t,
		request(t, server, "PUT", "/api/stores/a/actor", `{"actor":"human:something-else"}`, http.StatusOK))
	if chosen.Actor != "human:something-else" || !chosen.Chosen {
		t.Errorf("chosen = %+v, want the id they typed, marked as chosen", chosen)
	}
	// And it is what they are offered next time, rather than the suggestion.
	again := decodeResponse[actorResponse](t,
		request(t, server, "GET", "/api/stores/a/actor", "", http.StatusOK))
	if again.Actor != "human:something-else" || !again.Chosen {
		t.Errorf("after choosing, the canvas offers %+v", again)
	}
	if who, _ := bound.SubjectOf("a", "human:something-else"); who != "subject-a" {
		t.Errorf("the binding records %q", who)
	}
}

// An id somebody else is already writing under is refused, so two people cannot
// both write as human:drew and nobody can take over a name.
func TestAnActorBoundToAnotherSubjectIsRefused(t *testing.T) {
	access := &fakeAccess{caller: caller("subject-a", "human:drew"), holds: map[string]bool{"a": true}}
	_, bound, server := actorRegistry(t, access, false)
	request(t, server, "PUT", "/api/stores/a/actor", `{"actor":"human:drew"}`, http.StatusOK)

	access.caller = caller("subject-b", "human:robin")
	body := string(request(t, server, "PUT", "/api/stores/a/actor",
		`{"actor":"human:drew"}`, http.StatusConflict))
	if !strings.Contains(body, "actor_taken") {
		t.Errorf("the refusal reads %q", body)
	}
	if who, _ := bound.SubjectOf("a", "human:drew"); who != "subject-a" {
		t.Errorf("the id moved to %q", who)
	}
	// The second person can still have their own.
	request(t, server, "PUT", "/api/stores/a/actor", `{"actor":"human:robin"}`, http.StatusOK)
}

// The binding is independent of the grant, so revoking somebody's access and
// granting it again does not free their id for a different person to claim and
// quietly inherit the appearance of their history.
func TestABindingSurvivesRevokingAndReGranting(t *testing.T) {
	access := &fakeAccess{caller: caller("subject-a", "human:drew"), holds: map[string]bool{"a": true}}
	_, bound, server := actorRegistry(t, access, false)
	request(t, server, "PUT", "/api/stores/a/actor", `{"actor":"human:drew"}`, http.StatusOK)

	// Revoked: the store is now invisible to them, and choosing an actor on it
	// answers as a store that is not configured.
	access.holds["a"] = false
	request(t, server, "GET", "/api/stores/a/actor", "", http.StatusNotFound)

	// Somebody else is granted in the meantime and cannot take the name.
	access.caller = caller("subject-b", "human:robin")
	access.holds["a"] = true
	request(t, server, "PUT", "/api/stores/a/actor", `{"actor":"human:drew"}`, http.StatusConflict)

	// Re-granted: still theirs, still current.
	access.caller = caller("subject-a", "human:drew")
	back := decodeResponse[actorResponse](t,
		request(t, server, "GET", "/api/stores/a/actor", "", http.StatusOK))
	if back.Actor != "human:drew" || !back.Chosen {
		t.Errorf("after re-granting, the canvas offers %+v", back)
	}
	if who, _ := bound.SubjectOf("a", "human:drew"); who != "subject-a" {
		t.Errorf("the binding records %q", who)
	}
}

// The store's declared actors can be turned on as an allowlist, and are off by
// default. Off, because the cost of it being on is that every new person is
// blocked until an operator edits a file.
func TestTheDeclaredActorsAreAnAllowlistOnlyWhenTurnedOn(t *testing.T) {
	access := &fakeAccess{caller: caller("subject-a", "human:drew"), holds: map[string]bool{"a": true}}

	// Off: an id the store never declared is accepted, which is what keeps the
	// desk tool's long-standing behaviour available here.
	_, _, open := actorRegistry(t, access, false)
	offered := decodeResponse[actorResponse](t,
		request(t, open, "GET", "/api/stores/a/actor", "", http.StatusOK))
	if offered.Enforced {
		t.Error("the allowlist is on by default")
	}
	if len(offered.Declared) == 0 {
		t.Error("the store's declared actors are not offered as choices")
	}
	request(t, open, "PUT", "/api/stores/a/actor", `{"actor":"human:nobody-declared-this"}`, http.StatusOK)

	// On: only ids the store already names.
	access.caller = caller("subject-a", "human:drew")
	_, _, closed := actorRegistry(t, access, true)
	strict := decodeResponse[actorResponse](t,
		request(t, closed, "GET", "/api/stores/a/actor", "", http.StatusOK))
	if !strict.Enforced {
		t.Fatal("the allowlist did not come on")
	}
	// A suggestion the store would refuse is not offered at all.
	if strict.Actor != "" {
		t.Errorf("an undeclared suggestion was offered: %q", strict.Actor)
	}
	body := string(request(t, closed, "PUT", "/api/stores/a/actor",
		`{"actor":"human:nobody-declared-this"}`, http.StatusConflict))
	if !strings.Contains(body, "actor_not_declared") {
		t.Errorf("the refusal reads %q", body)
	}
	if len(strict.Declared) == 0 {
		t.Fatal("the store declares no actors, so this proves nothing")
	}
	request(t, closed, "PUT", "/api/stores/a/actor",
		`{"actor":"`+strict.Declared[0]+`"}`, http.StatusOK)
}

// Choosing an actor on a store must not be a way to learn the store is here.
func TestTheActorRouteIsInvisibleForAnUngrantedStore(t *testing.T) {
	access := &fakeAccess{caller: caller("subject-a", "human:drew"), holds: map[string]bool{}}
	_, _, server := actorRegistry(t, access, false)

	private := string(request(t, server, "GET", "/api/stores/a/actor", "", http.StatusNotFound))
	absent := string(request(t, server, "GET", "/api/stores/zzz/actor", "", http.StatusNotFound))
	// Quoted, because this store is called "a" and a bare letter appears all
	// over an English sentence.
	if !same(private, `\"a\"`, absent, `\"zzz\"`) {
		t.Errorf("a private store answers %q and an absent one %q", private, absent)
	}
	request(t, server, "PUT", "/api/stores/a/actor", `{"actor":"human:drew"}`, http.StatusNotFound)
}

// The desk canvas has no such route. It resolves an actor when a store opens,
// exactly as it always has, and that is the sixth criterion of this ticket.
func TestTheDeskCanvasHasNoActorRoute(t *testing.T) {
	remembered, _ := stateIn(t)
	r, _ := lazyRegistry(t, RegistryOptions{State: remembered}, 1)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()

	// /api/stores/a/actor falls through to the store subtree, which has no such
	// route, and /api/actor falls through to the flat mount.
	for _, path := range []string{"/api/stores/a/actor", "/api/actor"} {
		response, err := http.Get(server.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode == http.StatusOK {
			t.Errorf("GET %s answered 200 on a desk canvas", path)
		}
	}
	// And the store still opens with the actor it resolved, which is what the
	// desk canvas writes as.
	for _, s := range r.Statuses() {
		if s.Name == "a" && s.ActorID == "" {
			t.Error("the desk canvas resolved no actor when the store opened")
		}
	}
}

// A canvas serving one store answers on the unprefixed route too.
func TestTheFlatActorRoute(t *testing.T) {
	access := &fakeAccess{caller: caller("subject-a", "human:drew"), holds: map[string]bool{"a": true}}
	_, bound, server := actorRegistry(t, access, false)

	offered := decodeResponse[actorResponse](t,
		request(t, server, "GET", "/api/actor", "", http.StatusOK))
	if offered.Actor != "human:drew" || offered.Chosen {
		t.Errorf("offered = %+v", offered)
	}
	request(t, server, "PUT", "/api/actor", `{"actor":"human:chosen"}`, http.StatusOK)
	if who, _ := bound.SubjectOf("a", "human:chosen"); who != "subject-a" {
		t.Errorf("the flat route bound %q", who)
	}
}

func TestAnEmptyActorIsRefused(t *testing.T) {
	access := &fakeAccess{caller: caller("subject-a", "human:drew"), holds: map[string]bool{"a": true}}
	_, _, server := actorRegistry(t, access, false)
	for _, body := range []string{`{"actor":""}`, `{"actor":"   "}`, `{}`} {
		request(t, server, "PUT", "/api/stores/a/actor", body, http.StatusBadRequest)
	}
	request(t, server, "PUT", "/api/stores/a/actor", `not json`, http.StatusBadRequest)
}
