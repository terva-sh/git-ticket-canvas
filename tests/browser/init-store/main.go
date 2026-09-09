// Command init-store initializes an isolated store for browser tests.
package main

import (
	"fmt"
	"os"

	"github.com/terva-sh/git-ticket/ticket"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: init-store ROOT")
		os.Exit(2)
	}
	if _, err := ticket.Init(os.Args[1], ticket.InitOptions{
		Actor: ticket.Actor{ID: "agent:playwright/baseline", Name: "Browser baseline"},
	}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
