---
schema: 3
id: TKT-01M2MEBNKV23GT9ATQ4PGZQSMB
title: Authenticate with OpenID Connect and grant read access per store
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - auth
  - multiuser
  - security
assignees: []
milestone: null
parent: TKT-01M2MEAP8ED8NZYGJKN2002G6J
origin: null
dependencies:
  - TKT-01M2MEB8F779XMKSSP2JJA338J
blocks_on: none
references:
  - ref: doc:multiuser
    path: docs/multiuser-design-v1.md
  - ref: code:relying-party
    path: internal/auth/provider.go
  - ref: code:sessions
    path: internal/auth/sessions.go
  - ref: code:guard
    path: internal/auth/guard.go
  - ref: code:grants
    path: internal/grants/grants.go
  - ref: code:grant-config
    path: internal/config/roles.go
  - ref: code:access
    path: internal/cli/access.go
  - ref: code:signon
    path: internal/cli/signon.go
  - ref: code:registry-filter
    path: internal/api/registry.go
  - ref: test:token-refusals
    path: internal/auth/provider_test.go
  - ref: test:store-invisibility
    path: internal/api/access_test.go
  - ref: test:identity-isolation
    path: internal/cli/identity_test.go
  - ref: doc:operator-guide
    path: docs/serving-a-canvas.md
claim: null
archive: null
created_at: 2026-09-16T06:27:10Z
updated_at: 2026-09-16T15:45:45Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The security core, and enough to publish a canvas at a hostname. Read-only: writer roles are in the grant schema so it never needs migrating, and are not switched on here. The reason is attribution, not effort, and it is recorded on its own ticket.

Discovery, the JWKS fetch, signature verification, and the code exchange come from the library. What the canvas owns is the configuration shape, the group mapping, and three refusals that are not configurable: a plaintext issuer, signing algorithms read from discovery rather than pinned to asymmetric schemes, and an unchecked nonce.

The rule the rest of the model protects: a user with no matching group on a store gets nothing on that store. Not a default role, not read access, not an entry in the list. A global role map is allowed as sugar and grants nothing by itself, because the global-map shape is the one that reads naturally and silently grants every new store to everyone already in it.

`GET /api/stores` is part of the boundary. It returns every configured store with its resolved filesystem path, and the picker renders those paths, so it discloses the name and on-disk location of every repository the host serves to anyone who can log in. Filter in the handler; a front-end filter is a rendering decision made after the data has left.

Identity configuration comes from the server command's own file or flags and never from a store's `.tickets/config.yml`. A ticket store is a git repository, and the multi-store design already lets a store influence what the canvas serves. That path must not extend to deciding who the canvas trusts to log in.

See `docs/multiuser-design-v1.md`.

## Acceptance criteria

- [x] A login against a real provider yields subject, email, name, and groups, and everything downstream keys on subject
- [x] A plaintext issuer is refused, and any development opt-out says in its name that it is unsafe
- [x] Signing algorithms are pinned to asymmetric schemes, with tests for none, algorithm confusion, and kid handling
- [x] The nonce is checked against the attempt that started in this browser
- [x] A user with no matching group on a store cannot read it and cannot see it listed
- [x] GET /api/stores returns only stores the caller holds a role on, filtered server-side
- [x] Identity configuration is never read from a store's config.yml, and a test proves it
- [x] Sessions are server-side behind an opaque id, with nothing about the principal in the cookie

## Implementation plan

Three seams, none of which mentions a canvas type, and one place where they meet.

### internal/auth

The relying party, server-side sessions, and the guard that refuses everything
behind it without one.

`Identity` is four fields and stops. Discovery, the key fetch and its rotation,
signature verification, and the code exchange come from `go-oidc`. What is owned
here is the configuration shape, the claim mapping, and three refusals.

`SigningAlgorithms` is a fixed list of asymmetric schemes, passed to the
verifier rather than read from the provider's metadata. The test provider
advertises `HS256` and `none` beside `RS256` precisely so that a change to read
them from discovery fails.

Discovery happens on the first login rather than at startup, and a failure is
not cached. A canvas that will not start because a provider was restarting is a
worse tool than one that starts and reports it when somebody tries to log in.

The nonce is checked against a login attempt held server-side and keyed by a
cookie, because a nonce checked against something the server also sent to the
provider is not a check. State, nonce and PKCE verifier are three separate
values: they are checked by three different parties, and a value playing two
roles fails both when it leaks.

`Sessions` is a map from an opaque 256-bit id to an identity. Nothing about the
person is in the cookie, so there is no signing key and nothing to forge. The
lifetime is an idle timeout, extended on use.

### internal/grants

`Grants` answers which roles a principal holds on a named resource. Three
implementations: `Everything` for the desk canvas, `Static` for configured
grants, and `Nothing` so that a broken configuration fails closed.

`Static` has no map that applies to every resource. `Table.Honour` is the
convenience the global-map shape wanted to be, kept harmless: a resource names
the shared groups it honours or does not have them. Honouring a group the shared
map does not name is refused at construction, because it would otherwise grant
nobody anything and look exactly like a store meant to be private.

### internal/api

`Access` is two methods: who is asking, and may they read this store.
`Registry.visible` is the one place the rule lives, so listing a store, opening
one, and favouriting one cannot disagree about whether it exists.

`Statuses` splits: the unfiltered startup report, and `statusesFor(req)` which
filters and marks favorites for one caller. Every request-facing route takes the
second. `acquire`, `touch` and `rememberLast` carry the request, so the store
last used is the caller's rather than the process's.

An invisible store answers exactly as an absent one, at `/api/stores/{name}/`,
on the flat route, and on `PUT /api/favorites`. `POST /api/stores/rescan` is
refused outright on a served canvas: it changes what the process serves, which
is administration.

### internal/cli

`access` joins the three: the guard's identity off the request context, the
grant table, and `state.Subject` for per-user state. Reading the context rather
than the cookie is deliberate, so a request that reached a handler without
passing the guard has no caller and every store is invisible to it.

`signOn` builds the wrapper and the gate, or neither.

### Configuration

`identity:` gains `baseUrl`, `scopes` and `groupsClaim`; `roles:` at the top
level and `roles:`/`honourGroups:` per store carry the grants. All of it is in
the canvas's own file. Nothing reads a store's `config.yml` except
`discover.readChildren`, which decodes `canvas.children` into its own struct, so
the path from repository bytes to identity does not exist rather than being
closed.

## Notes

**agent:claude/t3code** at 2026-09-16T14:16:40Z

The first criterion is earned against a fake provider, not a real one, and here is exactly what that does and does not prove.

`internal/auth/idp_test.go` is an identity provider over TLS with a real RSA keypair, a real JWKS, real discovery, and a token endpoint that mints whatever a test tells it to. The full flow runs through it: `Login` builds the authorization URL, the test reads the state and nonce out of it, `Callback` exchanges a code and verifies the token. `TestALoginYieldsAnIdentity` asserts subject, email, name and groups arrive, and `TestAccessJoinsIdentityToGrants` asserts everything downstream keys on `state.Subject(subject)` rather than on the email.

What a fake proves that a real provider cannot: every one of these tokens. `none`, an HMAC algorithm against a public keyset, a key the keyset does not publish, that same key wearing the published key's id, another audience, expired, a nonce from a different attempt, no nonce, no subject. A working provider will not mint any of them, and each is a way to be handed an identity that verifies and is not true.

What it does not prove: that Authentik or Keycloak spell their claims the way this expects. The group claim shape is defended against rather than assumed (`TestGroupsAreReadFromWhateverTheProviderSent` covers a list, a bare string, a list with rubbish in it, a number, and absent), and `groupsClaim` and `scopes` are configurable for the same reason. The first real login against a real provider is still a thing somebody has to do, and if the groups arrive empty, that setting is where to look.

A TLS fake rather than a plaintext one was chosen so that no development opt-out for a plaintext issuer had to exist. The refusal has no flag at all, which is the strongest form of the second criterion.

**agent:claude/t3code** at 2026-09-16T14:16:40Z

Decisions this ticket made that the design document left open, with what lost.

**The grant configuration shape.** The design shows per-store `roles:` and says a global map "is allowed as a convenience, and it grants nothing on its own. A store lists which groups it honours, or it is private." It does not say how a store lists them. Implemented as a top-level `roles:` map plus `honourGroups: [...]` per store.

Rejected: overloading the role value with a magic word (`"Brokkr Staff": inherit`), because the magic word lives in the same space as a role name and a future role called `inherit` would silently change meaning. Also rejected: making the top-level map apply unless a store opts out, which is the global-map failure with an extra step.

Honouring a group the shared map does not name is a startup error rather than a shrug. It grants nobody anything, and at runtime that is indistinguishable from a store somebody meant to keep private, so it has to be caught where it can still be reported.

**`baseUrl` is required.** The redirect URI has to be built from something, and the alternative is the request's `Host` header, which is chosen by whoever sent the request. Adding a third required setting is a real cost to an operator; being unable to say what your own canvas's URL is, is not a thing that happens.

**Discovery is lazy.** Deferred to the first login, and a failure is not cached. This is the behaviour `config.Identity.Validate`'s comment already promised in the previous phase.

**`POST /api/stores/rescan` is refused outright on a served canvas**, rather than restricted to an administrator. There is no administrator yet, and the alternative was leaving a route that changes what the process serves reachable by any reader. TKT-01M2MEC1 is where it comes back with an audit entry behind it.

**An invisible store answers as an absent one.** The design says a store nobody granted is "invisible rather than public" and says the list is filtered; it does not say what a direct request answers. 404 with the same body a nonexistent store gets. 403 would say the repository is here, which is the thing the store-list filter exists to not say. `TestAnUngrantedStoreIsNotAcknowledged` compares the two bodies with the echoed name normalised out.

**A store with no `name:` cannot be granted.** Its id is a hash of its path. Refused at startup rather than ignored, because a grant written against a hash would break on the next move and nothing would say why.

**agent:claude/t3code** at 2026-09-16T14:16:40Z

What is not done, and what the next phase inherits.

**The browser shows no login state.** There is no `/api/session` route, no name in the toolbar, and no logout control. Nothing breaks: an unauthenticated page request is redirected to the provider and comes back, so a browser works end to end without a frontend change. But somebody logged in cannot see as whom, and cannot log out without typing `/auth/logout`. That is a gap worth a ticket rather than something this one silently covered. Not filed; TKT-01M2MECN07 touches the same surface and may want to carry it.

**Group membership is read at login and never again.** A person removed from a group keeps what that group granted until their session expires, up to twelve hours, or until the canvas restarts. Re-reading groups would mean holding a refresh token and calling the provider on a schedule, which is a larger thing to hold than this phase needed. Revocation today is a restart.

**Discovered stores cannot be granted.** Anything found by a `--root` walk gets a hashed id, and grants are by written name, so a served canvas effectively serves only the stores named in its configuration. That falls out of the rules rather than being decided, it is the safe direction, and it means `-R` on the served command finds stores nobody can see. Worth knowing before somebody reports it as a bug.

**Three dependencies were added**, as the design anticipated and no more: `go-oidc/v3 v3.21.0`, `go-jose/v4 v4.1.4`, `x/oauth2 v0.36.0`. `oauth2` is pinned to v0.36.0 rather than latest: v0.37.0 declares `go 1.26.0`, which would have moved this module's own go directive, and the Forgejo lanes run a pinned `golang:1.25-alpine` image. THIRD_PARTY_LICENSES carries all three.

**agent:claude/t3code** at 2026-09-16T14:17:10Z

The first criterion is left unticked, and this says what remains.

It reads "a login against a real provider". No login has been run against Authentik, Keycloak, or anything else somebody operates. What has been run is a full authorization-code flow against a fake provider that does real discovery, serves a real JWKS, signs with a real RS256 key, and exchanges a real code: subject, email, name and groups arrive, and `TestAccessJoinsIdentityToGrants` shows everything downstream keying on the subject.

So the half of the criterion about what a login yields and what keys on it is demonstrated. The half about a real provider is not, and only somebody with one can close it.

What to do when you have one: register `<baseUrl>/auth/callback`, start the server, log in, and check that groups arrive non-empty. If they do not, `identity.groupsClaim` and `identity.scopes` are the two settings that matter, and `docs/serving-a-canvas.md` says what each provider tends to need. Then tick this box.

Every other criterion on this ticket is earned by a test named in the summary.

**agent:claude/t3code** at 2026-09-16T15:09:42Z

**Run against a real provider: Authentik 2026.5.7, on brokkr, 2026-09-16.** The canvas serves the ledger store at `https://ledger.brokkr.local.sothr.com` behind Traefik, and a person logged in through it.

This is the criterion that was left unticked because a fake IdP cannot earn it. Here is exactly what the real one settled, and what it did not.

### Settled

**`groups` needs no extra scope and no `groupsClaim` setting on Authentik.** The default `profile` mapping emits `"groups": [group.name for group in request.user.groups.all()]`, so the canvas's default of reading `groups` from the ID token is right as shipped. The operator's guide already said this about Authentik and Keycloak; it is now measured on one of them rather than asserted.

**The group claim arrives and the grant matches on it.** Proved by consequence rather than by reading a token, which is the stronger direction: the ledger store is granted only through `honourGroups` naming two Authentik groups, so if `groups` had been missing or empty, `CanRead` would have been false, `GET /api/stores` would have been empty, and the board would have been blank. It rendered 79 of 79 tickets. Authentik's own event records the authorization with scopes `profile openid email` through the explicit-consent flow.

**Everything downstream keys on subject.** The provider is configured `sub_mode: hashed_user_id`, so the subject is opaque and stable and is not the email or the username. The session, the state key and the actor binding all took it without incident.

**A second browser with no session was still refused** while the first was reading the board, which is the session boundary holding under concurrent use rather than in a unit test.

**The authorization request is what it should be on the wire**: code flow, PKCE `S256`, state and nonce present, exact strict redirect URI, attempt cookie `HttpOnly` and `Secure`. The redirect Traefik returns is built from `baseUrl` and not from the backend's own host, which is the thing that would break silently behind a proxy.

### Not settled, which is why this criterion stays unticked

The criterion names four claims. `subject` and `groups` are demonstrated above. **`email` and `name` are not.** They were requested, consented and almost certainly delivered — the `email` scope is in Authentik's record of the authorization — but nothing in the canvas displays them, so nobody has seen them. There is no `/api/session`, the board carries no identity, and a successful login writes nothing to the log.

That is the same gap already recorded on the epic, and this is the first time it has had a concrete cost: a deployment cannot show that the claims it receives are the claims it asked for. Two things would each close it, and the second is better:

1. `GET /api/session` returning the principal, which the missing login UI needs anyway.
2. **One log line on a successful login** naming subject, name and groups. An operator reading the unit's journal today cannot tell who has been reading a ticket store, and Authentik's event log is the only record that anybody signed in at all. For a canvas whose entire purpose is serving a store to several people, that is a hole in the record, not a missing convenience.

### A provider-side trap worth carrying into the operator's guide

Authentik 2026.5.7 defaults an **API-created** OAuth2 provider's `grant_types` to an empty list, and an empty list refuses every authorization with `error=invalid_request` and "The request is otherwise malformed" — redirected back to the client, before any flow runs, **with no event written on the provider's side**. Every other field looks correct. The UI populates it, so this bites only somebody automating provider creation, which is exactly what a deployment guide encourages. `docs/serving-a-canvas.md` should say so under registering the canvas with a provider.

**agent:claude/t3code** at 2026-09-16T15:45:45Z

Criterion 1 is now ticked. `TKT-01M2ND34E7KCEYBDXQAF328WJB` built the account dialog, which is the first thing in the canvas that displays the `email` and `name` claims, and a live login against Authentik on brokkr showed both as the provider sent them: `Drew Short` and the address on the account.

That was the whole of what was missing. Subject and groups were demonstrated when this was first noted — the subject through the session and the grant, the groups through the board rendering at all, since the store is granted only through `honourGroups`. What nobody could see was `email` and `name`, because nothing displayed them.

Sixteen groups arrived in the token and exactly the two ledger groups granted anything, which is also the first live confirmation that group matching is exact rather than accidental.

## Summary

The security core. A canvas can be published at a hostname, read-only, behind single sign-on, with read access granted per store.

`internal/auth` is the relying party, server-side sessions, and the guard. `internal/grants` answers which roles a principal holds on a named resource, with three implementations so the desk canvas is the null case of one model rather than a second code path. `internal/api` gained an `Access` seam of two methods and consults it on every request-facing route. `internal/cli` joins them and is the only place all three meet.

Earned, each by a named test:

- Plaintext issuers refused, with no opt-out at all, so there is nothing to name unsafely (`TestAPlaintextIssuerIsRefused`). The same rule covers the canvas's own base URL, since a session cookie over plaintext is a session anybody on the path takes; loopback is exempt.
- Algorithms pinned to asymmetric schemes and not read from discovery. The fake provider advertises `HS256` and `none` beside `RS256` so that reading them would be caught. Nine token attacks refused: `none`, an HMAC algorithm against the published modulus, an unpublished key, that key wearing the published kid, wrong audience, expired, a nonce from another attempt, no nonce, no subject (`TestATokenThatShouldNotVerifyDoesNot`).
- The nonce checked against a server-side attempt keyed by a browser cookie, and the attempt spent when used (`TestACallbackMustBelongToAnAttempt`, `TestAnAttemptIsUsedOnce`).
- A store nobody granted is invisible and answers exactly as one that is not configured, on the store route, the flat route, and favorites (`TestAnUngrantedStoreIsNotAcknowledged`, `TestFavoritingAnUngrantedStoreIsRefusedAsUnknown`).
- `GET /api/stores` filtered in the handler, paths included (`TestTheStoreListIsFilteredInTheHandler`).
- Identity never from a store's `config.yml`, proved with a store that declares an issuer, a grant table and a child in the same file: the child is honoured, nothing else is read, and the served canvas still refuses to start (`TestIdentityIsNeverReadFromAStoresOwnConfiguration`).
- Sessions behind an opaque 256-bit id with nothing about the person in the cookie (`TestTheCookieCarriesNothingAboutThePerson`).

Not earned: the first criterion, which asks for a login against a real provider. A full flow runs against a fake one that does real discovery, JWKS, RS256 and code exchange, so what a login yields and what keys on it are shown; nobody has logged in through Authentik or Keycloak. Left unticked, with a note saying what to check when somebody does.

Three decisions the design left open are recorded in a note with what lost: the `honourGroups` shape for the shared role map, `baseUrl` being required rather than taken from the Host header, and rescan being refused outright rather than restricted.

Three gaps are recorded in another: the browser shows no login state and has no logout control, group membership is read once at login so revocation waits for a session to expire or a restart, and stores found by a `--root` walk cannot be granted because their ids are hashes.

Dependencies: `go-oidc/v3`, `go-jose/v4`, `x/oauth2`, as the design anticipated and no more. `oauth2` is pinned to v0.36.0 because v0.37.0 would have moved this module to go 1.26 and the Forgejo lanes run a pinned 1.25 image.

`docs/serving-a-canvas.md` is the operator's guide. `just check` passes, including `go test -race`.
