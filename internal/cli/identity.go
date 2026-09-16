package cli

import (
	"flag"
	"log"

	"github.com/terva-sh/git-ticket-canvas/internal/config"
)

// identityFlags are the served canvas's own way of naming an identity
// provider, for an operator who would rather not keep a configuration file.
//
// They exist only on the served command. The desk canvas has no use for them,
// and a flag that is absent cannot be passed by mistake.
type identityFlags struct {
	issuer       *string
	clientID     *string
	clientSecret *string
	baseURL      *string
}

func (f *identityFlags) register(flags *flag.FlagSet) {
	f.issuer = flags.String("issuer", "",
		"OpenID Connect issuer URL, overriding the configuration file")
	f.clientID = flags.String("client-id", "",
		"OpenID Connect client id, overriding the configuration file")
	f.clientSecret = flags.String("client-secret", "",
		"OpenID Connect client secret, overriding the configuration file; a file is the better place for it")
	f.baseURL = flags.String("base-url", "",
		"the public URL this canvas is reached at, which the provider redirects back to")
}

// resolve layers the flags over the configuration file and refuses a canvas
// with no provider to authenticate against.
//
// Flags win, which is the precedence every other setting here already uses: the
// file is the durable form and the flag is this one run.
func (f *identityFlags) resolve(from config.Identity) (config.Identity, error) {
	if f.issuer != nil && *f.issuer != "" {
		from.Issuer = *f.issuer
	}
	if f.clientID != nil && *f.clientID != "" {
		from.ClientID = *f.clientID
	}
	if f.baseURL != nil && *f.baseURL != "" {
		from.BaseURL = *f.baseURL
	}
	if f.clientSecret != nil && *f.clientSecret != "" {
		// A secret on a command line is readable by every process on the
		// machine, so it is accepted and complained about rather than refused:
		// refusing it would push somebody to a worse workaround, and saying
		// nothing would let it sit in a unit file forever.
		log.Printf("warn   -client-secret is visible to every process on this machine; " +
			"put it under identity.clientSecret in the configuration file instead")
		from.ClientSecret = *f.clientSecret
	}
	if err := from.Validate(); err != nil {
		return config.Identity{}, err
	}
	return from, nil
}
