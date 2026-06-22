# Update Changelog Workflow

Automatically prepend a new version section to `CHANGELOG.md` and commit it back to the branch. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Designed to run after the [draft-release workflow](./draft-release.md) — pass its outputs straight in.

**Workflow File:** `workflows/update-changelog.yaml`

## Features

- Creates `CHANGELOG.md` from scratch if it doesn't exist
- Fetches release notes from the GitHub draft release automatically
- Falls back to `git log` if the release has no notes yet
- Entries are prepended in newest-first order
- Appends `[skip ci]` to the commit to prevent recursive workflow runs
- Skips the commit if the changelog is already up to date

## Example Usage

### Combined with draft-release in one workflow

```yaml
name: Release

on:
  push:
    branches: [ main ]
  workflow_dispatch:
    inputs:
      bump-type:
        type: choice
        options: [ patch, minor, major ]
        default: patch

jobs:
  draft:
    uses: hmcts/cnp-githubactions-library/workflows/draft-release.yaml@main
    with:
      bump-type: ${{ inputs.bump-type || 'patch' }}

  changelog:
    needs: draft
    uses: hmcts/cnp-githubactions-library/workflows/update-changelog.yaml@main
    with:
      version: ${{ needs.draft.outputs.version }}
      tag:     ${{ needs.draft.outputs.tag }}
```

### With a PAT for downstream workflow triggers

```yaml
  changelog:
    needs: draft
    uses: hmcts/cnp-githubactions-library/workflows/update-changelog.yaml@main
    with:
      version:      ${{ needs.draft.outputs.version }}
      tag:          ${{ needs.draft.outputs.tag }}
      github-token: ${{ secrets.MY_PAT }}
```

### Custom changelog path

```yaml
  changelog:
    needs: draft
    uses: hmcts/cnp-githubactions-library/workflows/update-changelog.yaml@main
    with:
      version:        ${{ needs.draft.outputs.version }}
      tag:            ${{ needs.draft.outputs.tag }}
      changelog-path: docs/CHANGELOG.md
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `version` | SemVer version without prefix (e.g. `1.0.1`) | **Yes** | — |
| `tag` | Full tag including prefix (e.g. `v1.0.1`) | **Yes** | — |
| `changelog-path` | Path to the changelog file | No | `CHANGELOG.md` |
| `release-notes` | Custom notes body. Leave blank to auto-fetch from the draft release | No | _(auto-fetched)_ |
| `git-user-name` | Git commit author name | No | `github-actions[bot]` |
| `git-user-email` | Git commit author email | No | `github-actions[bot]@users.noreply.github.com` |
| `commit-message` | Commit message template (`{version}` is substituted) | No | `docs: update CHANGELOG for {version}` |
| `runner` | GitHub Actions runner to use | No | `ubuntu-latest` |
| `github-token` | Override token. Use a PAT if you need the commit to trigger other workflows | No | `github.token` |

## Outputs

| Output | Description | Example |
|--------|-------------|---------|
| `changelog-path` | Path to the updated changelog file | `CHANGELOG.md` |
| `committed` | Whether a commit was pushed (`true`/`false`) | `true` |

## Permissions

The workflow declares `permissions: contents: write` internally — no extra configuration needed in the calling workflow.

## Known Limitations

- **`[skip ci]`** — appended to all changelog commits to prevent recursive runs. If branch protection requires checks that `[skip ci]` skips, adjust the `commit-message` input.
- **Downstream workflow triggers** — commits made with the default `GITHUB_TOKEN` will not trigger other workflows. Pass a PAT via `github-token` if needed.
- **`@main` pinning** — references `update-changelog@main` until the library tags its own releases.
