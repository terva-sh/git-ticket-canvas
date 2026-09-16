package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/people"
)

func peopleServer(t *testing.T, access Access, seen *people.Directory) *httptest.Server {
	t.Helper()
	remembered, _ := stateIn(t)
	r, _ := lazyRegistry(t, RegistryOptions{
		State: remembered, Access: access, People: seen, Actors: bindingsIn(t),
	}, 1)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	t.Cleanup(server.Close)
	return server
}

func directoryWith(t *testing.T, all ...people.Person) *people.Directory {
	t.Helper()
	d, err := people.Open(t.TempDir() + "/people.json")
	if err != nil {
		t.Fatal(err)
	}
	for _, person := range all {
		if err := d.Seen(person); err != nil {
			t.Fatal(err)
		}
	}
	return d
}

// The list an administrator came for, including the groups each person last
// carried, which is what diagnoses a store nobody can see.
func TestAnAdministratorSeesWhoHasSignedIn(t *testing.T) {
	seen := directoryWith(t,
		people.Person{Subject: "sub-a", Name: "Drew Short", Email: "drew@example.com",
			Groups: []string{"Ledger Admin"}},
		people.Person{Subject: "sub-b", Name: "Robin"},
	)
	access := &fakeAccess{caller: Caller{Subject: "sub-a", Groups: []string{"Ledger Admin"}},
		holds: map[string]bool{"a": true}, admin: true}
	server := peopleServer(t, access, seen)

	got := decodeResponse[peopleResponse](t,
		request(t, server, "GET", "/api/people", "", http.StatusOK))
	if len(got.People) != 2 {
		t.Fatalf("the list holds %d people", len(got.People))
	}
	// Most recently seen first.
	if got.People[0].Subject != "sub-b" {
		t.Errorf("the list leads with %q", got.People[0].Subject)
	}
	var drew personResponse
	for _, person := range got.People {
		if person.Subject == "sub-a" {
			drew = person
		}
	}
	if drew.Name != "Drew Short" || drew.Email != "drew@example.com" {
		t.Errorf("the record reads %+v", drew)
	}
	if strings.Join(drew.Groups, ",") != "Ledger Admin" {
		t.Errorf("groups = %v, and they are what diagnoses a misspelled grant", drew.Groups)
	}
	if drew.FirstSeen.IsZero() || drew.LastSeen.IsZero() {
		t.Errorf("first and last seen are %v and %v", drew.FirstSeen, drew.LastSeen)
	}
}

// Refused rather than answered empty. An empty list and a refusal mean
// different things, and somebody debugging deserves to know which they got.
func TestANonAdministratorIsRefusedRatherThanShownNothing(t *testing.T) {
	seen := directoryWith(t, people.Person{Subject: "sub-a", Name: "Drew Short"})
	access := &fakeAccess{caller: Caller{Subject: "sub-b"}, holds: map[string]bool{"a": true}}
	server := peopleServer(t, access, seen)

	body := string(request(t, server, "GET", "/api/people", "", http.StatusForbidden))
	if !strings.Contains(body, "not_an_administrator") {
		t.Errorf("the refusal reads %q", body)
	}
	// And it discloses nobody on the way past.
	if strings.Contains(body, "Drew Short") {
		t.Errorf("the refusal named somebody: %q", body)
	}
}

// The rule this ticket is the first chance to break, so it gets a test rather
// than an intention: administration is not read access. An administrator who
// wants a store grants it to themselves, which leaves a record.
func TestAnAdministratorReadsNoStoreTheyWereNotGranted(t *testing.T) {
	seen := directoryWith(t, people.Person{Subject: "sub-a"})
	// Administers the canvas, granted nothing.
	access := &fakeAccess{caller: Caller{Subject: "sub-a"}, holds: map[string]bool{}, admin: true}
	server := peopleServer(t, access, seen)

	// They may see who has signed in.
	request(t, server, "GET", "/api/people", "", http.StatusOK)

	// And no store at all.
	listed := decodeResponse[struct {
		Stores []struct {
			Name string `json:"name"`
		} `json:"stores"`
	}](t, request(t, server, "GET", "/api/stores", "", http.StatusOK))
	if len(listed.Stores) != 0 {
		t.Errorf("an administrator was listed %d stores nobody granted them", len(listed.Stores))
	}
	request(t, server, "GET", "/api/stores/a/board", "", http.StatusNotFound)
}

// A canvas with nobody signed in yet answers an administrator with a list, not
// an error: there is a difference between "no record" and "no people", and only
// the second is true here.
func TestAnEmptyDirectoryIsAnEmptyList(t *testing.T) {
	access := &fakeAccess{caller: Caller{Subject: "sub-a"}, holds: map[string]bool{"a": true}, admin: true}
	server := peopleServer(t, access, directoryWith(t))
	got := decodeResponse[peopleResponse](t,
		request(t, server, "GET", "/api/people", "", http.StatusOK))
	if got.People == nil || len(got.People) != 0 {
		t.Errorf("an empty directory answered %+v", got)
	}
}

// A desk canvas has no people and no administration.
func TestADeskCanvasHasNoPeopleRoute(t *testing.T) {
	remembered, _ := stateIn(t)
	r, _ := lazyRegistry(t, RegistryOptions{State: remembered}, 1)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()

	response, err := http.Get(server.URL + "/api/people")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusOK {
		t.Error("a desk canvas answered /api/people")
	}
}

// The browser decides whether to offer an administrative view from this.
func TestTheSessionSaysWhetherYouAdminister(t *testing.T) {
	for _, admin := range []bool{true, false} {
		access := &fakeAccess{caller: Caller{Subject: "sub-a"}, holds: map[string]bool{"a": true}, admin: admin}
		server := peopleServer(t, access, directoryWith(t))
		got := decodeResponse[sessionResponse](t,
			request(t, server, "GET", "/api/session", "", http.StatusOK))
		if got.Admin != admin {
			t.Errorf("session.admin = %v, want %v", got.Admin, admin)
		}
	}
}
