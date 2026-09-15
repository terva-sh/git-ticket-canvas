package main

import (
	"os"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

type workflowStep struct {
	Name string            `yaml:"name"`
	Uses string            `yaml:"uses"`
	Run  string            `yaml:"run"`
	With map[string]string `yaml:"with"`
}

type workflow struct {
	Permissions struct {
		Contents string `yaml:"contents"`
	} `yaml:"permissions"`
	Jobs map[string]struct {
		If    string         `yaml:"if"`
		Needs string         `yaml:"needs"`
		Steps []workflowStep `yaml:"steps"`
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

// publisher is the only workflow allowed to create a release. Publication is
// GitHub's because install.sh, the ghcr.io image, and the Go module proxy all
// resolve against public infrastructure, which an internal forge cannot serve.
const publisher = ".github/workflows/release.yml"

// workflowFiles is every workflow in the tree, on either forge.
func workflowFiles(t *testing.T) []string {
	t.Helper()
	var paths []string
	for _, dir := range []string{".github/workflows", ".forgejo/workflows"} {
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatal(err)
		}
		for _, entry := range entries {
			paths = append(paths, dir+"/"+entry.Name())
		}
	}
	return paths
}

func readWorkflow(t *testing.T, path string) workflow {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var w workflow
	if err := yaml.Unmarshal(data, &w); err != nil {
		t.Fatal(err)
	}
	return w
}

// publishes reports whether a step uploads a release artifact anywhere.
//
// Only a real GoReleaser release run counts. `check` validates configuration
// and a snapshot carries development provenance, so neither can publish, but a
// release run that loses --skip=publish can, and that is what this catches.
func publishes(step workflowStep) bool {
	if strings.Contains(step.Uses, "goreleaser") {
		args := step.With["args"]
		return strings.HasPrefix(args, "release") &&
			!strings.Contains(args, "--snapshot") &&
			!strings.Contains(args, "--skip=publish")
	}
	return strings.Contains(step.Run, "gh release create") ||
		strings.Contains(step.Run, "publish-forgejo") ||
		strings.Contains(step.Run, "/releases")
}

// One forge publishes a tag. Two forges publishing produced two artifact sets
// per tag built by different Go patch versions, so "the v0.2.0 binary" named
// two different files, and the installer read only one of the forges.
func TestExactlyOneWorkflowPublishes(t *testing.T) {
	for _, path := range workflowFiles(t) {
		found := false
		for _, job := range readWorkflow(t, path).Jobs {
			for _, step := range job.Steps {
				if publishes(step) {
					found = true
				}
			}
		}
		if found && path != publisher {
			t.Errorf("%s publishes a release; only %s may", path, publisher)
		}
		if !found && path == publisher {
			t.Errorf("%s no longer publishes a release", path)
		}
	}
}

func TestPublicReleaseGatesPublication(t *testing.T) {
	w := readWorkflow(t, publisher)
	job, ok := w.Jobs["release"]
	if !ok {
		t.Fatalf("%s lacks release job", publisher)
	}
	for name, job := range w.Jobs {
		if job.If != "github.server_url == 'https://github.com'" {
			t.Errorf("%s job %s can run on the wrong forge", publisher, name)
		}
	}
	if job.Needs != "windows" {
		t.Error("public release must wait for Windows checks")
	}
	parity, build, verify, publish := -1, -1, -1, -1
	imageCheck, imagePush := -1, -1
	for i, step := range job.Steps {
		if strings.Contains(step.Run, "just parity-check") {
			parity = i
		}
		if strings.Contains(step.Uses, "goreleaser") {
			build = i
		}
		if strings.Contains(step.Run, "scripts/verify-release.py --tag") {
			verify = i
		}
		if publishes(step) {
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
		t.Errorf("%s must run parity, build, verify, publish in order", publisher)
	}
	if imagePush >= 0 && !(imageCheck >= 0 && imageCheck < publish && publish < imagePush) {
		t.Error("image must pass serving checks before release and image publication")
	}
}

// The internal tag lane stopped publishing but not checking. It is where a tag
// that cannot be built on the internal runner still fails loudly.
func TestInternalTagLaneStillVerifies(t *testing.T) {
	const path = ".forgejo/workflows/tag-verify.yml"
	w := readWorkflow(t, path)
	if w.Permissions.Contents != "read" {
		t.Errorf("%s holds contents: %q; a lane that never publishes needs read",
			path, w.Permissions.Contents)
	}
	job, ok := w.Jobs["verify"]
	if !ok {
		t.Fatalf("%s lacks verify job", path)
	}
	parity, build, verify := -1, -1, -1
	for i, step := range job.Steps {
		if strings.Contains(step.Run, "just parity-check") {
			parity = i
		}
		if strings.Contains(step.Uses, "goreleaser") {
			build = i
		}
		if strings.Contains(step.Run, "scripts/verify-release.py --tag") {
			verify = i
		}
	}
	if !(parity >= 0 && parity < build && build < verify) {
		t.Errorf("%s must run parity, build, and verify in order", path)
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
