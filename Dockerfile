# Build context must be an unpacked, verified Linux amd64 release archive.
FROM docker.io/library/alpine:3.22
RUN apk add --no-cache ca-certificates git tzdata \
    && addgroup -g 10001 canvas \
    && adduser -D -u 10001 -G canvas canvas \
    && mkdir /repo && chown canvas:canvas /repo
COPY git-ticket-canvas /usr/local/bin/git-ticket-canvas
COPY LICENSE THIRD_PARTY_LICENSES README-release.md /usr/share/doc/git-ticket-canvas/
USER 10001:10001
WORKDIR /repo
EXPOSE 7777
ENTRYPOINT ["/usr/local/bin/git-ticket-canvas"]
CMD ["-store", "/repo", "-addr", "0.0.0.0:7777", "-read-only"]
