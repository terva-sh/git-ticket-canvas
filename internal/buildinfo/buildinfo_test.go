package buildinfo

import (
	"runtime"
	"runtime/debug"
	"testing"
)

func TestParse(t *testing.T) {
	defaults := Info{SchemaVersion: 1, Kind: "version", Version: "devel", Commit: "unknown", Go: runtime.Version()}
	for _, tt := range []struct {
		name string
		info *debug.BuildInfo
		want Info
	}{
		{name: "missing metadata", want: defaults},
		{name: "empty metadata", info: &debug.BuildInfo{}, want: defaults},
		{name: "development module", info: &debug.BuildInfo{Main: debug.Module{Version: "(devel)"}}, want: defaults},
		{
			name: "release",
			info: &debug.BuildInfo{
				GoVersion: "go1.25.0", Main: debug.Module{Version: "v1.2.3"},
				Settings: []debug.BuildSetting{{Key: "vcs.revision", Value: "0123456789abcdef"}, {Key: "vcs.modified", Value: "false"}},
			},
			want: Info{SchemaVersion: 1, Kind: "version", Version: "v1.2.3", Commit: "0123456789abcdef", Go: "go1.25.0"},
		},
		{
			name: "dirty release",
			info: &debug.BuildInfo{
				GoVersion: "go1.25.1", Main: debug.Module{Version: "v1.2.3+dirty"},
				Settings: []debug.BuildSetting{{Key: "vcs.modified", Value: "true"}, {Key: "vcs.revision", Value: "abcdef"}},
			},
			want: Info{SchemaVersion: 1, Kind: "version", Version: "v1.2.3", Commit: "abcdef", Go: "go1.25.1", Modified: true},
		},
		{
			name: "pseudo version",
			info: &debug.BuildInfo{Main: debug.Module{Version: "v0.0.0-20260909000000-0123456789ab+dirty"}, Settings: []debug.BuildSetting{{Key: "vcs.modified", Value: "true"}}},
			want: Info{SchemaVersion: 1, Kind: "version", Version: "v0.0.0-20260909000000-0123456789ab", Commit: "unknown", Go: runtime.Version(), Modified: true},
		},
		{
			name: "ignore unrelated and empty settings",
			info: &debug.BuildInfo{Settings: []debug.BuildSetting{{Key: "vcs.revision", Value: ""}, {Key: "vcs.modified", Value: "invalid"}, {Key: "GOARCH", Value: "arm64"}}},
			want: defaults,
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := Parse(tt.info); got != tt.want {
				t.Fatalf("Parse() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestReadNeverReturnsZero(t *testing.T) {
	got := Read()
	if got.IsZero() || got.SchemaVersion != 1 || got.Kind != "version" || got.Version == "" || got.Commit == "" || got.Go == "" {
		t.Fatalf("Read() = %+v, want a complete identity", got)
	}
}

func TestIsZero(t *testing.T) {
	if !(Info{}).IsZero() {
		t.Fatal("empty Info should be zero")
	}
	if Parse(nil).IsZero() {
		t.Fatal("fallback Info should not be zero")
	}
}
