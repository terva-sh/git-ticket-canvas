# Verify published release downloads

This supplements `docs/releasing.md`. Its prepublication verifier command uses
GoReleaser's local `metadata.json`, which is not shipped in releases. For downloaded
archives, use the repaired verifier's explicit published mode instead.

Run from a checkout of the release commit containing its annotated tag. Pass the
repaired script by absolute path if that release predates this repair:

```sh
python3 /path/to/current/scripts/verify-release.py \
  --published --tag v0.1.0 \
  --commit a1ee5a5e02aa7b30bd12a5640c1ada9fba3a100f \
  --dist /path/to/downloaded-assets
```

The download directory needs exactly the five expected archives and their
`checksums.txt`. No fabricated metadata is needed. The expected version comes
from the supplied tag, not from downloaded metadata. The full expected commit
must match checkout HEAD and the tag. Documentation and embedded HTTP assets
are compared with that checkout; use a clean release checkout, not current main.

Both modes retain checksum, archive contents, license/document, target,
commit/version, clean provenance, native version JSON and HTTP checks. Build
mode still requires `metadata.json`; `--commit` without `--published` is refused.

During the first v0.1.0 publication, Forgejo published successfully but downloaded
verification stopped on the missing build-only file. The repaired mode verified
the existing six Forgejo downloads without modifying the release or its tag.
The regression suite runs the corruption, missing/extra archive, checksum,
notice, target, dirty-build and commit cases in both modes. Published-mode tests
also cover explicit identity requirements, wrong checkout/tag and binary version.
