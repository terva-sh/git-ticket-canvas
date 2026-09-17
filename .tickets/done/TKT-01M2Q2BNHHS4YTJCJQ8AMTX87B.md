---
schema: 3
id: TKT-01M2Q2BNHHS4YTJCJQ8AMTX87B
title: Split the canvas parity axes so read-only is its own
type: task
status: done
status_reason: null
priority: normal
due_on: null
labels:
  - infrastructure
  - multiuser
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-17T06:55:10Z
updated_at: 2026-09-17T07:00:45Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

The parity tooling landed comparing two shapes, desk-and-writable against served-and-read-only, because that is how the two commands ship. It bundles two independent things.

Sign-on is inherent: `internal/cli/signon.go` returns four nils for the desk kind and neither canvas can be run the other way. Read-only is a flag on both, and running the single-person canvas read-only is a real thing to want -- a desk canvas over a store you do not intend to modify.

So `#roBadge` is declared served-only, which is true of how the commands ship and false of what they are. Worse, the bundling means a genuine read-only chrome difference would be absorbed into 'that is just the served canvas' and never reported.

Split them: sign-on and read-only become separate axes, each measured with the other held constant, and `#roBadge` moves to the read-only axis where it belongs.

## Acceptance criteria

- [x] Sign-on and read-only are separate declared axes, each with what it is and whether it is inherent or a default
- [x] Each axis is measured with the other held constant, so neither absorbs the other's differences
- [x] An interaction, where an axis's differences depend on the other axis, is itself a failure rather than silently taking one measurement
- [x] The route set is asserted to be identical across the read-only axis rather than assumed, since read-only refuses at the handler and does not change registration
- [x] roBadge is declared on the read-only axis and the manifest no longer implies a desk canvas cannot show it

## Summary

Sign-on and read-only are now separate axes, each measured with the other held
constant over the whole 2x2 grid, and `#roBadge` is declared on the read-only
axis where it belongs.

The bundling was defensible when it shipped -- the shapes matched how the two
commands actually run -- and wrong for a reason worth stating: it described the
commands rather than the code. Read-only is a flag both commands have and only
the default differs, so a desk canvas pointed at a store somebody does not
intend to modify is an ordinary thing to run and the manifest implied it could
not show the badge.

The worse half was what the bundling would have hidden. A genuine read-only
chrome difference would have appeared inside the desk-versus-served comparison
and been absorbed into "that is just the served canvas", declared once and never
questioned. Splitting the axes is what makes such a difference visible as its
own thing.

Separating axes is only meaningful if they separate, so that is asserted rather
than assumed. Each axis is measured twice, once at each setting of the other,
and a disagreement between the two measurements is its own failure naming the
interaction. Falsified with a control rendered on `account && readOnly`: the
test reports that sign-on differs depending on read-only, shows both
measurements, and says neither is the answer.

Routes stayed on one axis, and that claim is now tested instead of read off the
source. `TestReadOnlyChangesNoRouteReachability` probes every route at both
settings on both canvases; read-only refuses at the handler with 403 and a
refusal means the route exists. Falsified by making one route conditional on
read-only, which it caught on both canvases.

Two smaller guards came with it. An entry filed under an axis the manifest does
not define, or present on a side that axis does not have, now fails on both
halves -- a typo would otherwise file a real difference under a heading nothing
measures and it would read as declared while being unchecked. And the chrome
test asserts all four corners rendered a toolbar before comparing, because a
corner that failed to mount contributes an empty set and empty sets compare
equal.

Every new guard was falsified: the interaction check, a control filed on the
wrong axis, an undefined axis name, and a read-only route change. The typecheck
caught a cast I had written to reach `route` through the chrome entry type,
which `just drift-check` alone would not have: typecheck is its own recipe.

The store count remains held constant and is now documented as the third axis
rather than as an exclusion. Adding it is extending the grid rather than
reworking it.
