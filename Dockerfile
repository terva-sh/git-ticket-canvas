# Build context must be an unpacked, verified Linux amd64 release archive.
FROM docker.io/library/alpine:3.22
RUN apk add --no-cache ca-certificates git tzdata \
    && addgroup -g 10001 canvas \
    && adduser -D -u 10001 -G canvas canvas \
    && mkdir /repo && chown canvas:canvas /repo
COPY git-ticket-canvas git-ticket-canvas-server /usr/local/bin/
COPY LICENSE THIRD_PARTY_LICENSES README-release.md /usr/share/doc/git-ticket-canvas/
USER 10001:10001
WORKDIR /repo
EXPOSE 7777
# The desk canvas is the default because the image's job is showing you your own
# repository, and the served canvas would refuse to start with no identity
# provider configured. A process inside a container has to bind 0.0.0.0 to be
# reachable through a published port at all, and it cannot see whether the host
# mapped that port to a loopback address, so the override says out loud what the
# operator is taking on. Keep the host side on 127.0.0.1, or run
# git-ticket-canvas-server instead:
#   docker run ... --entrypoint git-ticket-canvas-server IMAGE --issuer ... --client-id ...
ENTRYPOINT ["/usr/local/bin/git-ticket-canvas"]
CMD ["-store", "/repo", "-addr", "0.0.0.0:7777", "-read-only", "-unsafe-publish-without-authentication"]
