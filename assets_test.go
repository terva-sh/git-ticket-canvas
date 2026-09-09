package main

import (
	"io/fs"
	"regexp"
	"strings"
	"testing"
)

func TestEmbeddedFrontendContainsOnlyBuiltAssets(t *testing.T) {
	err := fs.WalkDir(webFS, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() && (!strings.HasPrefix(path, "web/dist/") ||
			strings.HasSuffix(path, ".ts") || strings.HasSuffix(path, ".tsx") ||
			strings.HasSuffix(path, ".map") || strings.Contains(path, "node_modules")) {
			t.Errorf("unexpected embedded source: %s", path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	assets, err := fs.Sub(webFS, "web/dist")
	if err != nil {
		t.Fatal(err)
	}
	html, err := fs.ReadFile(assets, "index.html")
	if err != nil {
		t.Fatal(err)
	}
	refs := regexp.MustCompile(`(?:src|href)="([^"]+)"`).FindAllSubmatch(html, -1)
	if len(refs) == 0 {
		t.Fatal("embedded HTML has no asset references")
	}
	for _, ref := range refs {
		path := string(ref[1])
		if !strings.HasPrefix(path, "./assets/") {
			t.Errorf("asset is not a local built asset: %s", path)
			continue
		}
		data, err := fs.ReadFile(assets, strings.TrimPrefix(path, "./"))
		if err != nil || len(data) == 0 {
			t.Errorf("missing or empty embedded asset %s: %v", path, err)
		}
	}
}
