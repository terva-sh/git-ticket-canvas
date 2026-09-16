package cli

import (
	"log"
	"net/http"

	"github.com/terva-sh/git-ticket-canvas/internal/api"
	"github.com/terva-sh/git-ticket-canvas/internal/auth"
	"github.com/terva-sh/git-ticket-canvas/internal/config"
)

// signOn builds what a served canvas needs in front of its registry, and
// nothing at all for a desk canvas.
//
// It returns two things because they go to two places. The wrapper takes the
// registry's handler and puts the login in front of it; the gate goes into the
// registry, which asks it what each request may see. Both are nil-shaped for
// the desk canvas: no login, and an Access of nil, which the registry reads as
// one person who may see everything.
func signOn(kind Kind, cfg config.Config) (func(http.Handler) http.Handler, api.Access, error) {
	if kind != Served {
		return func(next http.Handler) http.Handler { return next }, nil, nil
	}

	table, notes, err := cfg.Grants()
	if err != nil {
		return nil, nil, err
	}
	for _, note := range notes {
		log.Printf("note   %s", note)
	}

	sessions := auth.NewSessions(0)
	provider, err := auth.NewProvider(auth.Config{
		Issuer:       cfg.Identity.Issuer,
		ClientID:     cfg.Identity.ClientID,
		ClientSecret: cfg.Identity.ClientSecret,
		BaseURL:      cfg.Identity.BaseURL,
		Scopes:       cfg.Identity.Scopes,
		GroupsClaim:  cfg.Identity.GroupsClaim,
	}, sessions)
	if err != nil {
		return nil, nil, err
	}
	log.Printf("signon %s as %s, returning to %s", cfg.Identity.Issuer, cfg.Identity.ClientID, provider.RedirectURL())
	for _, resource := range table.Resources() {
		log.Printf("grants %s", resource)
	}

	wrap := func(next http.Handler) http.Handler {
		// One mux, so that the login routes and the canvas are the same server
		// and the guard is the only thing in front of both. A second server on
		// a second port would be one more thing to expose correctly.
		mux := http.NewServeMux()
		provider.Routes(mux)
		mux.Handle("/", next)
		return provider.Guard(mux)
	}
	return wrap, access{table: table}, nil
}
