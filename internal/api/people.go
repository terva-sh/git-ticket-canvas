package api

import (
	"net/http"
	"time"
)

// personResponse is one account as an administrator sees it.
type personResponse struct {
	Subject string `json:"subject"`
	Name    string `json:"name,omitempty"`
	Email   string `json:"email,omitempty"`
	// Groups is what their token carried at their most recent login, which is
	// the field that diagnoses a store nobody can see. A person who signed in
	// yesterday carrying three groups that granted nothing is the evidence
	// that a grant is misspelled, and no per-caller view can show it.
	Groups    []string  `json:"groups,omitempty"`
	FirstSeen time.Time `json:"firstSeen"`
	LastSeen  time.Time `json:"lastSeen"`
	// Actors is the actor id this person writes as, per store, for the stores
	// they have chosen one on.
	Actors map[string]string `json:"actors,omitempty"`
}

type peopleResponse struct {
	People []personResponse `json:"people"`
}

// handlePeople lists everybody who has signed in.
//
// Refused rather than answered empty for a caller who is not an administrator.
// An empty list and a refusal mean different things, and somebody debugging
// deserves to know which they got. The invisibility rule that governs stores
// does not apply: this route discloses nothing about what is served here, only
// that administration exists, which the source already says.
func (r *Registry) handlePeople(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Cache-Control", "private, no-cache")
	caller, authenticated := r.opts.Access.Caller(req)
	if !authenticated || !r.opts.Access.IsAdmin(caller) {
		writeJSON(w, http.StatusForbidden, errBody{
			Code:    "not_an_administrator",
			Message: "only an administrator of this canvas can see who has signed in",
		})
		return
	}
	if r.opts.People == nil {
		writeJSON(w, http.StatusOK, peopleResponse{People: []personResponse{}})
		return
	}

	// Which stores each person writes as what. Read once rather than per
	// person, because the binding record is keyed the other way round.
	actors := map[string]map[string]string{}
	if r.opts.Actors != nil {
		for _, held := range r.opts.Actors.Held() {
			if actors[held.Subject] == nil {
				actors[held.Subject] = map[string]string{}
			}
			actors[held.Subject][held.Store] = held.Actor
		}
	}

	listed := []personResponse{}
	for _, person := range r.opts.People.All() {
		listed = append(listed, personResponse{
			Subject:   person.Subject,
			Name:      person.Name,
			Email:     person.Email,
			Groups:    person.Groups,
			FirstSeen: person.FirstSeen,
			LastSeen:  person.LastSeen,
			Actors:    actors[person.Subject],
		})
	}
	writeJSON(w, http.StatusOK, peopleResponse{People: listed})
}
