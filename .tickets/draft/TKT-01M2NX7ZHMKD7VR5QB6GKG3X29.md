---
schema: 3
id: TKT-01M2NX7ZHMKD7VR5QB6GKG3X29
title: Install both commands from the download installer
type: bug
status: draft
status_reason: null
priority: normal
due_on: null
labels:
  - infrastructure
assignees: []
milestone: null
parent: null
origin: null
dependencies: []
blocks_on: none
references: []
claim: null
archive: null
created_at: 2026-09-16T20:06:32Z
updated_at: 2026-09-16T20:06:32Z
created_by:
  id: agent:claude/t3code
  name: ""
updated_by:
  id: agent:claude/t3code
  name: ""
extensions: {}
---

## Description

`install.sh` places `git-ticket-canvas` and nothing else. It predates the split in TKT-01M2MEB8F779XMKSSP2JJA338J, and it still asserts the archive holds "exactly one root git-ticket-canvas binary".

Every v0.4.0 archive carries two commands. Somebody who installs the documented way gets the desk canvas and no way to run the served one, and the release notes tell them a served canvas exists. The archive, the image and `go install` all offer both; only the installer does not.

Found while verifying v0.4.0. Not a release blocker and not a reason to touch a published tag: the desk canvas installs correctly, its bytes match the archive, and the served canvas is available through `go install` and the image. It is the installer that is behind the release, and the fix belongs in the next one.

### What to check while fixing it

The `exactly one root binary` assertion at install.sh:118 is a real check, not an accident — it is what would catch an archive that had been repacked. Whatever replaces it should still refuse an archive that carries something unexpected, rather than installing whatever it finds.

The PATH warnings at the end name one binary too.
