package cli

import (
	"log"
	"net/http"
	"time"

	"github.com/terva-sh/git-ticket-canvas/internal/actors"
	"github.com/terva-sh/git-ticket-canvas/internal/api"
	"github.com/terva-sh/git-ticket-canvas/internal/auth"
	"github.com/terva-sh/git-ticket-canvas/internal/config"
	"github.com/terva-sh/git-ticket-canvas/internal/people"
)

// signOn builds what a served canvas needs in front of its registry, and
// nothing at all for a desk canvas.
//
// It returns two things because they go to two places. The wrapper takes the
// registry's handler and puts the login in front of it; the gate goes into the
// registry, which asks it what each request may see. Both are nil-shaped for
// the desk canvas: no login, and an Access of nil, which the registry reads as
// one person who may see everything.
func signOn(kind Kind, cfg config.Config, actorPath, peoplePath string) (func(http.Handler) http.Handler, api.Access, *actors.Bindings, *people.Directory, error) {
	if kind != Served {
		return func(next http.Handler) http.Handler { return next }, nil, nil, nil, nil
	}

	table, notes, err := cfg.Grants()
	if err != nil {
		return nil, nil, nil, nil, err
	}
	for _, note := range notes {
		log.Printf("note   %s", note)
	}

	// Who has signed in. Like the actor record and unlike the favorites file, a
	// record that will not parse stops the canvas: silently forgetting who has
	// been here is what an account of people must never do.
	seen, err := people.Open(peoplePath)
	if err != nil {
		return nil, nil, nil, nil, err
	}

	sessions := auth.NewSessions(0)
	provider, err := auth.NewProvider(auth.Config{
		Issuer:       cfg.Identity.Issuer,
		ClientID:     cfg.Identity.ClientID,
		ClientSecret: cfg.Identity.ClientSecret,
		BaseURL:      cfg.Identity.BaseURL,
		Scopes:       cfg.Identity.Scopes,
		GroupsClaim:  cfg.Identity.GroupsClaim,
		// Recording somebody must not be able to refuse them entry, so a
		// failure here is a warning and the login proceeds.
		OnLogin: func(who auth.Identity) {
			if err := seen.Seen(people.Person{
				Subject: who.Subject, Name: who.Name, Email: who.Email, Groups: who.Groups,
			}); err != nil {
				log.Printf("warn   this login was not recorded: %v", err)
			}
		},
	}, sessions)
	if err != nil {
		return nil, nil, nil, nil, err
	}

	// Who writes under which actor id. Unlike the favorites file, a record that
	// will not parse stops the canvas: it is the only account of who wrote what,
	// and carrying on as though nobody had claimed anything would let the next
	// person claim somebody else's name.
	bound, err := actors.Open(actorPath)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	for _, held := range bound.Held() {
		log.Printf("actor  %s on %s, since %s", held.Actor, held.Store, held.Since.UTC().Format(time.RFC3339))
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
	admins := map[string]bool{}
	for _, group := range cfg.Admins {
		admins[group] = true
	}
	if len(admins) == 0 {
		log.Printf("note   no group administers this canvas; set admins: in the configuration to name one")
	}
	return wrap, access{table: table, admins: admins}, bound, seen, nil
}
