# Draft Release Workflow

Automatically calculate the next [SemVer](https://semver.org/) version from the repository's latest tag and create a GitHub draft release on every push to `main`.

**Workflow File:** `workflows/draft-release.yaml`

## Features

- Auto-increments patch version by default (`1.0.0` → `1.0.1`)
- Supports manual major/minor bump override for breaking changes
- Bootstrap-safe: creates `1.0.0` when no prior tags exist
- Creates a **draft** release by default — a human publishes it when ready
- Idempotent: updates an existing draft rather than creating duplicates
- Auto-generates release notes from commit history

## Example Usage

### Auto-patch on every push to main

```yaml
name: Draft Release

on:
  push:
    branches: [ main ]

jobs:
  release:
    uses: hmcts/cnp-githubactions-library/workflows/draft-release.yaml@main
```

### Allow manual major / minor bumps via workflow_dispatch

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
    uses: hmcts/cnp-githubactions-library/workflows/draft-release.yaml@main
    with:
      bump-type: ${{ inputs.bump-type || 'patch' }}
```

### Pass a PAT to trigger downstream workflows

By default the workflow uses the built-in `GITHUB_TOKEN`. Releases and tags created with `GITHUB_TOKEN` **will not trigger other workflows** (e.g. a `release: [published]` workflow in the same or a different repo) — this is a [GitHub-imposed restriction](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#using-the-github_token-in-a-workflow). If you need that, pass a PAT:

```yaml
jobs:
  release:
    uses: hmcts/cnp-githubactions-library/workflows/draft-release.yaml@main
    with:
      github-token: ${{ secrets.MY_PAT }}
```

For most teams auto-drafting patch releases, `GITHUB_TOKEN` is sufficient — the draft is published manually and the publish action can be handled separately.

### Chain on the released version in a downstream job

```yaml
jobs:
  release:
    uses: hmcts/cnp-githubactions-library/workflows/draft-release.yaml@main

  notify:
    needs: release
    runs-on: ubuntu-latest
    steps:
      - name: Print release info
        run: |
          echo "New version : ${{ needs.release.outputs.version }}"
          echo "Release URL : ${{ needs.release.outputs.release-url }}"
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | Token used to create the release. Defaults to `GITHUB_TOKEN`. Override with a PAT if you need releases to trigger other workflows (see Known Limitations) | No | `github.token` |
| `bump-type` | Version component to increment: `patch`, `minor`, or `major` | No | `patch` |
| `tag-prefix` | Prefix prepended to the version tag (e.g. `v` → `v1.2.3`) | No | `v` |
| `initial-version` | Version to create when no prior tags exist | No | `1.0.0` |
| `draft` | Create as a draft release (`true`) or publish immediately (`false`) | No | `true` |
| `prerelease` | Mark the release as a pre-release | No | `false` |
| `release-notes` | Custom release notes body. Leave blank to auto-generate from commits | No | _(auto-generated)_ |
| `runner` | GitHub Actions runner to use | No | `ubuntu-latest` |
| `checkout-repository` | Whether to checkout the repository | No | `true` |

## Outputs

| Output | Description | Example |
|--------|-------------|---------|
| `version` | New SemVer version without prefix | `1.0.1` |
| `tag` | Full tag name including prefix | `v1.0.1` |
| `release-url` | HTML URL of the draft release | `https://github.com/org/repo/releases/tag/v1.0.1` |
| `release-id` | Numeric database ID of the release | `123456789` |

## Permissions

The workflow declares `permissions: contents: write` internally — no extra configuration needed in the calling workflow.

## SemVer Convention

| Bump type | When to use | Example |
|-----------|-------------|---------|
| `patch` | Bug fixes, backwards-compatible improvements | `1.0.0` → `1.0.1` |
| `minor` | New features, backwards-compatible | `1.0.1` → `1.1.0` |
| `major` | Breaking changes | `1.1.0` → `2.0.0` |

## Known Limitations

- **Downstream workflow triggers** — Releases and tags created via the default `GITHUB_TOKEN` will not trigger `on: release` or `on: push: tags` workflows in this or other repositories. Pass a PAT via the `github-token` input if you need that behaviour.
- **`@main` pinning** — The reusable workflow currently references `draft-release@main` rather than a pinned tag. Once this library tags its own releases (dogfooding), this will be updated to a pinned version for reproducibility.
