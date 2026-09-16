package cli

import (
	"net/http/httptest"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/auth"
	"github.com/terva-sh/git-ticket-canvas/internal/grants"
	"github.com/terva-sh/git-ticket-canvas/internal/state"
)

// access is the join: a relying party's identity on one side, a grant table on
// the other, and per-user state keyed on the subject. Each of the three is
// tested in its own package; this is the only place they meet.
func TestAccessJoinsIdentityToGrants(t *testing.T) {
	table, err := grants.NewStatic(nil, []grants.Table{
		{Resource: "ledger", Roles: map[string]grants.Role{"Brokkr Staff": grants.Reader}},
		{Resource: "payroll", Roles: map[string]grants.Role{"Founders": grants.Reader}},
	})
	if err != nil {
		t.Fatal(err)
	}
	gate := access{table: table}

	req := httptest.NewRequest("GET", "/api/stores", nil)
	signedIn := req.WithContext(auth.With(req.Context(), auth.Identity{
		Subject: "01HQ8", Email: "drew@example.com", Groups: []string{"Brokkr Staff"},
	}))

	caller, ok := gate.Caller(signedIn)
	if !ok {
		t.Fatal("a signed-in request has no caller")
	}
	if caller.Subject != "01HQ8" {
		t.Errorf("subject = %q", caller.Subject)
	}
	// Keyed on the subject and prefixed, never on the email, which is mutable
	// in every provider.
	if caller.StateKey != state.Subject("01HQ8") {
		t.Errorf("state key = %q, want the prefixed subject", caller.StateKey)
	}
	if caller.StateKey == "drew@example.com" || caller.StateKey == state.LocalUser {
		t.Errorf("state key = %q", caller.StateKey)
	}

	if !gate.CanRead(caller, "ledger") {
		t.Error("the store this person's group holds is not readable")
	}
	if gate.CanRead(caller, "payroll") {
		t.Error("a store granted to another group is readable")
	}
	if gate.CanRead(caller, "a-store-added-yesterday") {
		t.Error("a store nobody granted is readable")
	}
}

// The identity comes from the guard's output rather than from the cookie, so a
// request that somehow reached a handler without passing the guard has no
// caller and every store is invisible to it.
func TestARequestThatDidNotPassTheGuardHasNoCaller(t *testing.T) {
	gate := access{table: grants.Everything{}}
	if _, ok := gate.Caller(httptest.NewRequest("GET", "/api/stores", nil)); ok {
		t.Error("a request with nothing on its context produced a caller")
	}

	// And an identity with no subject is not a person. An empty subject as a
	// map key is one shared account for everybody it happens to.
	req := httptest.NewRequest("GET", "/api/stores", nil)
	empty := req.WithContext(auth.With(req.Context(), auth.Identity{Groups: []string{"Brokkr Staff"}}))
	if _, ok := gate.Caller(empty); ok {
		t.Error("an identity with no subject produced a caller")
	}
}
