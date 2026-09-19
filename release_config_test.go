package main

import (
	"os"
	"regexp"
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
	// Asset download routes cannot publish. Exempt only that route, not the
	// entire step: a later API release creation/upload must still be caught.
	// Other release endpoints remain conservative publication signals.
	return strings.Contains(step.Run, "gh release create") ||
		strings.Contains(step.Run, "publish-forgejo") ||
		strings.Contains(strings.ReplaceAll(step.Run, "/releases/download/", "/download/"), "/releases")
}

func TestPublishes(t *testing.T) {
	for _, tc := range []struct {
		name string
		step workflowStep
		want bool
	}{
		{"asset download", workflowStep{Run: "curl -fL https://forge/org/repo/releases/download/v1/tool.tar.gz"}, false},
		{"multiple downloads", workflowStep{Run: "curl https://forge/org/repo/releases/download/v1/tool.tar.gz\ncurl https://forge/org/repo/releases/download/v1/checksums.txt"}, false},
		{"GitHub CLI download", workflowStep{Run: "gh release download v1"}, false},
		{"GitHub CLI publish", workflowStep{Run: "gh release create v1"}, true},
		{"Forgejo publish script", workflowStep{Run: "just publish-forgejo"}, true},
		{"API create", workflowStep{Run: "curl -X POST https://forge/api/v1/repos/org/repo/releases"}, true},
		{"API upload", workflowStep{Run: "curl --data-binary @tool.tar.gz https://forge/api/v1/repos/org/repo/releases/123/assets"}, true},
		{"download then API create", workflowStep{Run: "curl https://forge/org/repo/releases/download/v1/tool.tar.gz\ncurl -X POST https://forge/api/v1/repos/org/repo/releases"}, true},
		{"API upload then download", workflowStep{Run: "curl --data-binary @tool.tar.gz https://forge/api/v1/repos/org/repo/releases/123/assets\ncurl https://forge/org/repo/releases/download/v1/checksums.txt"}, true},
		{"download then CLI publish", workflowStep{Run: "curl https://forge/org/repo/releases/download/v1/tool.tar.gz; gh release create v1"}, true},
		{"GoReleaser publish", workflowStep{Uses: "goreleaser/goreleaser-action@v7", With: map[string]string{"args": "release --clean"}}, true},
		{"GoReleaser build", workflowStep{Uses: "goreleaser/goreleaser-action@v7", With: map[string]string{"args": "release --clean --skip=publish"}}, false},
		{"GoReleaser snapshot", workflowStep{Uses: "goreleaser/goreleaser-action@v7", With: map[string]string{"args": "release --snapshot"}}, false},
		{"GoReleaser check", workflowStep{Uses: "goreleaser/goreleaser-action@v7", With: map[string]string{"args": "check"}}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := publishes(tc.step); got != tc.want {
				t.Fatalf("publishes = %v, want %v", got, tc.want)
			}
		})
	}
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

// The CLI the workflows install for `just tickets-check` has to be the version
// go.mod requires.
//
// `check --strict` validates a store against the rules the binary knows, so a
// CLI older than the library is a weaker gate than the code it guards: a rule
// added between the two versions is a rule CI does not enforce, and a store
// defect that a developer's own CLI reports would pass on a hosted runner. The
// pin sat at v0.14.3 for four days after go.mod moved to v0.18.1, which is what
// this catches.
func TestWorkflowsInstallTheGitTicketGoModRequires(t *testing.T) {
	mod, err := os.ReadFile("go.mod")
	if err != nil {
		t.Fatal(err)
	}
	// Line by line rather than one regexp over the file. A Windows checkout
	// has CRLF endings, \s covers \r, and $ matches only before \n, so an
	// anchored pattern finds nothing there and reports a missing requirement
	// that is present. That is how this test first failed.
	want := ""
	for _, line := range strings.Split(string(mod), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && fields[0] == "github.com/terva-sh/git-ticket" {
			want = fields[1]
			break
		}
	}
	if want == "" {
		t.Fatal("go.mod does not require github.com/terva-sh/git-ticket")
	}
	pinned := regexp.MustCompile(`git-ticket/cmd/git-ticket@(v\S+)`)
	installs := 0
	for _, path := range workflowFiles(t) {
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		for _, match := range pinned.FindAllSubmatch(body, -1) {
			installs++
			if got := string(match[1]); got != want {
				t.Errorf("%s installs git-ticket %s; go.mod requires %s", path, got, want)
			}
		}
	}
	// Zero would pass the loop above while meaning the store check cannot run
	// at all, so it is its own failure rather than a silent success.
	if installs == 0 {
		t.Error("no workflow installs the git-ticket CLI, so tickets-check cannot run")
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
			ID           string `yaml:"id"`
			Main         string `yaml:"main"`
			Binary       string `yaml:"binary"`
			Goos, Goarch []string
			Ldflags      []string
			Ignore       []struct{ Goos, Goarch string }
		}
		Archives []struct {
			IDs []string `yaml:"ids"`
		} `yaml:"archives"`
	}
	if err := yaml.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	if !config.Release.Disable {
		t.Fatal("expected publishing disabled")
	}
	// Two commands, and the release ships both. A release with only the desk
	// canvas in it leaves anybody who wants to publish one with nothing to run,
	// and the split is what makes "does this canvas authenticate" answerable
	// from the name of the binary.
	wanted := map[string]string{
		"git-ticket-canvas":        ".",
		"git-ticket-canvas-server": "./cmd/git-ticket-canvas-server",
	}
	if len(config.Builds) != len(wanted) {
		t.Fatalf("builds = %d, want one for each of %v", len(config.Builds), wanted)
	}
	for _, build := range config.Builds {
		main, known := wanted[build.ID]
		if !known {
			t.Errorf("unexpected build %q", build.ID)
			continue
		}
		if build.Main != main || build.Binary != build.ID {
			t.Errorf("build %q builds %q as %q, want %q as %q", build.ID, build.Main, build.Binary, main, build.ID)
		}
		if len(build.Goos)*len(build.Goarch)-len(build.Ignore) != 5 {
			t.Errorf("build %q: expected five platform targets", build.ID)
		}
		if strings.Contains(strings.Join(build.Ldflags, " "), "-X") {
			t.Errorf("build %q: version must come from build metadata, not linker variables", build.ID)
		}
	}
	// One archive per platform holding both commands, rather than one archive
	// per command. Somebody who downloaded the canvas has the server too, and
	// finds it when they need it rather than after looking for it.
	if len(config.Archives) != 1 {
		t.Fatalf("archives = %d, want one carrying both commands", len(config.Archives))
	}
	shipped := strings.Join(config.Archives[0].IDs, ",")
	if shipped != "git-ticket-canvas,git-ticket-canvas-server" {
		t.Errorf("the archive ships %q, want both commands", shipped)
	}
	for _, path := range []string{"LICENSE", "THIRD_PARTY_LICENSES", "README-release.md"} {
		if data, err := os.ReadFile(path); err != nil || len(data) < 100 {
			t.Errorf("missing archive document %s", path)
		}
	}
}
