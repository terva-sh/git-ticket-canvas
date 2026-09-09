package main

import (
	"os"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

type workflow struct {
	Jobs map[string]struct {
		If    string `yaml:"if"`
		Needs string `yaml:"needs"`
		Steps []struct {
			Name string            `yaml:"name"`
			Uses string            `yaml:"uses"`
			Run  string            `yaml:"run"`
			With map[string]string `yaml:"with"`
		} `yaml:"steps"`
	} `yaml:"jobs"`
}

// These action majors declare runs.using: node24 upstream. Keep this offline
// allowlist in sync when reviewing action upgrades; it does not query GitHub.
func TestGitHubActionVersions(t *testing.T) {
	versions := map[string]string{
		"actions/checkout":             "v7",
		"actions/setup-go":             "v7",
		"actions/setup-node":           "v7",
		"goreleaser/goreleaser-action": "v7",
		"docker/login-action":          "v4",
	}
	for _, path := range []string{".github/workflows/ci.yml", ".github/workflows/release.yml"} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var w workflow
		if err := yaml.Unmarshal(data, &w); err != nil {
			t.Fatal(err)
		}
		for name, job := range w.Jobs {
			for _, step := range job.Steps {
				if step.Uses == "" {
					continue
				}
				action, version, ok := strings.Cut(step.Uses, "@")
				want, reviewed := versions[action]
				if !ok || !reviewed || version != want {
					t.Errorf("%s job %s: action %q needs Node.js 24 runtime review", path, name, step.Uses)
				}
			}
		}
	}
}

func TestReleaseWorkflowsGatePublication(t *testing.T) {
	for _, path := range []string{".forgejo/workflows/release.yml", ".github/workflows/release.yml"} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var w workflow
		if err := yaml.Unmarshal(data, &w); err != nil {
			t.Fatal(err)
		}
		job, ok := w.Jobs["release"]
		if !ok {
			t.Fatalf("%s lacks release job", path)
		}
		if strings.HasPrefix(path, ".github") {
			for name, job := range w.Jobs {
				if job.If != "github.server_url == 'https://github.com'" {
					t.Errorf("%s job %s can run on the wrong forge", path, name)
				}
			}
			if job.Needs != "windows" {
				t.Error("public release must wait for Windows checks")
			}
		}
		parity, build, verify, publish := -1, -1, -1, -1
		imageCheck, imagePush := -1, -1
		for i, step := range job.Steps {
			if strings.Contains(step.Run, "just parity-check") {
				parity = i
			}
			if strings.Contains(step.Uses, "goreleaser") {
				build = i
				if !strings.Contains(step.With["args"], "--skip=publish") {
					t.Error("GoReleaser must not publish before verification")
				}
			}
			if strings.Contains(step.Run, "scripts/verify-release.py --tag") {
				verify = i
			}
			if strings.Contains(step.Run, "gh release create") || strings.Contains(step.Run, "scripts/publish-forgejo.py") {
				publish = i
			}
			if strings.Contains(step.Run, "scripts/verify-image.py") {
				imageCheck = i
			}
			if strings.Contains(step.Run, "docker push") {
				imagePush = i
			}
		}
		if !(parity >= 0 && parity < build && build < verify && verify < publish) {
			t.Errorf("%s must run parity, build, verify, publish in order", path)
		}
		if imagePush >= 0 && !(imageCheck >= 0 && imageCheck < publish && publish < imagePush) {
			t.Error("image must pass serving checks before release and image publication")
		}
	}
}

func TestReleaseConfigAndNotices(t *testing.T) {
	data, err := os.ReadFile(".goreleaser.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var config struct {
		Release struct{ Disable bool } `yaml:"release"`
		Builds  []struct {
			Goos, Goarch []string
			Ldflags      []string
			Ignore       []struct{ Goos, Goarch string }
		}
	}
	if err := yaml.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	if !config.Release.Disable || len(config.Builds) != 1 {
		t.Fatal("expected one build and publishing disabled")
	}
	build := config.Builds[0]
	if len(build.Goos)*len(build.Goarch)-len(build.Ignore) != 5 {
		t.Error("expected five platform archives")
	}
	if strings.Contains(strings.Join(build.Ldflags, " "), "-X") {
		t.Error("version must come from build metadata, not linker variables")
	}
	for _, path := range []string{"LICENSE", "THIRD_PARTY_LICENSES", "README-release.md"} {
		if data, err := os.ReadFile(path); err != nil || len(data) < 100 {
			t.Errorf("missing archive document %s", path)
		}
	}
}
