package config

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// Identity is the relying-party configuration the served canvas needs before it
// will start.
//
// It comes from the canvas's own configuration file, which an operator writes,
// or from the served command's flags. It is never read from a store's
// .tickets/config.yml, and that is a rule rather than an omission: a ticket
// store is a git repository, the multi-store design already lets a store's own
// bytes declare further stores for the canvas to serve, and extending that path
// to identity would mean whoever can land a commit decides who the canvas
// trusts to log in.
//
// Nothing here is consulted yet. TKT-01M2MEBN builds the relying party on top
// of it; this is the shape, and the refusal that stops a canvas starting
// without one.
type Identity struct {
	// Issuer is the provider's issuer URL, the one discovery is performed
	// against.
	Issuer string `yaml:"issuer,omitempty"`
	// ClientID is this canvas's registration with that provider.
	ClientID string `yaml:"clientId,omitempty"`
	// ClientSecret is the registration's secret, empty for a public client.
	ClientSecret string `yaml:"clientSecret,omitempty"`
	// BaseURL is the public URL this canvas is reached at. The redirect the
	// provider sends a browser back to is built from it, and it is configured
	// rather than taken from a request's Host header because a header is
	// chosen by whoever sent the request.
	BaseURL string `yaml:"baseUrl,omitempty"`
	// Scopes are requested beyond openid, profile and email. A provider that
	// puts group membership behind its own scope is named here.
	Scopes []string `yaml:"scopes,omitempty"`
	// GroupsClaim is the ID token claim holding group names. Empty means the
	// claim called groups, which is what Authentik and Keycloak both use.
	GroupsClaim string `yaml:"groupsClaim,omitempty"`
}

// Configured reports whether anything named a provider at all.
//
// It is deliberately weaker than Validate: the desk canvas uses it to notice
// that a shared configuration file carries a provider it is going to ignore,
// and a half-written provider is still worth saying that about.
func (i Identity) Configured() bool {
	return i.Issuer != "" || i.ClientID != "" || i.ClientSecret != "" || i.BaseURL != ""
}

// Validate refuses a served canvas that has nothing to authenticate against.
//
// The issuer is checked for shape here and not for reachability. Discovery
// happens when the relying party is built, and a canvas that will not start
// because a provider is down at that moment is a worse tool than one that
// starts and reports it.
func (i Identity) Validate() error {
	var missing []string
	if strings.TrimSpace(i.Issuer) == "" {
		missing = append(missing, "issuer")
	}
	if strings.TrimSpace(i.ClientID) == "" {
		missing = append(missing, "clientId")
	}
	if strings.TrimSpace(i.BaseURL) == "" {
		missing = append(missing, "baseUrl")
	}
	if len(missing) > 0 {
		return fmt.Errorf(
			"no identity provider is configured: %s %s not set.\n"+
				"Put them under `identity:` in the configuration file, or pass -issuer, -client-id and -base-url.\n"+
				"A served canvas authenticates every request and has nothing to authenticate against. "+
				"For a canvas on your own machine, run git-ticket-canvas instead",
			strings.Join(missing, " and "), plural(len(missing), "is", "are"))
	}

	parsed, err := url.Parse(i.Issuer)
	if err != nil {
		return fmt.Errorf("the issuer %q is not a URL: %w", i.Issuer, err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("the issuer %q is not an absolute URL, so discovery has nothing to fetch", i.Issuer)
	}
	if parsed.Scheme != "https" {
		// Discovery over anything but https is unauthenticated, so whoever can
		// rewrite the response points the key fetch at their own keys and signs
		// any identity they like. The signature check then passes. This refusal
		// is not configurable; TKT-01M2MEBN owns whatever development opt-out
		// ends up existing, and the design requires it to say in its own name
		// that it is unsafe.
		return errors.New("the issuer " + i.Issuer + " is not https: discovery over a plaintext scheme is " +
			"unauthenticated, so whoever can rewrite it chooses the keys every token is verified against")
	}

	base, err := url.Parse(i.BaseURL)
	if err != nil || base.Scheme == "" || base.Host == "" {
		return fmt.Errorf("the canvas base URL %q is not an absolute URL, so there is nothing for the "+
			"identity provider to redirect back to", i.BaseURL)
	}
	if base.Scheme != "https" && !loopback(base.Hostname()) {
		return fmt.Errorf("the canvas base URL %q is not https: a session cookie sent over a plaintext "+
			"connection is a session anybody on the path can take. http is permitted only on loopback, "+
			"for a canvas you are testing on your own machine", i.BaseURL)
	}
	return nil
}

func loopback(host string) bool {
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}
