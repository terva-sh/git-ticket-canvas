package cli

import (
	"fmt"
	"log"
	"net"
)

// unsafePublishFlag lets the desk canvas bind an address anybody can reach.
//
// It says in its own name what it does, because that is the only thing standing
// between it and somebody reaching for it to make an error go away. The one
// case it exists for is a container: a process inside one has to bind 0.0.0.0
// to be reachable through a published port at all, and whether that port is
// mapped to a loopback address on the host is a decision made outside the
// process, which cannot see it.
//
// Everything else that wants an address on a network wants the served canvas.
const unsafePublishFlag = "unsafe-publish-without-authentication"

// checkDeskAddr refuses an address the desk canvas must not listen on.
//
// The desk canvas has no authentication of any kind: no credential, no session,
// and no authorization code. Every request that reaches the port is served, so
// the address it binds is the whole of its access control. That is correct for
// a tool run against your own repositories and wrong for one anybody can reach,
// and the two commands exist so the difference is structural rather than a flag
// somebody remembered.
func checkDeskAddr(addr string, unsafe bool) error {
	if unsafe {
		// Said out loud on every start, not only the one where somebody typed
		// it. A flag set in a container image or a unit file is read once and
		// then never again by anybody.
		logPublishingWithoutAuthentication(addr)
		return nil
	}
	loopback, err := loopbackOnly(addr)
	if err != nil {
		return err
	}
	if loopback {
		return nil
	}
	return fmt.Errorf(
		"-addr %s is not a loopback address, and %s has no authentication: every request that reaches "+
			"that port is served, including a GET of every ticket in every store.\n"+
			"Publish a canvas with %s, which requires an identity provider and grants read access per store.\n"+
			"If the port is only reachable through a loopback mapping somebody made outside this process, "+
			"such as a container run with -p 127.0.0.1:7777:7777, pass -%s",
		addr, Desk, Served, unsafePublishFlag)
}

// loopbackOnly reports whether an address can only be reached from this
// machine.
//
// A literal address is answered from the address itself. A name is resolved,
// and every address it resolves to has to be loopback, because a name that
// answers with one loopback address and one routable address is reachable from
// the network by the second one. A name that does not resolve is an error
// rather than a refusal: net.Listen would fail on it anyway, and reporting it
// as "not loopback" would send somebody looking for a security rule when they
// have a typo.
func loopbackOnly(addr string) (bool, error) {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false, fmt.Errorf("-addr %q is not an address:port: %w", addr, err)
	}
	if host == "" {
		// ":7777" listens on every interface. It is the shortest way to publish
		// a canvas by accident, so it is named rather than left to the caller's
		// error message.
		return false, nil
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback(), nil
	}
	resolved, err := net.LookupHost(host)
	if err != nil {
		return false, fmt.Errorf("-addr %q names a host that does not resolve: %w", addr, err)
	}
	if len(resolved) == 0 {
		return false, fmt.Errorf("-addr %q names a host that resolves to no address", addr)
	}
	for _, at := range resolved {
		ip := net.ParseIP(at)
		if ip == nil || !ip.IsLoopback() {
			return false, nil
		}
	}
	return true, nil
}

// logPublishingWithoutAuthentication says what the override bought, every time
// the canvas starts under it.
//
// A flag is typed once and then lives in an image or a unit file, where nobody
// reads it again. The line is on stderr beside the address the canvas is
// listening on, which is where somebody looking at a running canvas is already
// looking.
func logPublishingWithoutAuthentication(addr string) {
	log.Printf("warn   -%s: serving %s with no authentication. "+
		"Every request that reaches this port is served. Only the mapping in front of it decides who can.",
		unsafePublishFlag, addr)
}
