# Publish OpenAPI Spec Action

A composite GitHub Action that publishes an OpenAPI/Swagger spec to [`hmcts/cnp-api-docs`](https://github.com/hmcts/cnp-api-docs), the central HMCTS spec registry. Published specs are served at `https://hmcts.github.io/cnp-api-docs/specs/<api-name>.json` and rendered by the registry's Swagger UI.

The action is language-agnostic: it takes a path to an already-generated JSON spec. How you produce that file — Gradle, a yarn script, `curl` against a running container — is up to the caller.

> HMCTS also has [`hmcts/workflow-publish-openapi-spec`](https://github.com/hmcts/workflow-publish-openapi-spec), which is Java-only: it hardcodes `setup-java` and `./gradlew integration --tests <class>`. Use that one for Spring Boot services. Use this action for everything else.

## Features

- Validates the spec is present, non-empty, parseable JSON, and actually a spec before pushing — `cnp-api-docs` never parses `docs/specs/*.json` in its own CI, so an invalid spec would otherwise publish silently
- Idempotent — no commit is made when the spec is byte-identical to what is already published
- `dry-run` mode diffs without pushing, so pull requests can verify the spec builds
- Supports the `<api-name>.<group>.json` convention for repos publishing several specs
- Accepts both OpenAPI 3.x and Swagger 2.0
- Outputs `published`, `spec-name`, and `spec-url` for downstream steps
- Writes a job summary linking to the published spec

## Usage

### Basic — spec committed to the repo

```yaml
jobs:
  publish-spec:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: hmcts/cnp-githubactions-library/publish-openapi-spec@main
        with:
          spec-path: docs/api/openapi.json
          api-token: ${{ secrets.SWAGGER_PUBLISHER_API_TOKEN }}
```

### Generating the spec first

```yaml
jobs:
  publish-spec:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc

      - run: yarn install --immutable

      - name: Generate spec
        run: yarn openapi:json /tmp/openapi.json

      - uses: hmcts/cnp-githubactions-library/publish-openapi-spec@main
        with:
          spec-path: /tmp/openapi.json
          api-token: ${{ secrets.SWAGGER_PUBLISHER_API_TOKEN }}
```

### Dry run on pull requests

Verifies the spec is valid and shows what would change, without touching the registry.

```yaml
      - uses: hmcts/cnp-githubactions-library/publish-openapi-spec@main
        with:
          spec-path: /tmp/openapi.json
          api-token: ${{ secrets.SWAGGER_PUBLISHER_API_TOKEN }}
          dry-run: ${{ github.event_name == 'pull_request' }}
```

### Publishing more than one spec from one repo

```yaml
      - uses: hmcts/cnp-githubactions-library/publish-openapi-spec@main
        with:
          spec-path: /tmp/v2-external.json
          api-token: ${{ secrets.SWAGGER_PUBLISHER_API_TOKEN }}
          group: v2_external          # -> docs/specs/<repo>.v2_external.json
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `spec-path` | Path to the generated spec file. Must be JSON — the registry does not render YAML. | Yes | |
| `api-token` | GitHub token with push access to `hmcts/cnp-api-docs`. The org-level `SWAGGER_PUBLISHER_API_TOKEN`. | Yes | |
| `api-name` | Published filename, without extension. Must be unique across all HMCTS APIs. | No | calling repo name |
| `group` | Group suffix for repos publishing several specs → `<api-name>.<group>.json` | No | (empty) |
| `docs-repository` | Repository hosting the registry | No | `hmcts/cnp-api-docs` |
| `docs-branch` | Branch to publish to. Pushed directly, with no pull request. | No | `master` |
| `git-user-name` | Git commit author name | No | `HMCTS Platform Operations` |
| `git-user-email` | Git commit author email | No | `github-platform-operations@HMCTS.NET` |
| `dry-run` | Validate and diff but do not push | No | `false` |

## Outputs

| Output | Description |
|--------|-------------|
| `published` | `"true"` when a commit was pushed; `"false"` when the spec was unchanged or `dry-run` was set |
| `spec-name` | Filename the spec was published as, without `.json` |
| `spec-url` | Public URL the spec is served from |

## Required setup

1. **`SWAGGER_PUBLISHER_API_TOKEN`** — available at the `hmcts` org level, so a reusable-workflow caller can use `secrets: inherit`. No Platform Operations request needed.
2. **A JSON spec.** If you author YAML, convert it before calling this action. The registry holds 183 specs and every one is JSON.
3. **A registry entry** in [`docs/microservices.json`](https://github.com/hmcts/cnp-api-docs/blob/master/docs/microservices.json) if you want your API to appear in the network graph. That file is hand-edited via pull request; set `spec` to the published URL. Note that entries carrying a `urls` array will *not* render their spec — per the registry README, "If `urls` array is present spec will not be used".

## Notes

- **The push goes directly to `master` on a shared repository, with no pull-request gate.** That is the established HMCTS mechanism, shared by every publishing service, but it means the validation in this action is the only thing standing between a broken spec and the live registry. That is why the checks fail loudly rather than warning.
- The commit message is `Update spec for <api-name>#<short-sha>`, using the first 7 characters of the SHA. Existing HMCTS publishers use `${GITHUB_SHA:7}`, which *strips* the leading 7 characters instead of taking them — hence the 33-character hashes throughout the registry's history (e.g. `Update spec for civil-service#02c23a28e30becca5aab38cfa851e50e2`). This action uses `${GITHUB_SHA:0:7}`.
- The token is supplied through a git credential helper rather than embedded in the remote URL, so it cannot surface in error output or `git remote -v`.
- `git pull --depth 1` keeps the clone shallow; the registry has a long history of spec commits.
