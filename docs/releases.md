# Releases

Versioning is automated by [semantic-release](https://github.com/semantic-release/semantic-release) from [Conventional Commits](https://www.conventionalcommits.org/). **Every push to `main` that contains a qualifying commit cuts a new release immediately** — no PRs, no manual approval step.

## Commit conventions

The prefix on each commit decides the bump. See [`docs/committing.md`](committing.md) for the full table and examples.

Short version:
- `feat:` → minor bump
- `fix:` / `perf:` / `refactor:` → patch bump
- `feat!:` or `BREAKING CHANGE:` footer → major bump
- `chore:` / `docs:` / `test:` / `ci:` → no release

## What happens on push

1. The `test` job runs `bun test` + `bunx tsc --noEmit`. Fails here stop the pipeline.
2. The `release` job runs semantic-release. It inspects commits since the last git tag:
   - If no qualifying commits → exits silently, nothing else runs.
   - If qualifying commits → picks the version bump, creates the git tag (e.g. `v0.2.0`), and publishes a GitHub Release with auto-generated notes grouped by type.
3. On a successful release, `publish-docker` and `publish-binaries` run in parallel:
   - **Docker**: multi-arch image pushed to `ghcr.io/orkwitzel/wandering-trader-mcp:X.Y.Z` and `:latest` (linux/amd64 + linux/arm64).
   - **Binaries**: Bun-compiled standalones for linux-x64, linux-arm64, darwin-x64, darwin-arm64, windows-x64 attached to the GitHub Release.

## Forcing a version

To cut a release at a specific version regardless of commit history, append a `Release-As:` footer to an empty commit:

```bash
git commit --allow-empty -m "chore: release 1.0.0" -m "Release-As: 1.0.0"
git push
```

*(Requires adding the `@semantic-release/exec` plugin if this ends up being a common need — current config doesn't support it out of the box. For a one-off, manually tag and push instead: `git tag v1.0.0 && git push --tags`.)*

## Artifacts produced on release

- **Docker image** on GHCR at `ghcr.io/orkwitzel/wandering-trader-mcp:X.Y.Z` and `:latest` (linux/amd64 + linux/arm64).
- **Standalone binaries** attached to the GitHub Release, one per platform:
  - `wandering-trader-linux-x64`
  - `wandering-trader-linux-arm64`
  - `wandering-trader-darwin-x64`
  - `wandering-trader-darwin-arm64`
  - `wandering-trader-windows-x64.exe`

All binaries are Bun-compiled (`bun build --compile --minify`), fully self-contained, ~90 MB each.
