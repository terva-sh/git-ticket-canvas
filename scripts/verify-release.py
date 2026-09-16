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
# Both commands ship in every archive: the desk canvas, and the served canvas
# that requires an identity provider.
COMMANDS = ("git-ticket-canvas", "git-ticket-canvas-server")
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


def refuse_unauthenticated(desk, server):
    """The split is the product, so a release that lost it must not ship.

    The desk canvas has no authentication, so it must refuse an address anybody
    can reach. The served canvas authenticates every request, so it must refuse
    to start with nothing to authenticate against. Both refusals are checked
    against the built artifact rather than the source, because a build that
    silently swapped the two entrypoints would pass every Go test.
    """
    refused = subprocess.run([str(desk), "-addr", "0.0.0.0:0", "-store", "."],
                             capture_output=True, text=True, timeout=30)
    check(refused.returncode != 0 and "git-ticket-canvas-server" in refused.stderr,
          f"the desk command accepted a non-loopback address: {refused.stderr}")
    refused = subprocess.run([str(server), "-addr", "127.0.0.1:0", "-store", "."],
                             capture_output=True, text=True, timeout=30)
    check(refused.returncode != 0 and "identity provider" in refused.stderr,
          f"the served command started with no identity provider: {refused.stderr}")


def verify(directory, tag=None, *, published=False, expected_commit=None):
    directory = Path(directory)
    if published:
        check(tag is not None and expected_commit is not None,
              "published verification requires --tag and --commit")
        check(re.fullmatch(r"[0-9a-f]{40}", expected_commit), "expected commit must be a full SHA-1")
    else:
        check(expected_commit is None, "--commit requires --published")
    if tag:
        check(re.fullmatch(r"v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", tag), "invalid release tag")
    # Published releases contain only archives and checksums, not build metadata.
    # Never infer the expected identity from the downloaded artifacts themselves.
    version = tag[1:] if published else json.loads((directory / "metadata.json").read_text())["version"]
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if published:
        check(commit == expected_commit, "checkout differs from expected commit")
    if tag:
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
        native, native_server = None, None
        for name, target in expected.items():
            path = directory / name
            check(hashlib.sha256(path.read_bytes()).hexdigest() == sums[name], f"checksum mismatch: {name}")
            files = archive_files(path)
            suffix = ".exe" if target.startswith("windows") else ""
            names = {command: command + suffix for command in COMMANDS}
            check(set(files) == DOCS | set(names.values()), f"unexpected archive contents: {name}")
            for doc in DOCS:
                check(files[doc] == Path(doc).read_bytes(), f"archive documentation differs: {doc}")
            # One directory per target, so a binary's own name survives and the
            # two commands do not have to be told apart by a mangled filename.
            unpacked = root / target
            unpacked.mkdir(exist_ok=True)
            for command, binary_name in names.items():
                binary = unpacked / binary_name
                binary.write_bytes(files[binary_name])
                binary.chmod(0o755)
                info = subprocess.check_output(["go", "version", "-m", str(binary)], text=True)
                check("github.com/terva-sh/git-ticket-canvas" in info, f"wrong module: {name}/{binary_name}")
                check(f"vcs.revision={commit}" in info, f"wrong build commit: {name}/{binary_name}")
                goos, goarch = target.split("_")
                check(f"GOOS={goos}" in info and f"GOARCH={goarch}" in info,
                      f"wrong build target: {name}/{binary_name}")
                if tag:
                    check(f"\tmod\tgithub.com/terva-sh/git-ticket-canvas\t{tag}\t" in info,
                          f"wrong build version: {name}/{binary_name}")
                    check("vcs.modified=false" in info, f"dirty release artifact: {name}/{binary_name}")
                if target == "linux_amd64":
                    if command == "git-ticket-canvas":
                        native = binary
                    else:
                        native_server = binary
        got = json.loads(subprocess.check_output([str(native), "--version", "--json"], text=True))
        check(got["commit"] == commit, "native version reports wrong commit")
        if tag:
            check(got["version"] == tag and got["modified"] is False, "native release provenance mismatch")
        served = json.loads(subprocess.check_output([str(native_server), "--version", "--json"], text=True))
        check(served == got, "the two commands report different builds")
        refuse_unauthenticated(native, native_server)
        smoke(native, root)
    print(f"Verified five archives with both commands, checksums, licenses, provenance, "
          f"the unauthenticated-bind refusals and embedded HTTP assets for {version}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dist", default="dist")
    parser.add_argument("--tag", help="Require exact clean release provenance; omit only for snapshots")
    parser.add_argument("--published", action="store_true",
                        help="Verify downloaded assets without build metadata; run from the tagged checkout")
    parser.add_argument("--commit", help="Expected full commit SHA; required with --published")
    args = parser.parse_args()
    verify(args.dist, args.tag, published=args.published, expected_commit=args.commit)
