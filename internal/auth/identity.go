// Package auth turns a browser with no credential into an identity, and holds
// that identity server-side against an opaque id.
//
// Discovery, the key fetch and its rotation, signature verification, and the
// authorization-code exchange come from the library. What is owned here is the
// configuration shape, the claim mapping, and the refusals: a plaintext issuer,
// a signing algorithm read from discovery rather than pinned, and an unchecked
// nonce. Each of those is a way to be handed an identity that verifies and is
// not true.
package auth

import "github.com/terva-sh/git-ticket-canvas/internal/grants"

// Identity is everything an authenticated login yields.
//
// It is deliberately four fields. A relying party that returns more invites the
// tool above it to key on something the provider may change.
type Identity struct {
	// Subject is the identity provider's stable id for this person, and the
	// only field anything downstream keys on. Email and Name are mutable in
	// every provider, so keying on either means a rename strands somebody's
	// state and a recycled address inherits somebody else's.
	Subject string
	Email   string
	Name    string
	Groups  []string
}

// Principal is this identity as the grant model sees it.
func (i Identity) Principal() grants.Principal {
	return grants.Principal{Subject: i.Subject, Email: i.Email, Groups: i.Groups}
}

// Actor is the actor id to offer this person before they choose their own.
//
// First non-empty wins: the provider's preferred username, then the local part
// of the email, then the display name. The `human:` prefix is the convention a
// store's own actors already use, and reproducing it by hand is friction with
// no upside.
//
// This is a suggestion and nothing more. TKT-01M2MECN07 is where a person sets
// what their writes are stamped with, and where an id binds to one subject.
func (i Identity) Actor(preferredUsername string) string {
	for _, candidate := range []string{preferredUsername, localPart(i.Email), i.Name} {
		if candidate != "" {
			return "human:" + candidate
		}
	}
	return ""
}

func localPart(email string) string {
	for at := 0; at < len(email); at++ {
		if email[at] == '@' {
			return email[:at]
		}
	}
	return ""
}
