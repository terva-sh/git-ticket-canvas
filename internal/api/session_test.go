package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
)

// groupAccess grants per group, which fakeAccess cannot: it answers CanRead
// without looking at the caller, and the whole question here is which of a
// person's groups is doing the work.
type groupAccess struct {
	caller Caller
	// byGroup is the stores each group can read.
	byGroup map[string][]string
}

func (g *groupAccess) Caller(*http.Request) (Caller, bool) { return g.caller, true }

func (g *groupAccess) CanRead(c Caller, store string) bool {
	for _, group := range c.Groups {
		if slices.Contains(g.byGroup[group], store) {
			return true
		}
	}
	return false
}

func sessionServer(t *testing.T, access Access, stores int) *httptest.Server {
	t.Helper()
	remembered, _ := stateIn(t)
	r, _ := lazyRegistry(t, RegistryOptions{State: remembered, Access: access, Logout: "/auth/logout"}, stores)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	t.Cleanup(server.Close)
	return server
}

// The dialog needs the claims the provider sent, and this is the only place
// anybody can see them: nothing else in the canvas displays a name or an email.
func TestTheSessionCarriesTheClaimsTheProviderSent(t *testing.T) {
	access := &groupAccess{
		caller: Caller{
			Subject: "subject-a", Name: "Drew Short", Email: "drew@example.com",
			Groups: []string{"readers"},
		},
		byGroup: map[string][]string{"readers": {"a"}},
	}
	server := sessionServer(t, access, 1)

	got := decodeResponse[sessionResponse](t,
		request(t, server, "GET", "/api/session", "", http.StatusOK))
	if !got.Authenticated {
		t.Fatal("a logged-in caller was reported as anonymous")
	}
	if got.Name != "Drew Short" || got.Email != "drew@example.com" {
		t.Errorf("claims came back as %+v", got)
	}
	if got.Subject != "subject-a" {
		t.Errorf("subject = %q, and it is what everything keys on", got.Subject)
	}
	if got.Logout != "/auth/logout" {
		t.Errorf("logout = %q, so the browser has nothing to link to", got.Logout)
	}
}

// A group that arrives and grants nothing looks exactly like a group the
// provider never sent. Telling those apart is most of diagnosing a grant that
// did not work, so the two lists must differ.
func TestAGroupThatGrantsNothingIsDistinguishable(t *testing.T) {
	access := &groupAccess{
		caller: Caller{Subject: "subject-a", Groups: []string{"readers", "everyone", "typo"}},
		byGroup: map[string][]string{
			"readers": {"a"},
			// everyone reaches a store this canvas does not serve, which is the
			// shape of a grant written against a store that was renamed.
			"everyone": {"somewhere-else"},
		},
	}
	server := sessionServer(t, access, 1)

	got := decodeResponse[sessionResponse](t,
		request(t, server, "GET", "/api/session", "", http.StatusOK))
	if len(got.Groups) != 3 {
		t.Errorf("groups = %v, want every group the token carried", got.Groups)
	}
	if !slices.Equal(got.Granted, []string{"readers"}) {
		t.Errorf("granted = %v, want only the group that reaches a served store", got.Granted)
	}
}

// The session route must not become a way to enumerate what is here. It reports
// which of your groups work, never which stores they work on.
func TestTheSessionNamesNoStore(t *testing.T) {
	access := &groupAccess{
		caller:  Caller{Subject: "subject-a", Groups: []string{"readers"}},
		byGroup: map[string][]string{"readers": {"a"}},
	}
	server := sessionServer(t, access, 2)

	body := string(request(t, server, "GET", "/api/session", "", http.StatusOK))
	for _, name := range []string{`"a"`, `"b"`} {
		if strings.Contains(body, name) {
			t.Errorf("the session response names a store: %s", body)
		}
	}
}

// A desk canvas has an answer to give here, and it is not a 404. The browser
// asks one question everywhere and hides the control on this reply.
func TestADeskCanvasReportsNobodySignedIn(t *testing.T) {
	remembered, _ := stateIn(t)
	r, _ := lazyRegistry(t, RegistryOptions{State: remembered}, 1)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()

	got := decodeResponse[sessionResponse](t,
		request(t, server, "GET", "/api/session", "", http.StatusOK))
	if got.Authenticated || got.Subject != "" || got.Logout != "" {
		t.Errorf("a desk canvas answered %+v", got)
	}
	// Empty rather than absent, so the browser needs no special case.
	if got.Groups == nil || got.Granted == nil {
		t.Errorf("groups and granted must be lists, got %+v", got)
	}
}

// An unauthenticated caller on a served canvas is told nobody is signed in,
// rather than being told about somebody who is.
func TestAnAnonymousCallerGetsAnEmptySession(t *testing.T) {
	server := sessionServer(t, &fakeAccess{anonymous: true}, 1)
	got := decodeResponse[sessionResponse](t,
		request(t, server, "GET", "/api/session", "", http.StatusOK))
	if got.Authenticated || got.Subject != "" || len(got.Groups) != 0 {
		t.Errorf("an anonymous caller was told %+v", got)
	}
}
