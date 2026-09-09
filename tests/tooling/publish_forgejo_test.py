import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("publisher", "scripts/publish-forgejo.py")
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class PublisherTests(unittest.TestCase):
    def exercise(self, failure=None):
        calls = []
        with tempfile.TemporaryDirectory() as temp:
            before = os.getcwd()
            os.chdir(temp)
            try:
                Path("dist").mkdir()
                names = [f"archive-{n}.tar.gz" for n in range(5)]
                for name in names + ["checksums.txt"]:
                    Path("dist", name).write_bytes(b"fixture")
                verifier = SimpleNamespace(verify=Mock(), checksums=lambda _: dict.fromkeys(names))
                if failure == "verify":
                    verifier.verify.side_effect = RuntimeError("verification failed")
                loader = SimpleNamespace(exec_module=lambda _: None)
                def request(req, **kwargs):
                    calls.append(req)
                    verifier.verify.assert_called_once_with("dist", "v1.2.3")
                    if failure == "upload" and "/assets?" in req.full_url:
                        raise RuntimeError("upload failed")
                    return io.BytesIO(json.dumps({"id": 42}).encode())
                with patch.dict(os.environ, {"TOKEN": "fixture-token", "TAG": "v1.2.3", "REPO": "owner/repo", "SERVER": "https://forge.example"}), \
                     patch.object(p.importlib.util, "spec_from_file_location", return_value=SimpleNamespace(loader=loader)), \
                     patch.object(p.importlib.util, "module_from_spec", return_value=verifier), \
                     patch.object(p.urllib.request, "urlopen", side_effect=request):
                    if failure:
                        with self.assertRaises(RuntimeError):
                            p.main()
                    else:
                        p.main()
            finally:
                os.chdir(before)
        return calls

    def test_six_assets_upload_to_draft_before_publication(self):
        calls = self.exercise()
        self.assertEqual(len(calls), 8)
        self.assertTrue(json.loads(calls[0].data)["draft"])
        self.assertEqual(sum("/assets?" in call.full_url for call in calls), 6)
        self.assertEqual(calls[-1].method, "PATCH")
        self.assertFalse(json.loads(calls[-1].data)["draft"])

    def test_failed_upload_never_exposes_release(self):
        calls = self.exercise("upload")
        self.assertFalse(any(call.method == "PATCH" for call in calls))

    def test_failed_verification_makes_no_api_calls(self):
        self.assertEqual(self.exercise("verify"), [])

    def test_missing_token_fails_before_network(self):
        with patch.dict(os.environ, {"TOKEN": ""}), patch.object(p.urllib.request, "urlopen") as network:
            with self.assertRaisesRegex(RuntimeError, "BOT_TOKEN"):
                p.main()
            network.assert_not_called()


if __name__ == "__main__":
    unittest.main()
