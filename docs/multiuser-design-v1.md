# Serving a canvas to more than one person

Today `git-ticket-canvas` has no authentication of any kind. There is no
credential, no session, and no authorization code in the binary. Every request
that reaches the port is served, and the one security control in the HTTP layer,
`http.NewCrossOriginProtection()` at `internal/api/registry.go:787` and
`internal/api/server.go:100`, guards unsafe methods only. A `GET /api/board`
from a hostile origin returns the whole store with a 200. Measured against
v0.3.2 on loopback:

| Request | Result |
|---|---|
| POST, no `Origin` and no `Sec-Fetch-Site`, as curl sends | 201 |
| POST, `Origin` matches the forwarded `Host` | 201 |
| POST, `Origin` does not match `Host`, no `Sec-Fetch-Site` | 403 |
| POST, `Sec-Fetch-Site: cross-site` | 403 |
| GET `/api/board`, hostile `Origin`, `Sec-Fetch-Site: cross-site` | 200 |

That is correct for what the canvas is today, which is a tool you run on
loopback against your own repositories. It is not correct for a canvas published
at a hostname, and publishing one is what this document is for.

The design is two commands rather than one command with a flag, single sign-on
through OpenID Connect, grants scoped per store, and per-user state. The last of
those fixes a bug that exists today and is worth doing whether or not the rest
lands.

## What this does not do

Multiuser mode ships read-only. Roles for writing are designed here so the
schema does not need changing later, and they are not implemented in the first
version. The reason is in [Writes](#writes) and it is not about effort.

No user is authenticated against anything but an identity provider. There is no
local password, no user table the canvas owns, and no account creation. A canvas
with no provider configured has no multiuser mode at all.

Nothing here changes what a ticket store is, and no permission state is written
into one.

## Two commands, not one flag

The desk tool and the served tool are different products with different threat
models, and the split makes the safety rules structural rather than checked.

```
git-ticket-canvas          the desk tool: loopback, no auth, writable
git-ticket-canvas-server   the served tool: OIDC required, grants per store
```

`-addr` today takes whatever it is given (`main.go:100`, default
`127.0.0.1:7777`), so `-addr 0.0.0.0:7777` publishes every served store to the
network with nothing in front of it. Under the split, the desk tool **refuses a
non-loopback address** and its error names the other command. There is no
override, because an override is the thing somebody reaches for at the moment
they should be reaching for the server.

The defaults differ by command rather than globally. The desk tool stays
writable, because loopback plus your own repository plus one person is the case
where writing is the entire point, and flipping that default would mean
`git-ticket-canvas` in a repository does nothing useful until you pass a flag.
People alias around a flag like that within a week, and then the default has
bought nothing. The server defaults read-only and needs both an explicit flag
and a grant before any write is possible.

### Why not a build tag

terva puts every OpenID Connect file behind `//go:build terva_web`, which is how
it reconciles a standing no-new-dependencies rule with needing a relying party.
That works, and it is rejected here.

A build tag makes "does this binary have authentication" invisible at the call
site and answerable only by knowing how the binary was built. Two entrypoints
put the same information in the command name. Go's linker drops the unreferenced
tree from the desk binary either way, so the tag buys no size that the split
does not.

The `go.mod` cost is unavoidable under either scheme: `go-oidc/v3`, `go-jose/v4`
and `x/oauth2` against a file that currently has three direct requirements.
Writing a relying party by hand is the more dangerous choice, so the
dependencies are accepted deliberately rather than avoided cleverly.

## Identity

The relying party does the standard thing and stops early. Discovery, the JWKS
fetch and rotation, signature verification, and the authorization-code exchange
come from the library. What the canvas owns is the configuration shape, the
group mapping, and the refusals.

An authenticated login yields four things and nothing else:

```go
type Identity struct {
	Subject string   // the identity provider's stable id
	Email   string
	Name    string
	Groups  []string
}
```

Everything downstream keys on `Subject`. Email and username are mutable in every
identity provider, so keying on either means a rename strands a user's state or,
worse, a recycled address inherits someone else's access.

Three refusals are not configurable:

- **A plaintext issuer is refused.** Discovery over `http` is unauthenticated,
  so whoever can rewrite it can point the JWKS fetch at their own keys and sign
  any identity they like. The signature check would pass. A development opt-out
  may exist; it must say in its own name that it is unsafe.
- **Signing algorithms are pinned to asymmetric schemes**, not read from
  discovery. Authentik and Keycloak can both advertise HS256 beside RS256, and a
  token naming an HMAC algorithm against a keyset of public keys is the
  classic key-confusion shape.
- **The nonce is checked locally.** The library cannot do it, because only the
  caller knows which login attempt this browser started.

### Configuration never comes from a store

The issuer, client id, and client secret come from the server command's own
configuration file or its flags. They are never read from a store's
`.tickets/config.yml`.

A ticket store is a git repository. Letting repository-controlled bytes name the
issuer would mean whoever can land a commit decides who the canvas trusts to log
in. The canvas is more exposed to this than most tools, because the multi-store
design deliberately lets a store declare child stores in its own config, so
there is already a path by which one repository's bytes influence what the
canvas serves. That path must not extend to identity.

## Grants

A grant says that holders of some identity-provider group have some role on one
store.

```yaml
stores:
  - name: ledger
    path: ~/workspace/ledger
    roles:
      "Brokkr Ledger Admin": writer
      "Brokkr Staff": reader
```

### A store nobody granted is invisible

This is the rule the rest of the model exists to protect, so it is stated before
the mechanics.

A user with no matching group on a store gets **nothing** on that store. Not a
default role, not read access, not an entry in the list. Authenticating proves
who someone is. It says nothing about whether the operator meant to give them
this store.

The rule has to hold per store rather than globally, and the failure it prevents
is concrete: with a global role map, adding a store to the configuration to look
at it yourself grants it to everyone whose group is in that map. Nobody would
choose that, and everybody would ship it, because the global map is the shape
that reads naturally.

A global map is allowed as a convenience, and it grants nothing on its own. A
store lists which groups it honours, or it is private.

### The store list is a permission boundary

`GET /api/stores` returns every configured store with its resolved filesystem
path, and the picker renders those paths. Under grants it must return only the
stores the caller holds a role on.

This is not tidiness. The list discloses the name and on-disk location of every
repository the host serves, and that is information worth having even to
somebody who cannot read a single ticket. The filter belongs in the handler, not
in the front end, for the ordinary reason: a client-side filter is a rendering
decision and the data has already left the building.

### Administrators grant, and do not implicitly read

An administrator may create and revoke grants. An administrator has no implicit
read access to any store.

The capability is the same either way, since an administrator can grant
themselves whatever they like. The difference is that a self-grant is an action
that leaves a record, while implicit access leaves none. For a canvas serving
somebody's ledger, the question "who looked at this" should have an answer.

Self-granting is permitted and written to the audit log like any other grant.

## Managing grants in the canvas

Static configuration is where this starts, and it is not where it should end. An
operator who has to edit a file and restart a service to add a colleague will
either not add the colleague or will leave the grants too wide on purpose.

Moving grants into the canvas changes their character: permissions stop being
policy an operator writes and become **mutable state the canvas owns**. The
administration endpoint is then the most security-sensitive surface in the
application, because it is the one that can grant its own caller more access.
Everything in this section follows from that sentence.

### Bootstrapping

Somebody has to be the first administrator, and it cannot be whoever logs in
first.

The configuration file keeps exactly one job: naming the bootstrap administrator
group or subject. **That grant is not editable in the canvas.** It is the root of
trust, and putting it beyond the reach of the administration UI also disposes of
the last-administrator problem, since no sequence of clicks can leave the canvas
with nobody who can grant.

Every other grant moves into the application.

### The audit log

A permission system without one cannot answer the only question anybody ever
asks it urgently. Each entry records who granted or revoked what, on which
store, to which identity, when, and under which authenticated subject.

It is append-only and it is not editable through the API. An administrator who
can rewrite the record of their own grants has an audit log in name.

### Per-user grants, and the directory problem

Granting to a group is cheap because the identity provider already knows the
groups and puts them in the token. Granting to a person is not, because **the
canvas has no user directory.** It learns that a user exists when they log in.

Three ways out, and two are bad. Typing a raw subject identifier is unusable by
a human. Querying the provider for a user list needs a client credential with
directory scope, which is a much larger request of whoever operates the provider
and a much larger thing to hold.

The workable one is invite by email. An administrator grants to an email
address; the first login whose `email` claim matches binds the grant to that
subject permanently, and from then on the email is decoration.

That has a trap, and it is the same trap the subject rule exists to avoid,
relocated. An unbound grant is a claim on an email address, and email is mutable
in every provider, so a pending grant can be collected by whoever holds that
address next. It is designed against rather than discovered: pending grants
expire, binding happens once and cannot be repeated without an administrator
action, and every binding is an audit entry.

Per-user grants are in the schema from the first version and implemented after
group grants. Group grants cover every case we have today, and the directory is
where the time goes.

## Per-user state

`internal/state/state.go` holds favorites and the last store opened. Its own doc
comment says it is "what one person's canvas remembers", which is exactly right
and exactly the problem: the file is process-global, so in a multiuser canvas
your favorites are everybody's favorites.

This is not a new feature. It is a bug that already exists and that single sign-on
makes visible.

State becomes keyed on the authenticated subject, holding:

- the actor they write as, id and display name, per store
- favorites
- the last store opened
- the board home view, per board

Mode 1 uses one constant key. That means today's behaviour is the single-user
case of the general one rather than a second code path, and the file already
carries `Version: 1`, so the format is extended rather than replaced. It is
written `0o600` inside a `0o700` directory, which the existing implementation
already does.

Grant state does **not** live in this file. A bug in the favorites path should
not be able to corrupt the permission table, and the two have different
audiences: one is a user preference, the other is a security record.

### Where the board home view belongs

TKT-01M2KJ2DZ4KQDVA3G5FK0BFQZG proposes storing where the canvas is centred,
with a button to set it to where you are looking and another to reset it to the
origin. Where that value lives was an open question: the ticket store, where it
is committed and shared with everyone, or somewhere local.

In a multiuser canvas it is obviously per person. Two people looking at one
board want different home views, and a home view committed into a store is a
preference in somebody's git history. It belongs in per-user state. Deciding
this now means that ticket is not built the wrong way first and migrated later.

### The actor a write is stamped with

The user sets their own actor, in the web UI, per store. The canvas prefills it
from the identity provider so that nobody has to think about it on a first
login, and the user may then change it to whatever they want.

Prefill order, first non-empty wins: `preferred_username`, the local part of
`email`, then `name`. The result is offered as `human:<value>`, because the
`human:` prefix is the convention the store's own actors already use and
reproducing it by hand is friction with no upside.

Free choice means a user can type an actor id that reads like somebody else, so
the integrity of the record comes from two rules that do not constrain what they
may type:

- **An actor id is bound to one subject.** The canvas refuses an id already
  bound to a different subject, on that store. First claim holds. Two people
  therefore cannot both write as `human:drew`, and one person cannot take over
  an id another has been writing under.
- **The binding is recorded, and every change to it is an audit entry.** The
  store shows `human:drew`; the canvas can always answer which subject was
  writing as `human:drew` on a given date, and when that changed.

What those rules do not prevent is somebody claiming an id that belongs to a
person who has never signed in to this canvas. Nothing the canvas holds
contradicts that claim, because there is no binding to conflict with. Operators
who need more can turn on the store's declared actors as an allowlist, which
narrows the choice to ids the store already names. That is off by default,
because the cost of it being on is that every new user is blocked until an
operator edits a file, and the situation it defends against is one where the
people involved already have accounts on the same canvas.

Two details make the rules work. The binding is per store, since the same person
reasonably writes as different actors in different repositories. And it is
retained when a grant is revoked, so that re-granting somebody does not free
their id for a different person to claim and quietly inherit the appearance of
their history.

This needs a change the desk tool must not inherit. `resolveActor` at
`internal/api/registry.go:453` deliberately accepts an actor the store does not
list, with a comment explaining that the allowlist "is not enforced the way
series are" so that `--actor me@example.com` keeps working in a store that never
declared one. The desk tool keeps exactly that. The server command keeps it too
by default, and adds the binding check in front of it, which is a different
question from the allowlist: the allowlist asks whether the store knows this
name, and the binding asks whether somebody else is already using it. Actor
resolution is the second place the two commands diverge, after binding to an
address.

## Writes

Multiuser mode ships read-only, and the reason is not the authentication work.

**The canvas writes ticket changes and never commits them.** There is no git
invocation in the write path. One person leaving uncommitted changes in a
working tree is awkward and recoverable. Several people doing it concurrently,
into a tree that agents are also using, produces a state where the next `git
commit` sweeps up several people's edits under one name, and no record anywhere
says whose they were. The per-request actor correctly labels the ticket store's
own field and cannot label a commit.

Writer roles are in the grant schema from the start so the model does not need
migrating. Turning them on waits on a decision about committing, which is its
own question and does not block anything else here.

There is a second cost worth knowing before anyone plans the work. The actor is
resolved once when a store opens and lives on the `*Server` (`registry.go:291`),
and it is part of the cached board response: `conditional_test.go` lists `actor`
among the changes that invalidate a snapshot. Making the actor per-request means
either the snapshot cache can no longer be shared between users, or the actor
comes out of the board payload. Neither is hard; both are larger than they look
from the outside.

## The seams

Three interfaces carry everything above, and none of them mentions a canvas
type in its signature.

**Grants** answers which roles an identity holds on a named resource, and
optionally accepts changes. Three implementations, which is what makes the modes
one design rather than three:

| Mode | Implementation |
|---|---|
| Desk tool, no auth | null: one implicit user, everything permitted, nothing stored |
| Server, configured grants | immutable: reads the config, refuses writes, no admin UI |
| Server, managed grants | mutable: file-backed, audit log, admin UI |

**Sessions** holds logins server-side against an opaque random id. Nothing about
the principal is in the cookie, so there is no signing key to protect and
nothing to forge. Sessions do not survive a restart, which for one process is a
cheap re-login rather than a design problem, and is stated here so that eviction
is not read as a bug.

**User state** maps a subject to that person's preferences, with the
single-user case as one key.

### Extraction is deferred on purpose

The reusable piece is real. terva's relying party is already generic and already
cuts at the right place: it returns an identity with groups and stops, leaving
every decision about what groups mean to the tool. Resource-scoped grants are
the layer above, and neither tool has one.

It is still built inside the canvas first, with no canvas types in the exported
API, and extracted to a module when a second consumer asks for it. Designing for
two consumers while having one is how a framework arrives that neither fits, and
terva has a working, tested implementation with no reason to migrate to an
external module today. The clean seam is the part worth having now. The module
is packaging, and packaging can wait for evidence.

## Phases

Each phase is useful on its own, which is the test for whether the split is
real.

1. **Per-user state.** Fixes shared favorites, gives the board home view a
   home, and lands the single-user case of the keyed store. No identity provider
   involved.
2. **The entrypoint split and bind safety.** The desk tool refuses a
   non-loopback address. The server command exists and requires a provider.
3. **Single sign-on with configured grants, read-only.** The security core: the
   relying party, per-store grants, the store-list filter. Enough to publish a
   canvas at a hostname.
4. **Managed grants.** The administration API and UI over the mutable
   implementation, with the configuration file as bootstrap, and the audit log.
5. **Per-user grants** and the invite binding.

Writer roles are orthogonal to all five and gated on the commit question.

## Risks

**The administration UI is a privilege-escalation surface.** It is the endpoint
that can grant its caller more access, and it is the one that most deserves an
adversarial review rather than a feature review.

**Invite-by-email binds a grant to a mutable claim.** The expiry and the
one-time binding are what hold it together. If either is dropped as
"unnecessary", the property is gone and nothing will fail visibly.

**A user-chosen actor is a claim the canvas can only partly check.** Binding an
id to one subject stops two users colliding and stops a takeover, and it cannot
stop somebody claiming the name of a person who has never signed in. The record
that makes this recoverable is the subject-to-actor binding and its history, so
a change that stops recording it, or that lets an administrator edit it, removes
the only thing standing behind the store's `updated_by` field.

**Read-only is doing a lot of work here.** It is what makes it acceptable to
ship an access-control system before the attribution problem is solved. If
writer roles are switched on early to unblock something, the uncommitted
working tree arrives with them.

**A canvas that serves stores now keeps a record of everyone who logged in.**
Per-user state is also a directory, which is convenient for granting and is
personal data the tool did not previously hold. Retain it when a grant is
revoked, so re-granting does not wipe somebody's preferences, and make deletion
an explicit administrator action with an audit entry.
