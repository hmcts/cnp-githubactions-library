# npm Changesets Release Workflow

Publish packages to npm from a monorepo using [changesets](https://github.com/changesets/changesets). On every push to the release branch the workflow either:

- **upserts a "Version Packages" pull request** that consumes pending `.changeset/*.md` files (bumps versions, writes CHANGELOGs), or
- **publishes to npm + creates GitHub releases** when the Version Packages PR has been merged and `package.json` versions are ahead of the registry.

The mode is chosen automatically by `changesets/action@v1` based on the state of `.changeset/`.

**Workflow file:** `.github/workflows/npm-changesets-release.yaml`

> **💡 Need more flexibility?** This reusable workflow is great when you want a stand-alone release job. If you need to interleave other steps (e.g. run tests, post Slack notifications) in the same job, use the [composite action](../../npm-changesets-release/README.md) instead.

## Features

- Single workflow handles both version-bumping and publishing
- `secrets: inherit` plumbs the org-level `NPM_TOKEN` automatically — no per-repo wiring of the token name
- One place to swap the npm auth mechanism (token → OIDC) when the org migrates
- Configurable install / version / publish commands (yarn, npm, pnpm)
- Returns `published` / `publishedPackages` / `hasChangesets` outputs

## When to use

**Use this reusable workflow when:**

- You want "publish on push to master" with minimal boilerplate
- The release lives in its own job — no other tasks need to run alongside it
- Your org provides `NPM_TOKEN` as an org-level secret and you can use `secrets: inherit`

**Use the [composite action](../../npm-changesets-release/README.md) when:**

- You want to run tests or other steps in the same job as the publish
- You need to use changesets outputs (`published`, `publishedPackages`) to drive subsequent steps

## Example Usage

### Default — Yarn 4 monorepo, org-level secret

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
- `NPM_TOKEN` available at the org or repo level.

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

### Explicit secret name (not using `inherit`)

```yaml
jobs:
  release:
    uses: hmcts/cnp-githubactions-library/.github/workflows/npm-changesets-release.yaml@main
    with:
      node-version-file: '.nvmrc'
    secrets:
      NPM_TOKEN: ${{ secrets.MY_REPO_NPM_TOKEN }}
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

## Secrets

| Secret | Description | Required |
|--------|-------------|----------|
| `NPM_TOKEN` | npm automation token with publish rights for the target scope/packages | No (but publish will fail at runtime without it) |

`NPM_TOKEN` is declared optional at the `workflow_call` boundary so callers using `secrets: inherit` don't fail validation on repos that haven't configured the secret yet. The downstream `changeset publish` will exit with an authentication error if a real publish is attempted without a valid token, so missing-token failures still surface — just at publish time rather than workflow-load time.

## Outputs

| Output | Description |
|--------|-------------|
| `published` | `"true"` when packages were published in this run |
| `publishedPackages` | JSON array of `{ name, version }` for published packages |
| `hasChangesets` | `"true"` when pending changesets exist on the current ref |

## Required repo / org setup

1. **`NPM_TOKEN` secret** at the GitHub org level (`hmcts`), so any repo can use `secrets: inherit`. Granular automation token, scoped to the target npm scope or packages.
2. **Allow Actions to open PRs** — org/repo Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests". The bot needs this to open the Version Packages PR.
3. **Per-package publishability** — every publishable `package.json` needs `name`, `version`, `files`, `exports`/`main`, and for scoped public packages `publishConfig.access: public`. For provenance attestation (recommended), also add `publishConfig.provenance: true`.

## Contributor flow (consumer's side)

Once this workflow is wired into a consumer repo:

1. A contributor makes a code change to a publishable package.
2. They run `yarn changeset` (or `npx changeset`) and follow the prompts.
3. The generated `.changeset/<random>.md` file is committed alongside the code change.
4. On merge to master, this workflow upserts a "Version Packages" PR.
5. Merging that PR triggers publish + GitHub release.

## Notes

- The workflow runs `corepack enable` so Yarn 4 berry works out of the box.
- The `id-token: write` permission is granted so `npm publish --provenance` works when `publishConfig.provenance: true` is set on the package.
- If the consumer monorepo uses npm or pnpm, override `install-command` / `version-command` / `publish-command` accordingly (e.g. `pnpm install --frozen-lockfile`, `pnpm changeset publish`).
