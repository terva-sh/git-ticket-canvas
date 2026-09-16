package api

import (
	"net/http"
	"sort"
)

// sessionResponse is what the canvas can tell somebody about their own login.
//
// It answers about the caller and nobody else. There is no route here for
// asking about another person, and adding one would be administration, which is
// TKT-01M2MEC1's to build with an audit log behind it.
type sessionResponse struct {
	// Authenticated is false on a desk canvas, which has no identity at all,
	// and the browser hides the whole control rather than showing an empty one.
	Authenticated bool `json:"authenticated"`
	// Subject is shown because it is what everything keys on, so it is the
	// thing an operator needs when somebody reports that their favorites
	// vanished or their actor is not theirs.
	Subject string `json:"subject,omitempty"`
	Name    string `json:"name,omitempty"`
	Email   string `json:"email,omitempty"`
	// Groups is every group the token carried.
	Groups []string `json:"groups"`
	// Granted is the subset of Groups that actually produced a role somewhere.
	//
	// The difference between the two lists is the whole point. A group that
	// arrives and grants nothing looks exactly like a group the provider never
	// sent, and telling those apart is most of diagnosing a grant that did not
	// work.
	Granted []string `json:"granted"`
	// WouldGrant names groups this person is not in that grant on a store they
	// can already read. It is what turns a misspelling from an invisible
	// failure into something a person can see: an unmatched `...Userss` beside
	// their own `...User` is the typo, found without reading a config file.
	//
	// Restricted to stores they can read on purpose. Naming every group the
	// configuration mentions would disclose the group names this canvas knows,
	// and a group name implies the store it grants on.
	WouldGrant []string `json:"wouldGrant"`
	// Logout is the path that ends this session, passed through rather than
	// built here so that the registry keeps knowing nothing about how somebody
	// logged in.
	Logout string `json:"logout,omitempty"`
}

// handleSession answers who the caller is.
//
// It is registered on every canvas, including a desk one, so that the browser
// can ask one question and get an answer rather than reading a 404 as a
// judgement about whether it should have asked.
func (r *Registry) handleSession(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Cache-Control", "private, no-cache")
	anonymous := sessionResponse{Groups: []string{}, Granted: []string{}, WouldGrant: []string{}}
	if r.opts.Access == nil {
		writeJSON(w, http.StatusOK, anonymous)
		return
	}
	caller, authenticated := r.opts.Access.Caller(req)
	if !authenticated {
		writeJSON(w, http.StatusOK, anonymous)
		return
	}
	writeJSON(w, http.StatusOK, sessionResponse{
		Authenticated: true,
		Subject:       caller.Subject,
		Name:          caller.Name,
		Email:         caller.Email,
		Groups:        append([]string{}, caller.Groups...),
		Granted:       r.grantingGroups(caller),
		WouldGrant:    r.unmatchedGroups(caller),
		Logout:        r.opts.Logout,
	})
}

// grantingGroups is the subset of this person's groups that grant something.
//
// It asks the question one group at a time, which is exact because grants are
// additive: a role held by a principal carrying one group is a role that group
// granted. Nothing in the grant model subtracts, so there is no combination
// whose parts answer differently from the whole.
//
// It names groups and never stores. A person's own group list is already theirs
// to see, while the set of stores a group reaches is closer to the shape of the
// store list, which is a permission boundary.
func (r *Registry) grantingGroups(c Caller) []string {
	r.mu.RLock()
	names := append([]string(nil), r.order...)
	r.mu.RUnlock()

	granted := []string{}
	for _, group := range c.Groups {
		probe := Caller{Subject: c.Subject, Groups: []string{group}}
		for _, name := range names {
			if r.opts.Access.CanRead(probe, name) {
				granted = append(granted, group)
				break
			}
		}
	}
	return granted
}

// unmatchedGroups names groups that would have granted access and did not,
// which is the half of the diagnosis the caller's own group list cannot show.
//
// Only stores the caller reads are consulted. Where every grant on a store is
// misspelled the store is invisible to everybody, and nothing answerable here
// can point at it without disclosing it to everyone who logs in; that case
// needs an administrator's view.
func (r *Registry) unmatchedGroups(c Caller) []string {
	r.mu.RLock()
	names := append([]string(nil), r.order...)
	r.mu.RUnlock()

	held := make(map[string]bool, len(c.Groups))
	for _, group := range c.Groups {
		held[group] = true
	}
	seen := map[string]bool{}
	unmatched := []string{}
	for _, name := range names {
		if !r.opts.Access.CanRead(c, name) {
			continue
		}
		for _, group := range r.opts.Access.Granting(name) {
			if held[group] || seen[group] {
				continue
			}
			seen[group] = true
			unmatched = append(unmatched, group)
		}
	}
	sort.Strings(unmatched)
	return unmatched
}
