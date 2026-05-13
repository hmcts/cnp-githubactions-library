# npm Changesets Release Workflow

Publish packages to the HMCTS Azure Artifacts npm feed from a monorepo using [changesets](https://github.com/changesets/changesets). On every push to the release branch the workflow either:

- **upserts a "Version Packages" pull request** that consumes pending `.changeset/*.md` files (bumps versions, writes CHANGELOGs), or
- **publishes to Azure Artifacts + creates GitHub releases** when the Version Packages PR has been merged and `package.json` versions are ahead of the feed.

The mode is chosen automatically by `changesets/action@v1` based on the state of `.changeset/`.

**Workflow file:** `.github/workflows/npm-changesets-release.yaml`

> Publishes target the shared HMCTS `hmcts-lib` Azure Artifacts feed (the same feed Gradle artifacts publish to). Use a CFT-allocated npm scope such as `@hmcts-cft/<name>` rather than the public `@hmcts` scope on npmjs.org.

> **💡 Need more flexibility?** This reusable workflow is great when you want a stand-alone release job. If you need to interleave other steps (e.g. run tests, post Slack notifications) in the same job, use the [composite action](../../npm-changesets-release/README.md) instead.

## Features

- Single workflow handles both version-bumping and publishing
- `secrets: inherit` plumbs the org-level `AZURE_DEVOPS_ARTIFACT_USERNAME` / `AZURE_DEVOPS_ARTIFACT_TOKEN` pair automatically — same secrets HMCTS Gradle publishes use
- Configurable install / version / publish commands (yarn, npm, pnpm)
- Returns `published` / `publishedPackages` / `hasChangesets` outputs

## When to use

**Use this reusable workflow when:**

- You want "publish on push to master" with minimal boilerplate
- The release lives in its own job — no other tasks need to run alongside it
- Your org provides `AZURE_DEVOPS_ARTIFACT_USERNAME` / `AZURE_DEVOPS_ARTIFACT_TOKEN` at the org level and you can use `secrets: inherit`

**Use the [composite action](../../npm-changesets-release/README.md) when:**

- You want to run tests or other steps in the same job as the publish
- You need to use changesets outputs (`published`, `publishedPackages`) to drive subsequent steps

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
    uses: hmcts/cnp-githubactions-library/.github/workflows/npm-changesets-release.yaml@main
    secrets: inherit
```

That's it. The workflow assumes:

- A `.nvmrc` file at the repo root (otherwise pass `node-version`).
- Root scripts named `changeset version` and `changeset publish` (the changesets defaults).
- `AZURE_DEVOPS_ARTIFACT_USERNAME` and `AZURE_DEVOPS_ARTIFACT_TOKEN` available at the org or repo level (they are at the HMCTS org level — Gradle publishes use them).

### Custom commands — build before publish

If publishing requires building first (typical for TS monorepos), have root scripts like:

```jsonc
{
  "scripts": {
    "version-packages": "changeset version && yarn install --mode=update-lockfile",
    "release": "yarn build && changeset publish"
  }
}
```

Then point the workflow at them:

```yaml
jobs:
  release:
    uses: hmcts/cnp-githubactions-library/.github/workflows/npm-changesets-release.yaml@main
    with:
      version-command: 'yarn version-packages'
      publish-command: 'yarn release'
    secrets: inherit
```

### Explicit secret names (not using `inherit`)

```yaml
jobs:
  release:
    uses: hmcts/cnp-githubactions-library/.github/workflows/npm-changesets-release.yaml@main
    with:
      node-version-file: '.nvmrc'
    secrets:
      AZURE_DEVOPS_ARTIFACT_USERNAME: ${{ secrets.MY_FEED_USERNAME }}
      AZURE_DEVOPS_ARTIFACT_TOKEN: ${{ secrets.MY_FEED_TOKEN }}
```

### Reading outputs in a downstream job

```yaml
jobs:
  release:
    uses: hmcts/cnp-githubactions-library/.github/workflows/npm-changesets-release.yaml@main
    secrets: inherit

  notify:
    needs: release
    if: needs.release.outputs.published == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo "Published: ${{ needs.release.outputs.publishedPackages }}"
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `node-version` | Node.js version (overridden by `node-version-file` if both set) | No | (empty) |
| `node-version-file` | Path to a Node version file | No | `.nvmrc` |
| `install-command` | Command to install dependencies | No | `yarn install --immutable` |
| `version-command` | Command for the version step | No | `yarn changeset version` |
| `publish-command` | Command for the publish step | No | `yarn changeset publish` |
| `commit-message` | Commit message and PR title for the Version Packages PR | No | `chore: version packages` |
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
| `published` | `"true"` when packages were published in this run |
| `publishedPackages` | JSON array of `{ name, version }` for published packages |
| `hasChangesets` | `"true"` when pending changesets exist on the current ref |

## Required repo / org setup

1. **`AZURE_DEVOPS_ARTIFACT_USERNAME` and `AZURE_DEVOPS_ARTIFACT_TOKEN` secrets** at the GitHub org level (`hmcts`), so any repo can use `secrets: inherit`. The PAT needs `Packaging (Read & Write)` on the `hmcts-lib` feed (these are the same secrets HMCTS Gradle publishes use).
2. **Allow Actions to open PRs** — org/repo Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests". The bot needs this to open the Version Packages PR.
3. **Per-package publishability** — every publishable `package.json` needs `name`, `version`, `files`, and `exports`/`main`. We strongly recommend setting `publishConfig.registry` on each package (so a stray `npm publish` from a developer machine doesn't go to npmjs), but passing `npm-scope` to the workflow also guarantees scoped packages route to the Azure feed at CI time:
   ```json
   "publishConfig": {
     "registry": "https://pkgs.dev.azure.com/hmcts/Artifacts/_packaging/hmcts-lib/npm/registry/"
   }
   ```

## Contributor flow (consumer's side)

Once this workflow is wired into a consumer repo:

1. A contributor makes a code change to a publishable package.
2. They run `yarn changeset` (or `npx changeset`) and follow the prompts.
3. The generated `.changeset/<random>.md` file is committed alongside the code change.
4. On merge to master, this workflow upserts a "Version Packages" PR.
5. Merging that PR triggers publish + GitHub release.

## Installing the published packages

Downstream consumers add the following to their `.yarnrc.yml` so Yarn routes the `@hmcts-cft` scope to the Azure Artifacts feed and authenticates with a fresh Azure AD access token from the local `az` CLI session:

```yaml
npmScopes:
  hmcts-cft:
    npmRegistryServer: "https://pkgs.dev.azure.com/hmcts/Artifacts/_packaging/hmcts-lib/npm/registry/"
    npmAlwaysAuth: true
    npmAuthToken: "exec:az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv"
```

Then run `az login` once before `yarn install`. The `exec:` form re-runs `az` per request so the token is always fresh — no long-lived PAT to rotate, no `.npmrc` to leak. The GUID `499b84ac-1321-427f-aa17-267ca6975798` is the Azure DevOps resource ID.

## Notes

- The workflow runs `corepack enable` so Yarn 4 berry works out of the box.
- npm provenance attestation is npmjs.org-only and is not supported by Azure Artifacts; no `id-token: write` permission is needed.
- If the consumer monorepo uses npm or pnpm, override `install-command` / `version-command` / `publish-command` accordingly (e.g. `pnpm install --frozen-lockfile`, `pnpm changeset publish`).
