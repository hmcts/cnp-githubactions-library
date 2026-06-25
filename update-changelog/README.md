# Update Changelog Action

A composite GitHub Action that automatically prepends a new version section to `CHANGELOG.md` and commits it back to the branch. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Designed to pair with [Release Drafter](https://github.com/release-drafter/release-drafter) — pass its `resolved_version` and `tag_name` outputs straight in.

## Features

- Creates `CHANGELOG.md` from scratch if it doesn't exist (bootstrap-safe)
- Fetches release notes from the GitHub draft release automatically — no manual copy-paste
- Prepends entries in newest-first order following [Keep a Changelog](https://keepachangelog.com) convention
- Appends `[skip ci]` to the commit message to prevent recursive workflow runs
- Idempotent — skips the commit if the changelog is already up to date
- Exposes `committed` output so downstream steps can react if no commit was made

## Usage

### With Release Drafter (recommended)

The simplest setup: copy [`.github/workflows/release-drafter.yml`](../.github/workflows/release-drafter.yml) to your repo. It calls this action automatically on every merge to `main`.

To call the action directly from your own workflow:

```yaml
jobs:
  changelog:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Update changelog
        uses: hmcts/cnp-githubactions-library/update-changelog@main
        with:
          github-token: ${{ github.token }}
          version: ${{ steps.drafter.outputs.resolved_version }}
          tag: ${{ steps.drafter.outputs.tag_name }}
```

### With custom release notes

```yaml
      - name: Update changelog
        uses: hmcts/cnp-githubactions-library/update-changelog@main
        with:
          github-token: ${{ github.token }}
          version: ${{ steps.release.outputs.version }}
          tag: ${{ steps.release.outputs.tag }}
          release-notes: |
            ### Added
            - New feature X
            ### Fixed
            - Bug fix Y
```

### Custom changelog path or commit message

```yaml
      - name: Update changelog
        uses: hmcts/cnp-githubactions-library/update-changelog@main
        with:
          github-token: ${{ github.token }}
          version: ${{ steps.release.outputs.version }}
          tag: ${{ steps.release.outputs.tag }}
          changelog-path: docs/CHANGELOG.md
          commit-message: 'chore: changelog for {version}'
```

### Reacting to the committed output

```yaml
      - name: Update changelog
        id: changelog
        uses: hmcts/cnp-githubactions-library/update-changelog@main
        with:
          github-token: ${{ github.token }}
          version: ${{ steps.release.outputs.version }}
          tag: ${{ steps.release.outputs.tag }}

      - name: Notify if no changes
        if: steps.changelog.outputs.committed == 'false'
        run: echo "Changelog was already up to date — no commit made."
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token with `contents:write` permission | **Yes** | — |
| `version` | SemVer version without prefix (e.g. `1.0.1`) | **Yes** | — |
| `tag` | Full tag including prefix (e.g. `v1.0.1`) | **Yes** | — |
| `changelog-path` | Path to the changelog file | No | `CHANGELOG.md` |
| `release-notes` | Custom notes body. Leave blank to auto-fetch from the draft release | No | _(auto-fetched)_ |
| `git-user-name` | Git commit author name | No | `github-actions[bot]` |
| `git-user-email` | Git commit author email | No | `github-actions[bot]@users.noreply.github.com` |
| `commit-message` | Commit message template. Use `{version}` as a placeholder | No | `docs: update CHANGELOG for {version} [skip ci]` |

## Outputs

| Output | Description | Example |
|--------|-------------|---------|
| `changelog-path` | Path to the updated changelog file | `CHANGELOG.md` |
| `committed` | Whether a commit was pushed (`true`/`false`) | `true` |

## Permissions

The calling job must have `contents: write`:

```yaml
jobs:
  release:
    permissions:
      contents: write
```

## Release Notes Resolution

The action resolves notes in this priority order:

1. **`release-notes` input** — if provided, used as-is
2. **GitHub draft release body** — fetched via `gh release view <tag>` for the tag passed in
3. **Empty string** — if neither source has content, an empty notes section is written

## Changelog Format

Generated entries follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) structure:

```markdown
# Changelog

All notable changes to this project will be documented in this file.



## [1.0.1] - 2026-06-22

- fix: correct null pointer in config loader
- chore: bump dependencies

## [1.0.0] - 2026-06-01

Initial release.
```

## Known Limitations

- **Recursive workflow runs** — the changelog commit uses `[skip ci]` in the message to prevent the push triggering another run. If your branch protection rules require status checks that `[skip ci]` skips, you may need to adjust the `commit-message` input.
- **Draft release tag** — the `gh release view` lookup queries the release object by tag name, not the git tag. GitHub creates the git tag when a draft is *published*, not when it is created. The auto-fetch step therefore relies on the draft release existing in GitHub (which `draft-release` creates), not on a git tag being present locally.
