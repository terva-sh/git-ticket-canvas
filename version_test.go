package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os/exec"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"testing"
	"time"

	"github.com/terva-sh/git-ticket-canvas/internal/buildinfo"
)

// TestParseBuildVersion pins the CLI to buildinfo.Parse. The parser's own
// cases live in internal/buildinfo; this checks the CLI never diverges.
func TestParseBuildVersion(t *testing.T) {
	for _, info := range []*debug.BuildInfo{
		nil,
		{Main: debug.Module{Version: "(devel)"}},
		{
			GoVersion: "go1.25.1", Main: debug.Module{Version: "v1.2.3+dirty"},
			Settings: []debug.BuildSetting{{Key: "vcs.modified", Value: "true"}, {Key: "vcs.revision", Value: "abcdef"}},
		},
	} {
		if got, want := parseBuildVersion(info), buildinfo.Parse(info); got != want {
			t.Fatalf("parseBuildVersion(%+v) = %+v, want %+v", info, got, want)
		}
	}
	if got, want := parseBuildVersion(nil), (versionInfo{SchemaVersion: 1, Kind: "version", Version: "devel", Commit: "unknown", Go: runtime.Version()}); got != want {
		t.Fatalf("fallback = %+v, want %+v", got, want)
	}
}

func TestVersionOutput(t *testing.T) {
	v := versionInfo{SchemaVersion: 1, Kind: "version", Version: "v1.2.3", Commit: "0123456789abcdef", Go: "go1.25.0"}
	for _, modified := range []bool{false, true} {
		v.Modified = modified
		var human bytes.Buffer
		if err := writeVersionInfo(&human, v, false); err != nil {
			t.Fatal(err)
		}
		suffix := ""
		if modified {
			suffix = ", modified"
		}
		want := "git-ticket-canvas v1.2.3 (0123456789ab, go1.25.0" + suffix + ")\n"
		if human.String() != want {
			t.Errorf("human output = %q, want %q", human.String(), want)
		}
		var machine bytes.Buffer
		if err := writeVersionInfo(&machine, v, true); err != nil {
			t.Fatal(err)
		}
		boolText := "false"
		if modified {
			boolText = "true"
		}
		wantJSON := `{"schemaVersion":1,"kind":"version","version":"v1.2.3","commit":"0123456789abcdef","go":"go1.25.0","modified":` + boolText + "}\n"
		if machine.String() != wantJSON {
			t.Errorf("JSON output = %q, want %q", machine.String(), wantJSON)
		}
	}
	var fallback bytes.Buffer
	if err := writeVersionInfo(&fallback, parseBuildVersion(nil), false); err != nil {
		t.Fatal(err)
	}
	if want := "git-ticket-canvas devel (unknown, " + runtime.Version() + ")\n"; fallback.String() != want {
		t.Errorf("fallback output = %q, want %q", fallback.String(), want)
	}
}

type versionErrorWriter struct{ err error }

func (w versionErrorWriter) Write([]byte) (int, error) { return 0, w.err }

func TestVersionWriteError(t *testing.T) {
	want := errors.New("write failed")
	for _, asJSON := range []bool{false, true} {
		if err := writeVersionInfo(versionErrorWriter{want}, parseBuildVersion(nil), asJSON); !errors.Is(err, want) {
			t.Errorf("write(asJSON=%v) = %v, want %v", asJSON, err, want)
		}
	}
}

func TestExecutableHelpAndVersionWithoutStore(t *testing.T) {
	binary := filepath.Join(t.TempDir(), "git-ticket-canvas")
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if output, err := exec.CommandContext(ctx, "go", "build", "-o", binary, ".").CombinedOutput(); err != nil {
		t.Fatalf("build executable: %v\n%s", err, output)
	}
	outside := t.TempDir()
	missingStore := filepath.Join(outside, "does-not-exist")
	run := func(args ...string) (string, string, error) {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, binary, args...)
		cmd.Dir = outside
		var stdout, stderr bytes.Buffer
		cmd.Stdout, cmd.Stderr = &stdout, &stderr
		err := cmd.Run()
		return stdout.String(), stderr.String(), err
	}
	t.Run("help", func(t *testing.T) {
		stdout, stderr, err := run("--help")
		if err != nil {
			t.Fatalf("help: %v\n%s", err, stderr)
		}
		if stdout != "" || !strings.Contains(stderr, "-version") || !strings.Contains(stderr, "-json") || !strings.Contains(stderr, "-store") {
			t.Fatalf("unexpected help stdout=%q stderr=%q", stdout, stderr)
		}
	})
	t.Run("version", func(t *testing.T) {
		stdout, stderr, err := run("--store", missingStore, "--version")
		if err != nil || stderr != "" {
			t.Fatalf("version: %v, stderr=%q", err, stderr)
		}
		machine, stderr, err := run("--store", missingStore, "--version", "--json")
		if err != nil || stderr != "" {
			t.Fatalf("JSON version: %v, stderr=%q", err, stderr)
		}
		var v versionInfo
		if err := json.Unmarshal([]byte(machine), &v); err != nil {
			t.Fatalf("decode version: %v\n%s", err, machine)
		}
		if v.SchemaVersion != 1 || v.Kind != "version" || v.Version == "" || v.Commit == "" || v.Go == "" {
			t.Fatalf("incomplete version: %+v", v)
		}
		var expected bytes.Buffer
		if err := writeVersionInfo(&expected, v, false); err != nil {
			t.Fatal(err)
		}
		if stdout != expected.String() {
			t.Fatalf("human output = %q, want %q", stdout, expected.String())
		}
		reordered, stderr, err := run("--json", "--version")
		if err != nil || stderr != "" || reordered != machine {
			t.Fatalf("reordered flags: stdout=%q stderr=%q err=%v", reordered, stderr, err)
		}
	})
	t.Run("json requires version", func(t *testing.T) {
		stdout, stderr, err := run("--json", "--store", missingStore)
		if err == nil || stdout != "" || stderr != "git-ticket-canvas: --json requires --version\n" {
			t.Fatalf("standalone JSON: stdout=%q stderr=%q err=%v", stdout, stderr, err)
		}
	})
}
