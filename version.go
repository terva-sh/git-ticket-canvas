package main

import (
	"encoding/json"
	"fmt"
	"io"
	"runtime"
	"runtime/debug"
	"strings"
)

// versionInfo is the standalone CLI version response, not a canvas API DTO.
type versionInfo struct {
	SchemaVersion int    `json:"schemaVersion"`
	Kind          string `json:"kind"`
	Version       string `json:"version"`
	Commit        string `json:"commit"`
	Go            string `json:"go"`
	Modified      bool   `json:"modified"`
}

// parseBuildVersion follows the metadata conventions in git-ticket/cli/version.go.
// The Go toolchain supplies these values; no link-time version stamping is needed.
func parseBuildVersion(info *debug.BuildInfo) versionInfo {
	result := versionInfo{
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

func writeVersion(w io.Writer, asJSON bool) error {
	info, _ := debug.ReadBuildInfo()
	return parseBuildVersion(info).write(w, asJSON)
}

func (v versionInfo) write(w io.Writer, asJSON bool) error {
	if asJSON {
		return json.NewEncoder(w).Encode(v)
	}
	commit := v.Commit
	if len(commit) > 12 {
		commit = commit[:12]
	}
	suffix := ""
	if v.Modified {
		suffix = ", modified"
	}
	_, err := fmt.Fprintf(w, "git-ticket-canvas %s (%s, %s%s)\n", v.Version, commit, v.Go, suffix)
	return err
}
