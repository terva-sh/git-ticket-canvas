// Command git-ticket-canvas serves a git-ticket store as an infinite canvas on
// the machine you are sitting at.
//
// The store on disk stays the source of truth: every edit made here goes
// through the library's typed mutations, under its lock, with the same
// revision preconditions the CLI uses. Shared read snapshots are rebuilt from
// authoritative files. Card positions live beside the tickets as text.
//
// This command has no authentication, so it refuses an address anybody else
// could reach. To publish a canvas at a hostname, run git-ticket-canvas-server,
// which requires an identity provider and grants read access per store.
package main

import "github.com/terva-sh/git-ticket-canvas/internal/cli"

func main() { cli.Main(cli.Desk) }
