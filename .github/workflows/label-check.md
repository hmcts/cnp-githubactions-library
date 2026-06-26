# PR Label Check Reusable Workflow

Reusable workflow that enforces release labels on every pull request. Two stages run automatically:

1. **Auto-label** — reads the PR title's [Conventional Commits](https://www.conventionalcommits.org/) prefix (`feat:`, `fix:`, `chore:`, etc.) and applies the matching release label
2. **Validate** — confirms at least one recognised release label exists; posts a clear PR comment with fix instructions if not

**Workflow file:** `.github/workflows/label-check.yaml`

## Why this matters

[Release Drafter](https://github.com/release-drafter/release-drafter) uses PR labels to:

- **Determine the next version** — `breaking-change` → major, `enhancement` → minor, everything else → patch
- **Categorise changes** in the release notes body

Without a label, Release Drafter defaults to a patch bump and the PR appears under no section in the release notes.

## Usage

Create `.github/workflows/pr-label-check.yaml` in your repo:

```yaml
on:
  pull_request:
    types: [opened, edited, synchronize, labeled, unlabeled]

jobs:
  label-check:
    uses: hmcts/cnp-githubactions-library/.github/workflows/label-check.yaml@main
    permissions:
      pull-requests: write
```

That's it — no inputs required. The PR context (`title`, `number`, `repository`) is passed through automatically from the calling workflow's `pull_request` event.

## Label Mapping

### Auto-applied from PR title prefix

| PR title prefix | Label applied | Version bump |
|-----------------|--------------|--------------|
| `feat:` / `feat(scope):` | `enhancement` | minor `1.0.0 → 1.1.0` |
| `fix:` / `fix(scope):` | `bug` | patch `1.0.0 → 1.0.1` |
| `chore:` / `chore(scope):` | `chore` | patch `1.0.0 → 1.0.1` |
| `docs:` / `docs(scope):` | `documentation` | patch `1.0.0 → 1.0.1` |
| `deps:` / `build:` (and scoped variants) | `dependencies` | patch `1.0.0 → 1.0.1` |

### Manually applied labels

| Label | Version bump | When to use |
|-------|-------------|-------------|
| `breaking-change` | major `1.0.0 → 2.0.0` | API changes, removals, breaking behaviour |
| `skip-changelog` | no bump | Commits excluded from release notes entirely |

> ⚠️ **Breaking changes cannot be auto-detected from the PR title.** Add the `breaking-change` label manually to any PR that introduces a breaking change.

## What happens when a label is missing

If no valid label is found after auto-labelling, the workflow:

1. Posts a PR comment explaining exactly why the check failed
2. Distinguishes between two failure modes:
   - **Wrong title format** — shows the correct prefix table and examples
   - **Correct title but label not applied** — suggests pushing an empty commit to retrigger, or adding a label manually
3. Exits with a non-zero status — blocks merge if required by branch protection rules

The check re-runs automatically whenever the PR title is updated or a label is added.

## Required labels to create in your repo

Three labels must be created manually — the remaining four are GitHub defaults:

```bash
gh label create "breaking-change" --color "#e11d48" --description "Introduces a breaking change" --repo owner/repo
gh label create "chore" --color "#6b7280" --description "Maintenance or refactoring" --repo owner/repo
gh label create "skip-changelog" --color "#94a3b8" --description "Excluded from release notes" --repo owner/repo
```

Labels available by default on every GitHub repository:

| Label | Version bump |
|-------|-------------|
| `enhancement` | minor |
| `bug` | patch |
| `dependencies` | patch |
| `documentation` | patch |

## PR title examples

```
feat: add RBAC support for key vaults          → enhancement (minor bump)
fix: correct token expiry handling             → bug (patch bump)
chore: update terraform module version        → chore (patch bump)
docs: update deployment guide                 → documentation (patch bump)
deps: bump actions/checkout to v4             → dependencies (patch bump)
feat(auth): add OpenID Connect support        → enhancement (minor bump)
fix(api): handle null response from upstream  → bug (patch bump)
```

For breaking changes, use any conventional prefix and add the `breaking-change` label manually:

```
feat!: remove deprecated API endpoints   + add breaking-change label manually
```
