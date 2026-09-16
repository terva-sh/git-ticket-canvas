# Serving a canvas to other people

`git-ticket-canvas-server` publishes ticket stores at a hostname, behind single
sign-on, with read access granted per store. This is how to configure one and
what each refusal means when you hit it.

For the reasoning behind every decision here, read
[the design](multiuser-design-v1.md). This document is the operator's half.

## What it is not

It is read-only. Writer roles exist in the grant vocabulary so that the
configuration you write today does not need migrating, and nothing grants one
yet. The reason is attribution rather than effort: the canvas writes ticket
changes and never commits them, so several people writing into one working tree
produce a state where the next `git commit` sweeps up several people's edits
under one name.

There is no administration interface. Grants are what the configuration file
says, and changing them is editing the file and restarting. `POST
/api/stores/rescan` is refused for the same reason.

There is no user directory. The canvas learns that somebody exists when they
log in, and grants are to identity-provider groups rather than to people.

## A minimum configuration

```yaml
identity:
  issuer: https://id.example.com/application/o/canvas/
  clientId: git-ticket-canvas
  clientSecret: ...
  baseUrl: https://canvas.example.com

roles:
  "Brokkr Staff": reader

stores:
  - name: ledger
    path: /srv/ledger
    roles:
      "Brokkr Ledger Admin": reader
    honourGroups: ["Brokkr Staff"]

  - name: payroll
    path: /srv/payroll
    roles:
      "Brokkr Founders": reader
```

```sh
git-ticket-canvas-server -config /etc/git-ticket-canvas.yml -addr 127.0.0.1:7777
```

`-issuer`, `-client-id`, `-client-secret` and `-base-url` override the file for
one run. Prefer the file for the secret: an argument is readable by every other
process on the machine, and the canvas says so on stderr when you pass one.

## Registering the canvas with your provider

Register one redirect URI, `<baseUrl>/auth/callback`. The canvas prints it at
startup beside the issuer it will use, so a mismatch is visible before anybody
tries to log in rather than after they have typed a password.

The canvas asks for `openid`, `profile` and `email`. If your provider puts group
membership behind its own scope, name it:

```yaml
identity:
  scopes: ["groups"]
  groupsClaim: groups
```

`groupsClaim` names the ID token claim holding group names. The default is
`groups`, which is what Authentik and Keycloak both use. A claim holding a
single string rather than a list is read as one group; anything else is read as
no groups, because a group that cannot be read must grant nothing rather than
something unintended.

## How access is decided

A user with no matching group on a store gets **nothing** on that store. Not a
default role, not read access, not an entry in the list. Adding a repository to
the configuration so you can look at it yourself does not hand it to everybody
who can log in.

`roles:` at the top level is a convenience and grants nothing by itself. A store
honours an entry from it by naming the group under `honourGroups`, or it does
not have it. Honouring a group the top-level map does not name is refused at
startup: a typo there would grant nobody anything, and nothing at runtime can
tell that apart from a store you meant to keep private.

A store that grants nothing is reported at startup, once, so that a repository
you added and cannot see is not a bug hunt.

A store you did not give a `name:` cannot be granted. Its id is derived from a
hash of its path, so a grant could only be written against a value nobody chose
and every move changes. The canvas refuses rather than ignoring the grant.

### What being unable to read looks like

Invisible, not forbidden. `GET /api/stores` omits it, and every route under
`/api/stores/{name}/` answers exactly as it does for a store that is not
configured at all. "You may not read this" would tell the caller the repository
is on this host, and the store list exists to not answer that: it carries the
name and the resolved filesystem path of every repository served.

Marking a favorite is filtered the same way, for the same reason.

## The actor a write is stamped with

A served canvas is read-only, so nothing is stamped yet. The choosing and the
binding are built now anyway, because the record they produce is what gives a
store's `updated_by` field any meaning once writes are switched on, and a record
that starts the day writes do is a record with a hole at the front.

Each person sets their own actor id, per store:

```
GET  /api/stores/{store}/actor
PUT  /api/stores/{store}/actor   {"actor": "human:drew"}
```

`GET` offers one before they have chosen: the provider's `preferred_username`,
then the local part of the email, then the display name, first non-empty
winning, offered as `human:<value>`. The response says whether that is a
suggestion (`chosen: false`) or a decision.

Two rules hold the record together, and neither constrains what anybody may
type:

**An actor id belongs to one subject per store, first claim holding.** Two people
cannot both write as `human:drew`, and nobody can take over an id another has
been writing under. Changing your own actor does not release the old one either,
so the name your history is under cannot be claimed by somebody else later.

**Every claim and every change is recorded.** The canvas can always answer which
subject was writing as a given actor on a given date, and when that changed.

What the rules do not prevent is somebody claiming the id of a person who has
never signed in here, because there is no binding to conflict with. If you need
more, turn the store's own declared actors into an allowlist:

```yaml
stores:
  - name: ledger
    path: /srv/ledger
    enforceActors: true
```

That is off by default. The cost of it being on is that every new person is
blocked until somebody edits a file, and the case it defends against is one
where the people involved already have accounts on the same canvas.

### Reading the record

`${XDG_STATE_HOME:-~/.local/state}/git-ticket-canvas/actors.json`, beside the
favorites file and deliberately not in it: a bug in the favorites path must not
be able to rewrite who wrote what. `--state` moves both.

It holds every current binding and an append-only list of every claim and every
change, each with a timestamp, the store, the subject, the actor id, and what it
replaced. The canvas prints the bindings at startup. There is no API for reading
it, because there is no administration surface yet; an operator reads the file.

Unlike the favorites file, a record that will not parse stops the canvas rather
than starting empty. Carrying on as though nobody had ever claimed an id would
let the next person claim somebody else's name.

The binding is not touched by a grant. Revoking somebody's access and granting it
again leaves their id theirs, so re-granting does not free it for a different
person to claim and inherit the appearance of their history.

### The desk canvas

Unchanged. `git-ticket-canvas` resolves one actor when a store opens, from
`--actor` or the store's own `config.yml`, and accepts an id the store does not
list so that `--actor me@example.com` keeps working in a store that never
declared one. It has no actor route at all.

## Sessions

A login is held server-side against an opaque random id. Nothing about the
person is in the cookie, so there is no signing key to protect and nothing to
forge.

Sessions do not survive a restart. For one process that is a cheap re-login
rather than a design problem, and it is said here so that a deploy logging
everybody out is read as the design.

A session is idle-expired after twelve hours: reading a board all afternoon does
not log you out, walking away for the night does. `/auth/logout` ends one.

The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` whenever
`baseUrl` is https. Put the canvas behind TLS. `http` is accepted only for a
loopback `baseUrl`, for a canvas you are testing on your own machine.

## Refusals you may hit

**`no identity provider is configured`** — `issuer`, `clientId` or `baseUrl` is
missing. A served canvas authenticates every request and has nothing to
authenticate against. For a canvas on your own machine, run `git-ticket-canvas`.

**`the issuer ... is not https`** — discovery over a plaintext scheme is
unauthenticated, so whoever can rewrite the response chooses the keys every
token is verified against, and the signature check would then pass. There is no
opt-out and no flag.

**`the canvas base URL ... is not https`** — a session cookie over a plaintext
connection is a session anybody on the path can take. Loopback is exempt.

**`the identity provider at ... could not be read`**, on a login — discovery is
done on the first login rather than at startup, so a provider that was
restarting does not stop the canvas coming up. The next login tries again.

**`this login could not be completed`** — one of the callback's checks failed:
the browser started no login, the state did not match, the token did not verify
against the pinned algorithms, or the nonce belonged to a different attempt.
Which one is on the server's log and not in the browser's, because the browser
may be holding a code that is not its own.

**a store you granted is not listed** — check the group name against what your
provider actually sends. Group names are matched exactly.

## What the canvas will not accept from a repository

Identity configuration never comes from a store's `.tickets/config.yml`. A
ticket store is a git repository, and the multi-store design deliberately lets a
store declare further stores in that file, so a path already exists from
repository bytes to what the canvas serves. It does not extend to who the canvas
trusts to log in, or to who may read anything.

## The desk canvas

`git-ticket-canvas` is unchanged: loopback, writable, no authentication, and it
refuses a non-loopback `-addr`. A configuration file carrying an `identity:`
block is read by it, reported as ignored, and ignored.
