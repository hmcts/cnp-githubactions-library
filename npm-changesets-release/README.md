# npm Changesets Release Action

A composite GitHub Action that runs [changesets](https://github.com/changesets/changesets) to either:

- **upsert a "Version Packages" pull request** that consumes pending `.changeset/*.md` files (bumps versions, writes CHANGELOGs), or
- **publish to the HMCTS Azure Artifacts npm feed** when the Version Packages PR has been merged and versions are ahead of the registry.

Both modes share the same workflow; the action picks the right one based on the state of `.changeset/`. This is the standard changesets release pattern.

> Publishes target the shared HMCTS `hmcts-lib` Azure Artifacts feed (the same feed Gradle artifacts publish to). Use a CFT-allocated npm scope such as `@hmcts-cft/<name>` rather than the public `@hmcts` scope on npmjs.org.

## Features

- Single workflow handles both version-bumping and publishing
- Reuses the existing HMCTS `AZURE_DEVOPS_ARTIFACT_USERNAME` / `AZURE_DEVOPS_ARTIFACT_TOKEN` org-level secrets (same pair Gradle publishes use)
- Configurable install / version / publish commands (works with yarn, npm, pnpm)
- Pass-through to `changesets/action@v1` with sensible Yarn 4 defaults
- Returns `published` / `publishedPackages` / `hasChangesets` outputs for downstream steps

## Usage

### Basic — invoke from a job

```yaml
name: Release
on:
  push:
    branches: [master]

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write       # tag + commit Version Packages PR
      pull-requests: write  # open/update the PR
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: hmcts/cnp-githubactions-library/npm-changesets-release@main
        with:
          azure-artifact-username: ${{ secrets.AZURE_DEVOPS_ARTIFACT_USERNAME }}
          azure-artifact-token: ${{ secrets.AZURE_DEVOPS_ARTIFACT_TOKEN }}
```

### Custom commands (e.g. build before publish)

```yaml
- uses: hmcts/cnp-githubactions-library/npm-changesets-release@main
  with:
    azure-artifact-username: ${{ secrets.AZURE_DEVOPS_ARTIFACT_USERNAME }}
    azure-artifact-token: ${{ secrets.AZURE_DEVOPS_ARTIFACT_TOKEN }}
    version-command: 'yarn version-packages'   # e.g. "changeset version && yarn install --mode=update-lockfile"
    publish-command: 'yarn release'            # e.g. "yarn build && changeset publish"
```

### Embedded in a larger job (skip Node setup)

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: yarn

      - run: corepack enable
      - run: yarn install --immutable
      - run: yarn test                # do other things before releasing

      - uses: hmcts/cnp-githubactions-library/npm-changesets-release@main
        with:
          azure-artifact-username: ${{ secrets.AZURE_DEVOPS_ARTIFACT_USERNAME }}
          azure-artifact-token: ${{ secrets.AZURE_DEVOPS_ARTIFACT_TOKEN }}
          setup-node: 'false'
          install-command: ':'        # already installed
```

### Using outputs

```yaml
- id: release
  uses: hmcts/cnp-githubactions-library/npm-changesets-release@main
  with:
    azure-artifact-username: ${{ secrets.AZURE_DEVOPS_ARTIFACT_USERNAME }}
    azure-artifact-token: ${{ secrets.AZURE_DEVOPS_ARTIFACT_TOKEN }}

- name: Notify slack of published packages
  if: steps.release.outputs.published == 'true'
  run: |
    echo '${{ steps.release.outputs.publishedPackages }}' | jq -r '.[] | "\(.name)@\(.version)"'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `azure-artifact-username` | Username for the HMCTS Azure Artifacts feed. Optional so the parent reusable workflow can use `secrets: inherit`; if empty, npm publish will fail at runtime. Defaults to `github` when empty. | No | (empty) |
| `azure-artifact-token` | PAT for the HMCTS Azure Artifacts feed with Packaging (Read & Write) on `hmcts-lib`. Optional so the parent reusable workflow can use `secrets: inherit`; if empty, npm publish will fail at runtime. | No | (empty) |
| `azure-artifact-feed-url` | Azure Artifacts npm feed URL | No | `https://pkgs.dev.azure.com/hmcts/Artifacts/_packaging/hmcts-lib/npm/registry/` |
| `npm-scope` | Optional npm scope (e.g. `@hmcts-cft`). When set, writes `<scope>:registry=<feed>` into the runtime `.npmrc` so scoped packages route to the Azure feed even if their `package.json` is missing `publishConfig.registry`. Recommended. | No | (empty) |
| `node-version` | Node.js version (overridden by `node-version-file` if both set) | No | (empty) |
| `node-version-file` | Path to a Node version file | No | `.nvmrc` |
| `setup-node` | Whether to run `actions/setup-node`. Set `false` if Node is already configured. | No | `true` |
| `install-command` | Command to install dependencies | No | `yarn install --immutable` |
| `version-command` | Command for the version step (apply pending changesets) | No | `yarn changeset version` |
| `publish-command` | Command for the publish step | No | `yarn changeset publish` |
| `commit-message` | Commit message and PR title for the Version Packages PR | No | `chore: version packages` |
| `working-directory` | Working directory | No | `.` |

## Outputs

| Output | Description |
|--------|-------------|
| `published` | `"true"` when packages were published in this run, `"false"` otherwise |
| `publishedPackages` | JSON array of `{ name, version }` for published packages |
| `hasChangesets` | `"true"` when pending changesets exist on the current ref |

## Permissions required on the calling job

```yaml
permissions:
  contents: write       # tag + commit the Version Packages PR
  pull-requests: write  # open/update the Version Packages PR
```

## Required repo / org setup

1. **`AZURE_DEVOPS_ARTIFACT_USERNAME` and `AZURE_DEVOPS_ARTIFACT_TOKEN` secrets** — the same org-level pair HMCTS Gradle publishes consume. The PAT needs `Packaging (Read & Write)` on the `hmcts-lib` feed.
2. **Allow Actions to open PRs** — repo or org Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".
3. **Per-package publishability** — each publishable `package.json` needs `name`, `version`, `files`, and `exports`/`main`. We strongly recommend setting `publishConfig.registry` on each package (so a stray `npm publish` from a developer machine doesn't go to npmjs), but passing `npm-scope` to the action also guarantees scoped packages route to the Azure feed at CI time:
   ```json
   "publishConfig": {
     "registry": "https://pkgs.dev.azure.com/hmcts/Artifacts/_packaging/hmcts-lib/npm/registry/"
   }
   ```

## Installing published packages

Downstream consumers add a `.npmrc` that scope-routes to the feed and authenticates with a personal PAT (or the same automation PAT in CI):

```ini
@hmcts-cft:registry=https://pkgs.dev.azure.com/hmcts/Artifacts/_packaging/hmcts-lib/npm/registry/
//pkgs.dev.azure.com/hmcts/Artifacts/_packaging/hmcts-lib/npm/registry/:username=hmcts
//pkgs.dev.azure.com/hmcts/Artifacts/_packaging/hmcts-lib/npm/registry/:_password=${AZURE_DEVOPS_ARTIFACT_TOKEN_BASE64}
//pkgs.dev.azure.com/hmcts/Artifacts/_packaging/hmcts-lib/npm/registry/:email=npm@hmcts.net
```

`AZURE_DEVOPS_ARTIFACT_TOKEN_BASE64` is the base64 encoding of the PAT (`printf %s "$PAT" | base64`).

## When to use this action vs the reusable workflow

| | Composite Action | Reusable Workflow |
|---|------------------|-------------------|
| Where it runs | A step inside your job | A whole job |
| Secret plumbing | You pass `azure-artifact-username` / `azure-artifact-token` explicitly | Calling workflow can use `secrets: inherit` |
| Use when | You need to interleave other steps in the same job (e.g. run tests before publishing, post to Slack after) | You just want "publish on push to master" with minimal boilerplate |

The reusable workflow ([`.github/workflows/npm-changesets-release.yaml`](../.github/workflows/npm-changesets-release.md)) wraps this action and is the recommended entrypoint for most consumers.

## Notes

- The action runs `corepack enable` so Yarn 4 berry works out of the box. Harmless for npm/pnpm consumers.
- `changesets/action@v1` decides at runtime which mode to enter: pending `.changeset/*.md` → upsert Version Packages PR; no pending changesets but versions ahead of the feed → publish.
- For first-time consumers, run `yarn dlx @changesets/cli init` (or equivalent) to create `.changeset/config.json`.
- npm provenance attestation is npmjs.org-only and is not supported by Azure Artifacts; no `id-token: write` permission is needed.
