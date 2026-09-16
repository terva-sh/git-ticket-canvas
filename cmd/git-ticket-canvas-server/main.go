// Command git-ticket-canvas-server serves git-ticket stores to more than one
// person.
//
// It is a separate command rather than a flag on git-ticket-canvas because
// "does this canvas authenticate anybody" should be answerable from the name of
// the thing you started, not from which flags it was given. It refuses to start
// without an identity provider, defaults to read-only, and grants access per
// store: a store nobody granted is invisible rather than public.
//
// For a canvas on your own machine over your own repositories, run
// git-ticket-canvas.
package main

import "github.com/terva-sh/git-ticket-canvas/internal/cli"

func main() { cli.Main(cli.Served) }
