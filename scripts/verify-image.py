"""Exercise repository mounts and application write policy on a local image."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


def main(image, engine):
    def run(*args):
        return subprocess.check_output([engine, *args], text=True, timeout=120).strip()

    version = json.loads(run("run", "--rm", image, "--version", "--json"))
    if version["kind"] != "version":
        raise RuntimeError("image version output missing")
    config = json.loads(run("image", "inspect", image))[0]["Config"]
    if config["User"] in ("", "root", "0", "0:0") or "-read-only" not in config["Cmd"]:
        raise RuntimeError("image must default to non-root and read-only")
    # A container has to bind 0.0.0.0 to be reachable, and cannot see whether the
    # host mapped that port to a loopback address. The desk canvas refuses the
    # address unless the override says out loud what is being taken on, so an
    # image whose command lost it does not start at all.
    if "-unsafe-publish-without-authentication" not in config["Cmd"]:
        raise RuntimeError("image command must name the unauthenticated-bind override")
    # The served canvas ships in the image too, and refuses to start with no
    # identity provider. That refusal is the image's evidence that the binary is
    # the server rather than a second copy of the desk canvas.
    refused = subprocess.run([engine, "run", "--rm", "--entrypoint", "git-ticket-canvas-server", image,
                              "-store", "/repo"], capture_output=True, text=True, timeout=120)
    if refused.returncode == 0 or "identity provider" not in refused.stderr:
        raise RuntimeError(f"image server command started with no identity provider: {refused.stderr}")
    with tempfile.TemporaryDirectory(prefix="canvas-image-test-") as temp:
        root = Path(temp)
        helper, store = root / "init-store", root / "repo"
        store.mkdir()
        subprocess.run(["go", "build", "-o", str(helper), "./tests/browser/init-store"], check=True, timeout=120)
        subprocess.run([str(helper), str(store)], check=True, timeout=10)
        subprocess.run(["git", "init", "-q", str(store)], check=True, timeout=10)
        for writable in (False, True):
            before = {str(p.relative_to(store)): p.read_bytes() for p in store.rglob("*") if p.is_file()}
            args = ["run", "-d", "--rm", "--user", f"{os.getuid()}:{os.getgid()}"]
            if engine == "podman":
                args += ["--userns=keep-id"]
            mount = f"type=bind,src={store},dst=/repo" + ("" if writable else ",readonly")
            args += ["-p", "127.0.0.1::7777", "--mount", mount, image]
            if writable:
                args += ["-store", "/repo", "-addr", "0.0.0.0:7777", "-actor", "agent:release/image-test",
                         "-unsafe-publish-without-authentication"]
            ident = run(*args)
            try:
                binding = run("port", ident, "7777/tcp").splitlines()[0]
                url = "http://" + binding
                for attempt in range(50):
                    try:
                        with urllib.request.urlopen(url, timeout=2) as response:
                            if b"git-ticket canvas" not in response.read():
                                raise RuntimeError("image did not serve frontend")
                        break
                    except (OSError, urllib.error.URLError):
                        if attempt == 49:
                            raise
                        time.sleep(0.1)
                request = urllib.request.Request(url + "/api/tickets", data=b'{"title":"Image smoke ticket"}',
                                                 headers={"Content-Type": "application/json"})
                try:
                    with urllib.request.urlopen(request, timeout=5) as response:
                        status = response.status
                except urllib.error.HTTPError as error:
                    status = error.code
                if status != (201 if writable else 403):
                    raise RuntimeError(f"unexpected image mutation status: {status}")
                after = {str(p.relative_to(store)): p.read_bytes() for p in store.rglob("*") if p.is_file()}
                if not writable and before != after:
                    raise RuntimeError("read-only container changed the repository")
                if writable and not any(b"Image smoke ticket" in body for body in after.values()):
                    raise RuntimeError("writable container did not persist to mounted store")
            finally:
                subprocess.run([engine, "rm", "-f", ident], check=False, stdout=subprocess.DEVNULL, timeout=30)
    print("Image verified: both commands, non-root/read-only defaults, the unauthenticated-bind override, "
          "local repository serving, 403 refusal and explicit write persistence.")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "docker")
