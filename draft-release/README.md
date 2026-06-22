# Draft Release Action

A composite GitHub Action that automatically calculates the next [SemVer](https://semver.org/) version from the repository's latest tag and creates (or updates) a GitHub draft release. Designed to be triggered on every push to `main`/`master` so that a new draft is always ready for human review before publishing.

## Features

- Auto-increments patch version by default (`1.0.0` → `1.0.1`)
- Supports manual major/minor bump override for breaking changes
- Bootstrap-safe: creates `1.0.0` (configurable) when no prior tags exist
- Creates a **draft** release by default — a human publishes it when ready
- Idempotent: updates an existing draft rather than creating duplicates
- Auto-generates release notes from commit history when no custom notes are provided
- Exposes version and release URL as outputs for downstream workflow steps

## Usage

### Basic Usage (auto-patch on every push to main)

```yaml
name: Draft Release

on:
  push:
    branches: [ main ]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # required — full history is needed to find tags

      - name: Draft release
        uses: hmcts/cnp-githubactions-library/draft-release@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Manual Major / Minor Bump via `workflow_dispatch`

```yaml
name: Draft Release

on:
  push:
    branches: [ main ]
  workflow_dispatch:
    inputs:
      bump-type:
        description: 'Version bump type'
        required: false
        default: 'patch'
        type: choice
        options: [ patch, minor, major ]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Draft release
        uses: hmcts/cnp-githubactions-library/draft-release@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          bump-type: ${{ inputs.bump-type || 'patch' }}
```

### Chaining — use the version in a subsequent step

```yaml
      - name: Draft release
        id: release
        uses: hmcts/cnp-githubactions-library/draft-release@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Print release info
        run: |
          echo "New version : ${{ steps.release.outputs.version }}"
          echo "Tag         : ${{ steps.release.outputs.tag }}"
          echo "Release URL : ${{ steps.release.outputs.release-url }}"
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token with `contents:write` permission | **Yes** | — |
| `bump-type` | Version component to increment: `patch`, `minor`, or `major` | No | `patch` |
| `tag-prefix` | Prefix prepended to the version tag (e.g. `v` → `v1.2.3`) | No | `v` |
| `initial-version` | Version to create when the repository has no prior tags | No | `1.0.0` |
| `draft` | Create as a draft release (`true`) or publish immediately (`false`) | No | `true` |
| `prerelease` | Mark the release as a pre-release | No | `false` |
| `release-notes` | Custom release notes body. Leave blank to auto-generate from commits | No | _(auto-generated)_ |

## Outputs

| Output | Description | Example |
|--------|-------------|---------|
| `version` | New SemVer version without prefix | `1.0.1` |
| `tag` | Full tag name including prefix | `v1.0.1` |
| `release-url` | HTML URL of the draft release | `https://github.com/org/repo/releases/tag/v1.0.1` |
| `release-id` | Numeric database ID of the release | `123456789` |

## Permissions

The calling job must have `contents: write`:

```yaml
jobs:
  release:
    permissions:
      contents: write
```

## SemVer Convention

This action follows [Semantic Versioning 2.0.0](https://semver.org/):

| Bump type | When to use | Example |
|-----------|-------------|---------|
| `patch` | Bug fixes, minor improvements — backwards compatible | `1.0.0` → `1.0.1` |
| `minor` | New features — backwards compatible | `1.0.1` → `1.1.0` |
| `major` | Breaking changes | `1.1.0` → `2.0.0` |

The recommended workflow is to let every merge to `main` auto-draft a `patch` release. For `minor` and `major` bumps, trigger a manual `workflow_dispatch` run with the appropriate `bump-type`.

## Bootstrap Behaviour

When a repository has no existing version tags the action creates the `initial-version` (default `1.0.0`) as the first draft release without needing any prior tag history.

## Notes

- The action requires a **full Git history** (`fetch-depth: 0`) to correctly sort and identify the latest tag.
- A draft release is **not** a Git tag until it is published. GitHub creates the tag at publish time.
- Re-running the action with the same calculated tag updates the existing draft rather than creating a duplicate.
