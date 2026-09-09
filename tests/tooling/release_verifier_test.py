import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("verifier", "scripts/verify-release.py")
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


class VerifierTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "metadata.json").write_text(json.dumps({"version": "1.2.3"}))
        self.names = []
        for target, ext in v.TARGETS.items():
            name = f"git-ticket-canvas_1.2.3_{target}.{ext}"
            self.names.append(name)
            files = {doc: Path(doc).read_bytes() for doc in v.DOCS}
            files["git-ticket-canvas.exe" if ext == "zip" else "git-ticket-canvas"] = b"binary"
            if ext == "zip":
                with zipfile.ZipFile(self.root / name, "w") as archive:
                    for path, data in files.items():
                        archive.writestr(path, data)
            else:
                with tarfile.open(self.root / name, "w:gz") as archive:
                    for path, data in files.items():
                        entry = tarfile.TarInfo(path)
                        entry.size = len(data)
                        archive.addfile(entry, io.BytesIO(data))
        self.manifest()

    def manifest(self):
        (self.root / "checksums.txt").write_text("".join(
            hashlib.sha256((self.root / name).read_bytes()).hexdigest() + "  " + name + "\n" for name in self.names))

    def commands(self, args, **kwargs):
        if args[:2] == ["git", "rev-parse"]:
            return "a" * 40 + "\n"
        if args[:3] == ["go", "version", "-m"]:
            goos, goarch = Path(args[3]).stem.split("_")
            return "\tmod\tgithub.com/terva-sh/git-ticket-canvas\tv1.2.3\t\n\tbuild\tvcs.revision=" + "a" * 40 + f"\n\tbuild\tvcs.modified=false\n\tbuild\tGOOS={goos}\n\tbuild\tGOARCH={goarch}\n"
        return json.dumps({"commit": "a" * 40, "version": "v1.2.3", "modified": False})

    def verify(self):
        with patch.object(v.subprocess, "check_output", side_effect=self.commands), patch.object(v, "smoke") as smoke:
            v.verify(self.root, "v1.2.3")
            smoke.assert_called_once()

    def test_valid_release_reaches_smoke(self):
        self.verify()

    def test_changed_archive_fails(self):
        (self.root / self.names[0]).write_bytes(b"changed")
        with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
            self.verify()

    def test_missing_archive_fails(self):
        (self.root / self.names[0]).unlink()
        with self.assertRaisesRegex(RuntimeError, "missing or extra"):
            self.verify()

    def test_extra_archive_fails(self):
        (self.root / "extra.zip").write_bytes(b"extra")
        with self.assertRaisesRegex(RuntimeError, "missing or extra"):
            self.verify()

    def test_duplicate_checksum_fails(self):
        path = self.root / "checksums.txt"
        path.write_text(path.read_text() * 2)
        with self.assertRaisesRegex(RuntimeError, "duplicate checksum"):
            self.verify()

    def test_malformed_checksum_fails(self):
        (self.root / "checksums.txt").write_text("invalid\n")
        with self.assertRaisesRegex(RuntimeError, "malformed checksum"):
            self.verify()

    def test_missing_notice_fails_after_valid_checksum(self):
        name = next(name for name in self.names if name.endswith(".zip"))
        with zipfile.ZipFile(self.root / name, "w") as archive:
            archive.writestr("git-ticket-canvas.exe", b"binary")
        self.manifest()
        with self.assertRaisesRegex(RuntimeError, "unexpected archive contents"):
            self.verify()

    def test_wrong_version_fails(self):
        (self.root / "metadata.json").write_text('{"version":"9.9.9"}')
        with self.assertRaisesRegex(RuntimeError, "differs from tag"):
            self.verify()

    def test_dirty_build_fails(self):
        original = self.commands
        self.commands = lambda *args, **kwargs: original(*args, **kwargs).replace("vcs.modified=false", "vcs.modified=true")
        with self.assertRaisesRegex(RuntimeError, "dirty release"):
            self.verify()

    def test_wrong_target_fails(self):
        original = self.commands
        self.commands = lambda *args, **kwargs: original(*args, **kwargs).replace("GOOS=linux", "GOOS=windows")
        with self.assertRaisesRegex(RuntimeError, "wrong build target"):
            self.verify()

    def test_wrong_commit_fails(self):
        original = self.commands
        self.commands = lambda *args, **kwargs: original(*args, **kwargs).replace("vcs.revision=" + "a" * 40, "vcs.revision=" + "b" * 40)
        with self.assertRaisesRegex(RuntimeError, "wrong build commit"):
            self.verify()


if __name__ == "__main__":
    unittest.main()
