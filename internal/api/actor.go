package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/terva-sh/git-ticket-canvas/internal/actors"
)

// actorResponse is what a person's writes on one store would be stamped with.
type actorResponse struct {
	// Actor is the id itself, empty only when nothing was chosen and the
	// identity provider offered nothing to build a suggestion from.
	Actor string `json:"actor"`
	// Chosen is false while Actor is a suggestion. The browser shows a
	// suggestion differently from a decision, because a person who never
	// visited this screen has not agreed to anything.
	Chosen bool `json:"chosen"`
	// Declared is the store's own actor list, which is offered as a set of
	// choices whether or not it is being enforced.
	Declared []string `json:"declared,omitempty"`
	// Enforced is whether Declared is an allowlist rather than a suggestion.
	Enforced bool `json:"enforced"`
}

type actorRequest struct {
	Actor string `json:"actor"`
}

// handleActor answers what this person writes as on one store.
func (r *Registry) handleActor(w http.ResponseWriter, req *http.Request) {
	r.actorRoute(w, req, req.PathValue("store"), false)
}

// handleSetActor records what this person chooses to write as.
func (r *Registry) handleSetActor(w http.ResponseWriter, req *http.Request) {
	r.actorRoute(w, req, req.PathValue("store"), true)
}

// handleFlatActor is the same pair for a canvas serving exactly one store.
func (r *Registry) handleFlatActor(w http.ResponseWriter, req *http.Request) {
	only, ok := r.onlyStore()
	if !ok {
		writeJSON(w, http.StatusNotFound, errBody{
			Code:    "store_required",
			Message: "this canvas serves more than one store, so an actor belongs to one named at /api/stores/{store}/actor",
		})
		return
	}
	r.actorRoute(w, req, only, req.Method != http.MethodGet)
}

// actorRoute is both halves, because the read and the write share every check
// in front of them and differ only in what they do afterwards.
func (r *Registry) actorRoute(w http.ResponseWriter, req *http.Request, store string, setting bool) {
	w.Header().Set("Cache-Control", "private, no-cache")
	// Invisible first, and with the same answer a store that is not configured
	// gets. Choosing an actor on a store must not be a way to learn that the
	// store is here.
	if !r.visible(req, store) {
		writeJSON(w, http.StatusNotFound, errBody{
			Code:    "unknown_store",
			Message: fmt.Sprintf("no store named %q is configured", store),
		})
		return
	}
	caller, authenticated := r.opts.Access.Caller(req)
	if !authenticated || r.opts.Actors == nil {
		writeJSON(w, http.StatusConflict, errBody{
			Code:    "actors_unavailable",
			Message: "this canvas does not record who writes under which actor id",
		})
		return
	}

	declared, enforced := r.declaredActors(req, store)
	if !setting {
		writeJSON(w, http.StatusOK, r.actorFor(caller, store, declared, enforced))
		return
	}

	var body actorRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, req.Body, 4096)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody{Code: "invalid_body", Message: err.Error()})
		return
	}
	wanted := strings.TrimSpace(body.Actor)
	if wanted == "" {
		writeJSON(w, http.StatusBadRequest, errBody{
			Code:    "invalid_actor",
			Message: "an actor id is required; it is what a write to this store is stamped with",
		})
		return
	}
	// The allowlist asks whether the store knows this name. It is off by
	// default, because the cost of it being on is that every new person is
	// blocked until an operator edits a file.
	if enforced && !contains(declared, wanted) {
		writeJSON(w, http.StatusConflict, errBody{
			Code: "actor_not_declared",
			Message: fmt.Sprintf("%s declares its actors and %q is not one of them: %s",
				store, wanted, strings.Join(declared, ", ")),
		})
		return
	}
	// The binding asks a different question: whether somebody else is already
	// writing under this name. First claim holds.
	if err := r.opts.Actors.Claim(store, wanted, caller.Subject); err != nil {
		if errors.Is(err, actors.ErrTaken) {
			writeJSON(w, http.StatusConflict, errBody{
				Code: "actor_taken",
				Message: fmt.Sprintf("%q is already bound to somebody else on %s. "+
					"An actor id belongs to one person per store, so that the store's history means something",
					wanted, store),
			})
			return
		}
		writeJSON(w, http.StatusInternalServerError, errBody{Code: "actor_write_failed", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, r.actorFor(caller, store, declared, enforced))
}

// actorFor is this person's actor on a store: what they chose, or what the
// identity provider suggests they might choose.
func (r *Registry) actorFor(caller Caller, store string, declared []string, enforced bool) actorResponse {
	out := actorResponse{Declared: declared, Enforced: enforced}
	if chosen, ok := r.opts.Actors.Of(store, caller.Subject); ok {
		out.Actor, out.Chosen = chosen, true
		return out
	}
	// A suggestion the store would refuse is not a suggestion.
	if !enforced || contains(declared, caller.Actor) {
		out.Actor = caller.Actor
	}
	return out
}

// declaredActors is the store's own actor list and whether it is enforced.
//
// The list needs the store open, which is why this is the one place the actor
// routes can cost a watcher. A store that will not open answers with no list
// and no enforcement, which is the same thing a store that declares none does.
func (r *Registry) declaredActors(req *http.Request, store string) ([]string, bool) {
	r.mu.RLock()
	e, known := r.entries[store]
	enforced := known && e.spec.EnforceActors
	r.mu.RUnlock()
	if !known {
		return nil, false
	}
	server, _, _ := r.acquire(req, store)
	if server == nil {
		return nil, enforced
	}
	var names []string
	for _, a := range server.store.Config().Actors {
		names = append(names, a.ID)
	}
	sort.Strings(names)
	return names, enforced
}

// onlyStore is the store's name when this canvas serves exactly one.
func (r *Registry) onlyStore() (string, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if len(r.order) != 1 {
		return "", false
	}
	return r.order[0], true
}

func contains(list []string, want string) bool {
	for _, have := range list {
		if have == want {
			return true
		}
	}
	return false
}
