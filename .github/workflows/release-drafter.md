# Release Drafter Workflow

Example workflow that combines [Release Drafter](https://github.com/release-drafter/release-drafter) with the [`update-changelog`](./update-changelog.md) reusable workflow. Copy this into your repo to get automatic draft releases and changelog updates on every merge to `main`.

**Workflow template:** `.github/workflows/release-drafter.yml`

## What it does

On every push to `main` (and optionally on `workflow_dispatch`):

1. **Draft job** — Release Drafter scans all merged PRs since the last published release tag, determines the next version from PR labels, and creates or updates a draft release in GitHub Releases
2. **Changelog job** — Calls the `update-changelog` action to prepend the new version section to `CHANGELOG.md` and push a commit back to `main`

## Setup

### Step 1 — Copy the workflow

Copy [`.github/workflows/release-drafter.yml`](../.github/workflows/release-drafter.yml) to your repo at `.github/workflows/release-drafter.yml`.

### Step 2 — Copy the Release Drafter config

Create `.github/release-drafter.yml` in your repo with the following content. This configures the label → version mapping and release note categories that Release Drafter uses to determine the next version and group PRs in the release body.

```yaml
name-template: 'v$RESOLVED_VERSION'
tag-template: 'v$RESOLVED_VERSION'

# Version bump rules — highest-priority label on any merged PR wins.
version-resolver:
  major:
    labels:
      - breaking-change
  minor:
    labels:
      - enhancement
  patch:
    labels:
      - bug
      - dependencies
      - documentation
      - chore
  default: patch

# Release note sections — order controls order in the release body.
categories:
  - title: ':boom: Breaking Changes'
    labels:
      - breaking-change
  - title: ':rocket: Features'
    labels:
      - enhancement
  - title: ':bug: Bug Fixes'
    labels:
      - bug
  - title: ':package: Dependency Updates'
    labels:
      - dependencies
  - title: ':books: Documentation'
    labels:
      - documentation
  - title: ':wrench: Maintenance'
    labels:
      - chore

# PRs with this label are omitted from release notes entirely.
exclude-labels:
  - skip-changelog

change-template: '- $TITLE @$AUTHOR (#$NUMBER)'
change-title-escapes: '\<*_&'
template: |
  $CHANGES
```

### Step 3 — Create required labels

```bash
gh label create "breaking-change" --color "#e11d48" --description "Introduces a breaking change" --repo owner/repo
gh label create "chore" --color "#6b7280" --description "Maintenance or refactoring" --repo owner/repo
gh label create "skip-changelog" --color "#94a3b8" --description "Excluded from release notes" --repo owner/repo
```

### Step 4 — Add PR label enforcement (recommended)

Add the [label-check workflow](./label-check.md) to ensure every PR has a label before it can be merged.

## Version Bump Rules

The next version is determined by the **highest-priority label** across all merged PRs since the last published release tag:

| Label | Bump | Example |
|-------|------|---------|
| `breaking-change` | major | `1.2.3 → 2.0.0` |
| `enhancement` | minor | `1.2.3 → 1.3.0` |
| `bug`, `dependencies`, `documentation`, `chore` | patch | `1.2.3 → 1.2.4` |
| _(unlabelled / default)_ | patch | `1.2.3 → 1.2.4` |

PRs labelled `skip-changelog` are excluded from release notes entirely and do not affect versioning.

## Release Note Categories

| Label | Section in release notes |
|-------|--------------------------|
| `breaking-change` | 💥 Breaking Changes |
| `enhancement` | 🚀 Features |
| `bug` | 🐛 Bug Fixes |
| `dependencies` | 📦 Dependency Updates |
| `documentation` | 📚 Documentation |
| `chore` | 🔧 Maintenance |

## Publishing a Release

The workflow creates a **draft** release — it is not published automatically. To publish:

1. Go to **Releases** in your GitHub repository
2. Review and edit the draft release notes if needed
3. Click **Edit** → **Publish release**

Publishing creates the git tag. This resets Release Drafter's PR scan window — only PRs merged *after* this tag will appear in the next draft.

## Changelog Output

After each merge to `main`, `CHANGELOG.md` will contain an entry like:

```markdown
## [1.3.0] - 2026-06-25

🚀 Features

- Add RBAC support for key vaults @author (#42)

🐛 Bug Fixes

- Fix token expiry handling @author (#41)
```

Entries are prepended on every merge, so the changelog always reflects the current draft — not just published releases.

## Notes

- The changelog commit uses `[skip ci]` to prevent triggering another Release Drafter run on the same push
- If you need the changelog commit to trigger downstream workflows, pass a Personal Access Token as `github-token` to the `update-changelog` action (the default `GITHUB_TOKEN` cannot trigger new workflow runs by design)
- Release Drafter reads its config from `.github/release-drafter.yml` in the repository where it runs — ensure this file is present in your repo
