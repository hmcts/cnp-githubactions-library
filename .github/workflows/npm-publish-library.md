# npm Publish Library Workflow

Publish packages to the HMCTS Azure Artifacts npm feed from a monorepo using [release-please](https://github.com/googleapis/release-please). On every push to the release branch the workflow either:

- **upserts a release pull request** that bumps `package.json` versions and writes CHANGELOGs from [Conventional Commits](https://www.conventionalcommits.org/) since the last release, or
- **publishes to Azure Artifacts + creates GitHub releases** when the release PR has been merged.

The mode is chosen automatically by `release-please-action@v4` based on the state of unreleased commits.

**Workflow file:** `.github/workflows/npm-publish-library.yaml`

> Publishes target the shared HMCTS `hmcts-lib` Azure Artifacts feed (the same feed Gradle artifacts publish to). Use a CFT-allocated npm scope such as `@hmcts-cft/<name>` rather than the public `@hmcts` scope on npmjs.org.

> **💡 Need more flexibility?** This reusable workflow is great when you want a stand-alone release job. If you need to interleave other steps (e.g. run tests, post Slack notifications) in the same job, use the [composite action](../../npm-publish-library/README.md) instead.

## Features

- Single workflow handles version-bumping, publishing, tagging, and GitHub release creation
- Driven by Conventional Commits — no separate `yarn changeset` step for contributors
- `secrets: inherit` plumbs the org-level `AZURE_DEVOPS_ARTIFACT_USERNAME` / `AZURE_DEVOPS_ARTIFACT_TOKEN` pair automatically
- Configurable install / build commands (yarn, npm, pnpm)
- Returns `releases_created` / `paths_released` outputs

## When to use

**Use this reusable workflow when:**

- You want "release on push to master" with minimal boilerplate
- The release lives in its own job — no other tasks need to run alongside it
- Your org provides `AZURE_DEVOPS_ARTIFACT_USERNAME` / `AZURE_DEVOPS_ARTIFACT_TOKEN` at the org level and you can use `secrets: inherit`

**Use the [composite action](../../npm-publish-library/README.md) when:**

- You want to run tests or other steps in the same job as the publish
- You need to use release-please outputs (`releases_created`, `paths_released`) to drive subsequent steps

## Example Usage

### Default — Yarn 4 monorepo, org-level secrets

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
    uses: hmcts/cnp-githubactions-library/.github/workflows/npm-publish-library.yaml@main
    with:
      npm-scope: '@hmcts-cft'
    secrets: inherit
```

That's it. The workflow assumes:

- A `.nvmrc` file at the repo root (otherwise pass `node-version`).
- A root `build` script (the default `build-command: yarn build`).
- `release-please-config.json` and `.release-please-manifest.json` at the repo root.
- `AZURE_DEVOPS_ARTIFACT_USERNAME` and `AZURE_DEVOPS_ARTIFACT_TOKEN` available at the org or repo level.

### Custom build command

```yaml
jobs:
  release:
    uses: hmcts/cnp-githubactions-library/.github/workflows/npm-publish-library.yaml@main
    with:
      build-command: 'yarn test && yarn build'
      npm-scope: '@hmcts-cft'
    secrets: inherit
```

### Reading outputs in a downstream job

```yaml
jobs:
  release:
    uses: hmcts/cnp-githubactions-library/.github/workflows/npm-publish-library.yaml@main
    with:
      npm-scope: '@hmcts-cft'
    secrets: inherit

  notify:
    needs: release
    if: needs.release.outputs.releases_created == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo "Released: ${{ needs.release.outputs.paths_released }}"
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `node-version` | Node.js version (overridden by `node-version-file` if both set) | No | (empty) |
| `node-version-file` | Path to a Node version file | No | `.nvmrc` |
| `install-command` | Command to install dependencies | No | `yarn install --immutable` |
| `build-command` | Command to build packages before publishing. Set to `":"` to skip. | No | `yarn build` |
| `release-please-config-file` | Path to the release-please config file | No | `release-please-config.json` |
| `release-please-manifest-file` | Path to the release-please manifest file | No | `.release-please-manifest.json` |
| `working-directory` | Working directory | No | `.` |
| `runner` | GitHub runner to use | No | `ubuntu-latest` |
| `azure-artifact-feed-url` | Azure Artifacts npm feed URL | No | `https://pkgs.dev.azure.com/hmcts/Artifacts/_packaging/hmcts-lib/npm/registry/` |
| `npm-scope` | Optional npm scope (e.g. `@hmcts-cft`). When set, writes `<scope>:registry=<feed>` into the runtime `.npmrc` so scoped packages route to the Azure feed even if their `package.json` is missing `publishConfig.registry`. Recommended. | No | (empty) |

## Secrets

| Secret | Description | Required |
|--------|-------------|----------|
| `AZURE_DEVOPS_ARTIFACT_USERNAME` | Username for the HMCTS Azure Artifacts feed | No (but publish will fail at runtime without it) |
| `AZURE_DEVOPS_ARTIFACT_TOKEN` | PAT with Packaging (Read & Write) on `hmcts-lib` | No (but publish will fail at runtime without it) |

Both secrets are declared optional at the `workflow_call` boundary so callers using `secrets: inherit` don't fail validation on repos that haven't configured them yet. The downstream `npm publish` will exit with an authentication error if a real publish is attempted without valid credentials, so missing-secret failures still surface — just at publish time rather than workflow-load time.

## Outputs

| Output | Description |
|--------|-------------|
| `releases_created` | `"true"` when packages were released in this run |
| `paths_released` | JSON array of repo-relative paths whose packages were released |

## Required repo / org setup

1. **`AZURE_DEVOPS_ARTIFACT_USERNAME` and `AZURE_DEVOPS_ARTIFACT_TOKEN` secrets** at the GitHub org level (`hmcts`), so any repo can use `secrets: inherit`. The PAT needs `Packaging (Read & Write)` on the `hmcts-lib` feed (these are the same secrets HMCTS Gradle publishes use).
2. **Allow Actions to open PRs** — org/repo Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests". The bot needs this to open the release PR.
3. **Per-package publishability** — every publishable `package.json` needs `name`, `version`, `files`, and `exports`/`main`. Strongly recommend `publishConfig.registry` on each package, and pass `npm-scope` to the workflow as well.
4. **`release-please-config.json` and `.release-please-manifest.json`** at the repo root. See [composite action README](../../npm-publish-library/README.md) for the shape.

## Contributor flow (consumer's side)

Once this workflow is wired into a consumer repo:

1. A contributor makes a code change to a publishable package.
2. They write a [Conventional Commit](https://www.conventionalcommits.org/) message:
   - `fix(<package>): …` for a patch
   - `feat(<package>): …` for a minor
   - `feat(<package>)!: …` or `BREAKING CHANGE:` footer for a major
3. On merge to master, this workflow upserts a release PR.
4. Merging the release PR triggers publish + GitHub release.

No separate "declare your version bump" file — the commit message is the source of truth.

## Installing the published packages

Downstream consumers add the following to their `.yarnrc.yml` so Yarn routes the `@hmcts-cft` scope to the Azure Artifacts feed and authenticates with a fresh Azure AD access token from the local `az` CLI session:

```yaml
npmScopes:
  hmcts-cft:
    npmRegistryServer: "https://pkgs.dev.azure.com/hmcts/Artifacts/_packaging/hmcts-lib/npm/registry/"
    npmAlwaysAuth: true
    npmAuthToken: "exec:az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv"
```

Then run `az login` once before `yarn install`. The `exec:` form re-runs `az` per request so the token is always fresh — no long-lived PAT to rotate, no `.npmrc` to leak.

## Notes

- The workflow runs `corepack enable` so Yarn 4 berry works out of the box.
- npm provenance attestation is npmjs.org-only and is not supported by Azure Artifacts; no `id-token: write` permission is needed.
- For monorepos with multiple publishable packages, set `separate-pull-requests: false` in `release-please-config.json` for a single combined release PR.
- If the consumer monorepo uses npm or pnpm, override `install-command` / `build-command` accordingly (e.g. `pnpm install --frozen-lockfile`).
