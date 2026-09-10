// Package buildinfo derives the running executable's identity from the Go
// toolchain's embedded build metadata. The CLI --version output and the
// canvas API share it, so both report the same version, commit, and
// modified state by construction.
package buildinfo

import (
	"runtime"
	"runtime/debug"
	"strings"
)

// Info is the build identity of the running executable. Its JSON form is the
// CLI --version --json envelope, and GET /api/version answers with the same
// shape.
type Info struct {
	SchemaVersion int    `json:"schemaVersion"`
	Kind          string `json:"kind"`
	Version       string `json:"version"`
	Commit        string `json:"commit"`
	Go            string `json:"go"`
	Modified      bool   `json:"modified"`
}

// Parse follows the metadata conventions in git-ticket/cli/version.go. The Go
// toolchain supplies these values; no link-time version stamping is needed.
// Missing metadata yields the honest fallbacks: version "devel" and commit
// "unknown".
func Parse(info *debug.BuildInfo) Info {
	result := Info{
		SchemaVersion: 1,
		Kind:          "version",
		Version:       "devel",
		Commit:        "unknown",
		Go:            runtime.Version(),
	}
	if info == nil {
		return result
	}
	if info.GoVersion != "" {
		result.Go = info.GoVersion
	}
	if info.Main.Version != "" && info.Main.Version != "(devel)" {
		result.Version = strings.TrimSuffix(info.Main.Version, "+dirty")
	}
	for _, setting := range info.Settings {
		switch setting.Key {
		case "vcs.revision":
			if setting.Value != "" {
				result.Commit = setting.Value
			}
		case "vcs.modified":
			result.Modified = setting.Value == "true"
		}
	}
	return result
}

// Read parses the metadata embedded in the running executable.
func Read() Info {
	info, _ := debug.ReadBuildInfo()
	return Parse(info)
}

// IsZero reports whether i carries no identity at all, as a Server built
// without Options.Version does. Such a value must never reach a client, so
// callers replace it with Parse(nil).
func (i Info) IsZero() bool { return i == Info{} }
