"""Publish verified artifacts as a draft, then expose the complete release."""
import json
import os
from pathlib import Path
import urllib.parse
import urllib.request
import uuid
import importlib.util
import sys

sys.dont_write_bytecode = True


def main():
    token = os.environ.get("TOKEN", "")
    if not token:
        raise RuntimeError("BOT_TOKEN is required for Forgejo publishing")
    tag, repo, server = (os.environ[key] for key in ("TAG", "REPO", "SERVER"))
    spec = importlib.util.spec_from_file_location("verify_release", "scripts/verify-release.py")
    verifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verifier)
    verifier.verify("dist", tag)
    api = server.rstrip("/") + "/api/v1/repos/" + repo

    def request(method, path, data, content_type="application/json"):
        req = urllib.request.Request(api + path, data=data, method=method,
                                     headers={"Authorization": "token " + token, "Content-Type": content_type})
        with urllib.request.urlopen(req, timeout=120) as response:
            return json.load(response)

    notes = Path("dist/CHANGELOG.md").read_text() if Path("dist/CHANGELOG.md").exists() else ""
    payload = {"tag_name": tag, "name": tag, "body": notes, "draft": True, "prerelease": "-" in tag}
    release = request("POST", "/releases", json.dumps(payload).encode())
    ident = release["id"]
    files = [Path("dist") / name for name in verifier.checksums(Path("dist/checksums.txt"))]
    files.append(Path("dist/checksums.txt"))
    for path in files:
        boundary = uuid.uuid4().hex
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="attachment"; filename="{path.name}"\r\n'
                'Content-Type: application/octet-stream\r\n\r\n').encode()
        body += path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
        request("POST", f"/releases/{ident}/assets?name=" + urllib.parse.quote(path.name),
                body, "multipart/form-data; boundary=" + boundary)
        print("uploaded", path.name)
    request("PATCH", f"/releases/{ident}", json.dumps({"draft": False}).encode())
    print(f"Published {tag} with {len(files)} verified assets.")


if __name__ == "__main__":
    main()
