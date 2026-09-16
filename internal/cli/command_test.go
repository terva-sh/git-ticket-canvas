package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/terva-sh/git-ticket/ticket"
)

const (
	deskPackage   = "github.com/terva-sh/git-ticket-canvas"
	servedPackage = "github.com/terva-sh/git-ticket-canvas/cmd/git-ticket-canvas-server"
)

// built caches one build per package, because these tests run several
// executables and a Go build is the slowest thing in the file.
var (
	built    sync.Map
	buildDir string
)

// TestMain owns the directory the built commands live in.
//
// t.TempDir would not do: it is removed when the test that asked for it ends,
// and these binaries are shared by every test in the file. The first one to
// finish would take the rest of the run's executables with it.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "canvas-cli-build-")
	if err != nil {
		fmt.Fprintln(os.Stderr, "build directory:", err)
		os.Exit(1)
	}
	buildDir = dir
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

func build(t *testing.T, pkg string) string {
	t.Helper()
	if path, ok := built.Load(pkg); ok {
		return path.(string)
	}
	name := filepath.Base(pkg)
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	binary := filepath.Join(buildDir, name)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if output, err := exec.CommandContext(ctx, "go", "build", "-o", binary, pkg).CombinedOutput(); err != nil {
		t.Fatalf("build %s: %v\n%s", pkg, err, output)
	}
	path, _ := built.LoadOrStore(pkg, binary)
	return path.(string)
}

func storeIn(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if _, err := ticket.Init(dir, ticket.InitOptions{
		Actor: ticket.Actor{ID: "agent:test/cli", Name: "CLI test"},
	}); err != nil {
		t.Fatal(err)
	}
	return dir
}

// The rule the split exists to make structural: a canvas with no
// authentication does not listen where anybody else can reach it.
func TestTheDeskCanvasRefusesANonLoopbackAddress(t *testing.T) {
	for _, addr := range []string{"0.0.0.0:7777", ":7777", "192.0.2.10:7777", "[::]:7777"} {
		t.Run(addr, func(t *testing.T) {
			err := Run(Desk, []string{"git-ticket-canvas", "-store", storeIn(t), "-addr", addr})
			if err == nil {
				t.Fatalf("-addr %s was accepted by the desk canvas", addr)
			}
			// The error has one job beyond refusing: saying what to run
			// instead. Somebody who reaches this is trying to publish a canvas,
			// and the answer is a different command rather than a different
			// flag.
			if !strings.Contains(err.Error(), Served.String()) {
				t.Errorf("the refusal does not name %s: %v", Served, err)
			}
			if !strings.Contains(err.Error(), unsafePublishFlag) {
				t.Errorf("the refusal does not name the container override: %v", err)
			}
		})
	}
}

func TestLoopbackAddressesAreAccepted(t *testing.T) {
	for _, c := range []struct {
		addr string
		want bool
	}{
		{"127.0.0.1:7777", true},
		{"127.0.0.53:7777", true},
		{"[::1]:7777", true},
		{"localhost:7777", true},
		{"0.0.0.0:7777", false},
		{":7777", false},
		{"192.0.2.10:7777", false},
		{"[::]:7777", false},
	} {
		got, err := loopbackOnly(c.addr)
		if err != nil {
			t.Errorf("%s: %v", c.addr, err)
			continue
		}
		if got != c.want {
			t.Errorf("loopbackOnly(%q) = %v, want %v", c.addr, got, c.want)
		}
	}
	// A name that does not resolve is a typo, not a security rule. Reporting it
	// as "not loopback" would send somebody reading about authentication.
	if _, err := loopbackOnly("no-such-host.invalid:7777"); err == nil {
		t.Error("an unresolvable host was answered rather than reported")
	}
	if _, err := loopbackOnly("127.0.0.1"); err == nil {
		t.Error("an address with no port was accepted")
	}
}

// The override exists for a container, which has to bind 0.0.0.0 to be
// reachable through a published port at all. It does not exist to make the
// refusal go away, which is why it says so in its own name.
func TestTheContainerOverrideIsNamedAfterWhatItCosts(t *testing.T) {
	if !strings.Contains(unsafePublishFlag, "unsafe") {
		t.Errorf("the override is called %q, which does not say it is unsafe", unsafePublishFlag)
	}
	if err := checkDeskAddr("0.0.0.0:7777", true); err != nil {
		t.Errorf("the override did not permit a non-loopback address: %v", err)
	}
}

// A served canvas authenticates every request, so a served canvas with nothing
// to authenticate against is a broken invocation rather than a degraded one.
func TestTheServedCanvasRefusesToStartWithoutAProvider(t *testing.T) {
	for _, args := range [][]string{
		{},
		{"-client-id", "canvas"},
		{"-issuer", "https://id.example.com"},
	} {
		err := Run(Served, append([]string{"git-ticket-canvas-server", "-store", storeIn(t)}, args...))
		if err == nil {
			t.Fatalf("the served canvas started with %v and no provider", args)
		}
		if !strings.Contains(err.Error(), "identity provider") {
			t.Errorf("%v: the refusal does not say what is missing: %v", args, err)
		}
		// The way out is named, because somebody hitting this on a laptop wants
		// the other command and does not yet know it exists.
		if !strings.Contains(err.Error(), Desk.String()) {
			t.Errorf("%v: the refusal does not name %s: %v", args, Desk, err)
		}
	}
}

// Discovery over a plaintext scheme is unauthenticated, so whoever can rewrite
// it chooses the keys every token is checked against.
func TestTheServedCanvasRefusesAPlaintextIssuer(t *testing.T) {
	err := Run(Served, []string{
		"git-ticket-canvas-server", "-store", storeIn(t),
		"-issuer", "http://id.example.com", "-client-id", "canvas",
	})
	if err == nil {
		t.Fatal("a plaintext issuer was accepted")
	}
	if !strings.Contains(err.Error(), "plaintext") {
		t.Errorf("the refusal does not say why: %v", err)
	}
}

// The two commands differ in the flags that exist at all. A flag that is absent
// cannot be passed by mistake, and this is what keeps the desk canvas's own set
// from drifting while nobody is looking.
func TestEachCommandHasItsOwnFlags(t *testing.T) {
	common := []string{
		"R", "actor", "addr", "config", "depth", "exclude", "json", "max-active",
		"read-only", "root", "scan", "state", "store", "store-idle", "version",
	}
	for _, c := range []struct {
		kind  Kind
		pkg   string
		extra []string
	}{
		{Desk, deskPackage, []string{unsafePublishFlag}},
		{Served, servedPackage, []string{"client-id", "client-secret", "issuer"}},
	} {
		want := append(append([]string{}, common...), c.extra...)
		sort.Strings(want)
		got := flagNames(t, build(t, c.pkg))
		if strings.Join(got, " ") != strings.Join(want, " ") {
			t.Errorf("%s flags:\n got %v\nwant %v", c.kind, got, want)
		}
	}
}

// flagNames reads a command's own help rather than its source, so the test sees
// what a person running -h sees.
func flagNames(t *testing.T, binary string) []string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	var help bytes.Buffer
	cmd := exec.CommandContext(ctx, binary, "-h")
	cmd.Stdout, cmd.Stderr = &help, &help
	// -h exits zero through flag.ErrHelp; anything else is a real failure.
	if err := cmd.Run(); err != nil {
		t.Fatalf("%s -h: %v\n%s", binary, err, help.String())
	}
	var names []string
	for _, match := range regexp.MustCompile(`(?m)^\s+-(\S+)`).FindAllStringSubmatch(help.String(), -1) {
		names = append(names, match[1])
	}
	sort.Strings(names)
	return names
}

// Read-only is what makes it acceptable to ship an access-control system before
// the attribution problem is solved, so it is the served canvas's default
// rather than something an operator has to remember.
func TestTheServedCanvasDefaultsToReadOnly(t *testing.T) {
	store := storeIn(t)
	url, stop := serve(t, build(t, servedPackage),
		"-store", store, "-addr", "127.0.0.1:0",
		"-issuer", "https://id.example.invalid", "-client-id", "canvas")
	defer stop()

	if code, _ := call(t, "GET", url+"/api/board", ""); code != http.StatusOK {
		t.Errorf("GET /api/board = %d, want 200; a read-only canvas still reads", code)
	}
	if code, body := call(t, "POST", url+"/api/tickets", `{"title":"Written by a served canvas"}`); code != http.StatusForbidden {
		t.Errorf("POST /api/tickets = %d (%s), want 403 with no -read-only passed", code, body)
	}
}

// The desk canvas is unchanged: it writes, because loopback plus your own
// repository plus one person is the case where writing is the entire point.
func TestTheDeskCanvasStillWritesByDefault(t *testing.T) {
	store := storeIn(t)
	url, stop := serve(t, build(t, deskPackage),
		"-store", store, "-addr", "127.0.0.1:0", "-actor", "agent:test/cli")
	defer stop()

	if code, body := call(t, "POST", url+"/api/tickets", `{"title":"Written by a desk canvas"}`); code != http.StatusCreated {
		t.Errorf("POST /api/tickets = %d (%s), want 201", code, body)
	}
}

// serve starts a canvas on an arbitrary port and returns its base URL.
//
// The port comes back off the canvas's own startup line rather than being
// chosen here, because binding a port to learn its number and then releasing it
// is a race that fails once a week on a loaded machine.
func serve(t *testing.T, binary string, args ...string) (string, func()) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	cmd := exec.CommandContext(ctx, binary, args...)
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		cancel()
		t.Fatal(err)
	}
	stop := func() {
		cancel()
		_ = cmd.Wait()
	}

	found := make(chan string, 1)
	var log bytes.Buffer
	go func() {
		buf := make([]byte, 4096)
		address := regexp.MustCompile(`canvas (http://127\.0\.0\.1:\d+)`)
		for {
			n, err := stderr.Read(buf)
			log.Write(buf[:n])
			if match := address.FindStringSubmatch(log.String()); match != nil {
				select {
				case found <- match[1]:
				default:
				}
			}
			if err != nil {
				return
			}
		}
	}()
	select {
	case url := <-found:
		return url, stop
	case <-time.After(30 * time.Second):
		stop()
		t.Fatalf("%s did not start:\n%s", binary, log.String())
		return "", func() {}
	}
}

func call(t *testing.T, method, url, body string) (int, string) {
	t.Helper()
	req, err := http.NewRequest(method, url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	read, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	return response.StatusCode, string(read)
}

// Both commands report the same build, because the version is the build's
// identity rather than the executable's, and a release ships them from one
// commit.
func TestBothCommandsReportTheSameBuild(t *testing.T) {
	read := func(pkg string) map[string]any {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		out, err := exec.CommandContext(ctx, build(t, pkg), "--version", "--json").Output()
		if err != nil {
			t.Fatalf("%s --version --json: %v", pkg, err)
		}
		var v map[string]any
		if err := json.Unmarshal(out, &v); err != nil {
			t.Fatalf("%s: %v\n%s", pkg, err, out)
		}
		return v
	}
	desk, served := read(deskPackage), read(servedPackage)
	for _, key := range []string{"schemaVersion", "kind", "version", "commit", "go", "modified"} {
		if desk[key] != served[key] {
			t.Errorf("%s: desk reports %v, served reports %v", key, desk[key], served[key])
		}
	}
}
