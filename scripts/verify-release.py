"""Verify archives before upload; execute the native Linux artifact against a test store."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import selectors
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import zipfile

TARGETS = {"linux_amd64": "tar.gz", "linux_arm64": "tar.gz", "darwin_amd64": "tar.gz",
           "darwin_arm64": "tar.gz", "windows_amd64": "zip"}
DOCS = {"LICENSE", "THIRD_PARTY_LICENSES", "README-release.md"}


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def archive_files(path):
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            check(len(names) == len(set(names)), f"duplicate archive entries: {path}")
            return {name: archive.read(name) for name in names if not name.endswith("/")}
    with tarfile.open(path) as archive:
        members = archive.getmembers()
        names = [member.name for member in members]
        check(len(names) == len(set(names)), f"duplicate archive entries: {path}")
        check(all(member.isfile() or member.isdir() for member in members), f"non-file archive entry: {path}")
        return {member.name: archive.extractfile(member).read() for member in members if member.isfile()}


def checksums(path):
    result = {}
    for line in path.read_text().splitlines():
        match = re.fullmatch(r"([a-f0-9]{64})  ([A-Za-z0-9_.-]+)", line)
        check(match is not None, "malformed checksum line")
        digest, name = match.groups()
        check(name not in result, f"duplicate checksum: {name}")
        result[name] = digest
    return result


def smoke(binary, root):
    helper = root / "init-store"
    subprocess.run(["go", "build", "-o", str(helper), "./tests/browser/init-store"], check=True, timeout=120)
    store = root / "store"
    store.mkdir()
    subprocess.run([str(helper), str(store)], check=True, timeout=10)
    process = subprocess.Popen([str(binary), "-store", str(store), "-addr", "127.0.0.1:0",
                                "-actor", "agent:release/verify", "-read-only"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        selector = selectors.DefaultSelector()
        selector.register(process.stderr, selectors.EVENT_READ)
        deadline, output, url = time.monotonic() + 10, b"", None
        while time.monotonic() < deadline:
            if selector.select(0.1):
                data = process.stderr.read1(4096)
                if not data:
                    break
                output += data
                match = re.search(rb"canvas (http://127\.0\.0\.1:\d+)", output)
                if match:
                    url = match.group(1).decode()
                    break
        selector.close()
        check(url, f"archive server failed to start: {output.decode(errors='replace')}")
        for path in Path("web/dist").rglob("*"):
            if path.is_file():
                route = "/" if path.name == "index.html" else "/" + path.relative_to("web/dist").as_posix()
                with urllib.request.urlopen(url + route, timeout=5) as response:
                    check(response.read() == path.read_bytes(), f"embedded asset differs: {route}")
        with urllib.request.urlopen(url + "/api/board", timeout=5) as response:
            check(isinstance(json.load(response), dict), "archive did not serve board API")
    finally:
        process.terminate()
        try:
            process.wait(timeout=6)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        process.stderr.close()


def verify(directory, tag=None):
    directory = Path(directory)
    metadata = json.loads((directory / "metadata.json").read_text())
    version = metadata["version"]
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if tag:
        check(re.fullmatch(r"v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", tag), "invalid release tag")
        check(version == tag[1:], "archive version differs from tag")
        check(subprocess.check_output(["git", "rev-parse", f"{tag}^{{commit}}"], text=True).strip() == commit,
              "tag does not point to HEAD")
    expected = {f"git-ticket-canvas_{version}_{target}.{ext}": target for target, ext in TARGETS.items()}
    sums = checksums(directory / "checksums.txt")
    check(set(sums) == set(expected), "checksum manifest must name exactly five target archives")
    actual = {p.name for p in directory.iterdir() if p.name.endswith((".tar.gz", ".zip"))}
    check(actual == set(expected), "missing or extra release archives")
    with tempfile.TemporaryDirectory(prefix="canvas-release-verify-") as temp:
        root = Path(temp)
        native = None
        for name, target in expected.items():
            path = directory / name
            check(hashlib.sha256(path.read_bytes()).hexdigest() == sums[name], f"checksum mismatch: {name}")
            files = archive_files(path)
            binary_name = "git-ticket-canvas.exe" if target.startswith("windows") else "git-ticket-canvas"
            check(set(files) == DOCS | {binary_name}, f"unexpected archive contents: {name}")
            for doc in DOCS:
                check(files[doc] == Path(doc).read_bytes(), f"archive documentation differs: {doc}")
            binary = root / (target + (".exe" if target.startswith("windows") else ""))
            binary.write_bytes(files[binary_name])
            binary.chmod(0o755)
            info = subprocess.check_output(["go", "version", "-m", str(binary)], text=True)
            check("github.com/terva-sh/git-ticket-canvas" in info, f"wrong module: {name}")
            check(f"vcs.revision={commit}" in info, f"wrong build commit: {name}")
            goos, goarch = target.split("_")
            check(f"GOOS={goos}" in info and f"GOARCH={goarch}" in info, f"wrong build target: {name}")
            if tag:
                check(f"\tmod\tgithub.com/terva-sh/git-ticket-canvas\t{tag}\t" in info,
                      f"wrong build version: {name}")
                check("vcs.modified=false" in info, f"dirty release artifact: {name}")
            if target == "linux_amd64":
                native = binary
        got = json.loads(subprocess.check_output([str(native), "--version", "--json"], text=True))
        check(got["commit"] == commit, "native version reports wrong commit")
        if tag:
            check(got["version"] == tag and got["modified"] is False, "native release provenance mismatch")
        smoke(native, root)
    print(f"Verified five archives, checksums, licenses, provenance and embedded HTTP assets for {version}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dist", default="dist")
    parser.add_argument("--tag", help="Require exact clean release provenance; omit only for snapshots")
    args = parser.parse_args()
    verify(args.dist, args.tag)
