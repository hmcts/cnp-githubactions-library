# npm Publish Library Action

A composite GitHub Action that runs [release-please](https://github.com/googleapis/release-please) to either:

- **upsert a "release" pull request** that bumps `package.json` versions and writes CHANGELOGs from [Conventional Commits](https://www.conventionalcommits.org/) since the last release, or
- **publish to the HMCTS Azure Artifacts npm feed** when that release PR has been merged, then push tags and create GitHub releases.

Both modes share the same workflow; the action picks the right one based on whether commits since the last release warrant a bump.

> Publishes target the shared HMCTS `hmcts-lib` Azure Artifacts feed (the same feed Gradle artifacts publish to). Use a CFT-allocated npm scope such as `@hmcts-cft/<name>` rather than the public `@hmcts` scope on npmjs.org.

## Features

- Single workflow handles version-bumping, publishing, tagging, and GitHub release creation
- Driven by Conventional Commits — no separate `yarn changeset` step for contributors
- Reuses the existing HMCTS `AZURE_DEVOPS_ARTIFACT_USERNAME` / `AZURE_DEVOPS_ARTIFACT_TOKEN` org-level secrets
- Configurable install / build commands (works with yarn, npm, pnpm + Turborepo / native workspaces)
- Returns `releases_created` / `paths_released` outputs for downstream steps

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
      contents: write       # tag + commit release PR
      pull-requests: write  # open/update the PR
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: hmcts/cnp-githubactions-library/npm-publish-library@main
        with:
          azure-artifact-username: ${{ secrets.AZURE_DEVOPS_ARTIFACT_USERNAME }}
          azure-artifact-token: ${{ secrets.AZURE_DEVOPS_ARTIFACT_TOKEN }}
          npm-scope: '@hmcts-cft'
```

## Conventional Commits — the contributor flow

Contributors land a fix or feature with a Conventional Commit message — that's it. No `yarn changeset` step.

| Commit type | Bump |
|---|---|
| `fix(<scope>): …` | patch |
| `feat(<scope>): …` | minor |
| `feat(<scope>)!: …` or `BREAKING CHANGE:` footer | major |
| `chore:`, `docs:`, `refactor:`, `test:` etc | no release |

release-please matches commits to packages by the files they touch. For a clean attribution, keep one package's changes per commit; commits that span packages will be attributed to whichever package release-please's path matching resolves.

When a `fix:` or `feat:` commit lands on master:
1. release-please opens (or updates) a single **release PR** bumping the affected packages.
2. Merging that PR triggers the publish → npm push → git tag → GitHub release.

## Repo configuration

Two files at the repo root, alongside `package.json`:

### `release-please-config.json`

```jsonc
{
  "release-type": "node",
  "separate-pull-requests": false,
  "include-component-in-tag": true,
  "packages": {
    "libs/foo": { "package-name": "@hmcts-cft/foo" },
    "libs/bar": { "package-name": "@hmcts-cft/bar" }
  }
}
```

### `.release-please-manifest.json`

Seeded with current published versions. release-please updates this every release.

```json
{
  "libs/foo": "1.0.0",
  "libs/bar": "0.1.0"
}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `azure-artifact-username` | Username for the HMCTS Azure Artifacts feed. Optional so the parent reusable workflow can use `secrets: inherit`; if empty, npm publish will fail at runtime. Defaults to `github` when empty. | No | (empty) |
| `azure-artifact-token` | PAT for the HMCTS Azure Artifacts feed with Packaging (Read & Write) on `hmcts-lib`. Optional so the parent reusable workflow can use `secrets: inherit`; if empty, npm publish will fail at runtime. | No | (empty) |
| `azure-artifact-feed-url` | Azure Artifacts npm feed URL | No | `https://pkgs.dev.azure.com/hmcts/Artifacts/_packaging/hmcts-lib/npm/registry/` |
| `npm-scope` | Optional npm scope (e.g. `@hmcts-cft`). When set, writes `<scope>:registry=<feed>` into the runtime `.npmrc` so scoped packages route to the Azure feed even if their `package.json` is missing `publishConfig.registry`. Recommended. | No | (empty) |
| `release-please-token` | GitHub token release-please uses to open/merge the release PR and push tags | No | `${{ github.token }}` |
| `release-please-config-file` | Path to the release-please config file | No | `release-please-config.json` |
| `release-please-manifest-file` | Path to the release-please manifest file | No | `.release-please-manifest.json` |
| `node-version` | Node.js version (overridden by `node-version-file` if both set) | No | (empty) |
| `node-version-file` | Path to a Node version file | No | `.nvmrc` |
| `setup-node` | Whether to run `actions/setup-node`. Set `false` if Node is already configured. | No | `true` |
| `install-command` | Command to install dependencies | No | `yarn install --immutable` |
| `build-command` | Command to build packages before publishing. Set to `":"` to skip. | No | `yarn build` |

## Outputs

| Output | Description |
|--------|-------------|
| `releases_created` | `"true"` when at least one package was released in this run, `"false"` otherwise |
| `paths_released` | JSON array of repo-relative paths whose packages were released |

## Permissions required on the calling job

```yaml
permissions:
  contents: write       # tag + commit the release PR
  pull-requests: write  # open/update the release PR
```

## Required repo / org setup

1. **`AZURE_DEVOPS_ARTIFACT_USERNAME` and `AZURE_DEVOPS_ARTIFACT_TOKEN` secrets** — the same org-level pair HMCTS Gradle publishes consume. The PAT needs `Packaging (Read & Write)` on the `hmcts-lib` feed.
2. **Allow Actions to open PRs** — repo or org Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".
3. **Per-package publishability** — each publishable `package.json` needs `name`, `version`, `files`, and `exports`/`main`. Strongly recommend `publishConfig.registry` on each package (protects against stray `npm publish` from dev machines); the `npm-scope` input also guarantees scoped packages route to the Azure feed at CI time.
4. **`release-please-config.json` and `.release-please-manifest.json`** at the repo root (see Repo configuration above).

## Installing published packages

Downstream consumers add the following to their `.yarnrc.yml` so Yarn routes the `@hmcts-cft` scope to the Azure Artifacts feed and authenticates with a fresh Azure AD access token from the local `az` CLI session:

```yaml
npmScopes:
  hmcts-cft:
    npmRegistryServer: "https://pkgs.dev.azure.com/hmcts/Artifacts/_packaging/hmcts-lib/npm/registry/"
    npmAlwaysAuth: true
    npmAuthToken: "exec:az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv"
```

Then run `az login` once before `yarn install`. The `exec:` form re-runs `az` per request so the token is always fresh — no long-lived PAT to rotate, no `.npmrc` to leak. The GUID `499b84ac-1321-427f-aa17-267ca6975798` is the Azure DevOps resource ID.

## When to use this action vs the reusable workflow

| | Composite Action | Reusable Workflow |
|---|------------------|-------------------|
| Where it runs | A step inside your job | A whole job |
| Secret plumbing | You pass `azure-artifact-username` / `azure-artifact-token` explicitly | Calling workflow can use `secrets: inherit` |
| Use when | You need to interleave other steps in the same job | You just want "release on push to master" with minimal boilerplate |

The reusable workflow ([`.github/workflows/npm-publish-library.yaml`](../.github/workflows/npm-publish-library.md)) wraps this action and is the recommended entrypoint for most consumers.

## Notes

- The action runs `corepack enable` so Yarn 4 berry works out of the box. Harmless for npm/pnpm consumers.
- `release-please-action@v4` decides at runtime which mode to enter: pending Conventional Commits → upsert release PR; release PR merged → publish.
- For monorepos with multiple publishable packages, set `separate-pull-requests: false` in `release-please-config.json` for a single combined release PR (closer to changesets's behaviour).
- npm provenance attestation is npmjs.org-only and is not supported by Azure Artifacts; no `id-token: write` permission is needed.
