package main

import (
	"bytes"
	"context"
	"net"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/terva-sh/git-ticket/ticket"
)

// The promise of --scan is that it explains discovery and exits. Holding the
// address it would have listened on proves the second half: a run that tried to
// serve would fail to bind, and a run that served would never return.
func TestScanExplainsAndExitsWithoutServing(t *testing.T) {
	binary := filepath.Join(t.TempDir(), "git-ticket-canvas")
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	build, cancelBuild := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancelBuild()
	if output, err := exec.CommandContext(build, "go", "build", "-o", binary, ".").CombinedOutput(); err != nil {
		t.Fatalf("build executable: %v\n%s", err, output)
	}

	dir := t.TempDir()
	if _, err := ticket.Init(dir, ticket.InitOptions{
		Actor: ticket.Actor{ID: "agent:test/scan", Name: "Scan test"},
	}); err != nil {
		t.Fatal(err)
	}

	held, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, binary, "--scan", "--addr", held.Addr().String())
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		t.Fatalf("scan: %v\nstderr=%s", err, stderr.String())
	}

	out := stdout.String()
	for _, want := range []string{"configured", "named explicitly", "1 store"} {
		if !strings.Contains(out, want) {
			t.Errorf("the scan output does not contain %q:\n%s", want, out)
		}
	}
	if stderr.Len() != 0 {
		t.Errorf("scan wrote to stderr: %s", stderr.String())
	}
}
