package cli

import (
	"net/http"

	"github.com/terva-sh/git-ticket-canvas/internal/api"
	"github.com/terva-sh/git-ticket-canvas/internal/auth"
	"github.com/terva-sh/git-ticket-canvas/internal/grants"
	"github.com/terva-sh/git-ticket-canvas/internal/state"
)

// access joins the three seams the served canvas runs on: a relying party that
// says who somebody is, a grant table that says what they hold, and per-user
// state keyed on the subject.
//
// It is the only place all three meet, and it is in the command rather than in
// any of them, so that none of the three has to know what a canvas is.
type access struct {
	table grants.Grants
}

// Caller identifies a request from the identity the guard put on its context.
//
// It reads the context rather than the cookie on purpose. The guard is what
// refuses an unauthenticated request, and taking the identity from its output
// means a request that somehow reached a handler without passing the guard has
// no caller, so every store is invisible to it. A second lookup of the cookie
// here would quietly undo that.
func (a access) Caller(req *http.Request) (api.Caller, bool) {
	identity, ok := auth.From(req.Context())
	if !ok || identity.Subject == "" {
		return api.Caller{}, false
	}
	return api.Caller{
		Subject: identity.Subject,
		// A suggestion built from the provider's claims, so that nobody has to
		// think about an actor id on a first login. Nothing is bound until they
		// accept or replace it.
		Actor: identity.Actor(),
		// Keyed on the subject and prefixed, so that a provider issuing the
		// desk canvas's own key cannot collect somebody's favorites.
		StateKey: state.Subject(identity.Subject),
		Groups:   identity.Groups,
		// Display only. The dialog that shows these is the only way anybody can
		// see what the provider actually sent.
		Name:  identity.Name,
		Email: identity.Email,
	}, true
}

// CanRead is the rule, in one expression: what this person's groups hold on
// this store, and whether that includes reading.
//
// There is no branch here for a store the table does not name. There does not
// need to be: an ungranted resource answers with no roles, and no roles cannot
// read.
func (a access) CanRead(c api.Caller, store string) bool {
	return grants.CanRead(a.table.Roles(
		grants.Principal{Subject: c.Subject, Groups: c.Groups}, store))
}

// Granting is the grant table's own answer, unfiltered. Deciding who may ask is
// the handler's job: it asks only about a store the caller already reads.
func (a access) Granting(store string) []string { return a.table.Granting(store) }
