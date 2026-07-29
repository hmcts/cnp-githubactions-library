# Publish OpenAPI Spec Workflow

Generate an OpenAPI/Swagger spec and publish it to [`hmcts/cnp-api-docs`](https://github.com/hmcts/cnp-api-docs), the central HMCTS spec registry. Published specs are served at `https://hmcts.github.io/cnp-api-docs/specs/<api-name>.json`.

**Workflow file:** `.github/workflows/publish-openapi-spec.yaml`

> **💡 Need more flexibility?** This reusable workflow suits a stand-alone publish job. If you need the publish to share a job with other steps — or you generate the spec in a way this workflow's Node-oriented defaults don't cover — use the [composite action](../publish-openapi-spec/README.md) instead.

> For Spring Boot services, prefer [`hmcts/workflow-publish-openapi-spec`](https://github.com/hmcts/workflow-publish-openapi-spec), which runs a Gradle integration test to emit the spec. This workflow exists for everything else.

## Features

- Optional generate step, so the spec can be built at publish time or read from the repo
- Validates the spec before pushing — the registry does not validate `docs/specs/*.json` in its own CI
- Idempotent: unchanged specs produce no commit
- `dry-run` for pull-request verification
- `secrets: inherit` picks up the org-level `SWAGGER_PUBLISHER_API_TOKEN` automatically

## When to use

**Use this reusable workflow when:**

- You want "publish the spec on push to master" with minimal boilerplate
- The publish lives in its own job
- You generate the spec with a Node toolchain (or the spec is already committed)

**Use the [composite action](../publish-openapi-spec/README.md) when:**

- The publish needs to share a job with other steps
- You need `published` / `spec-url` outputs mid-job
- Your spec generation needs a toolchain this workflow doesn't set up (Java, Python, Docker Compose)

## Example Usage

### Node service, spec generated at publish time

```yaml
jobs:
  publish-openapi:
    uses: hmcts/cnp-githubactions-library/.github/workflows/publish-openapi-spec.yaml@main
    with:
      generate-command: 'yarn openapi:json /tmp/openapi.json'
      spec-path: /tmp/openapi.json
    secrets: inherit
```

### Spec committed to the repo

No generation, no Node setup.

```yaml
jobs:
  publish-openapi:
    uses: hmcts/cnp-githubactions-library/.github/workflows/publish-openapi-spec.yaml@main
    with:
      spec-path: docs/api/openapi.json
      setup-node: false
    secrets: inherit
```

### Dry run on pull requests, real publish on master

```yaml
jobs:
  publish-openapi:
    uses: hmcts/cnp-githubactions-library/.github/workflows/publish-openapi-spec.yaml@main
    with:
      generate-command: 'yarn openapi:json /tmp/openapi.json'
      spec-path: /tmp/openapi.json
      dry-run: ${{ github.event_name == 'pull_request' }}
    secrets: inherit
```

### Reading outputs downstream

```yaml
jobs:
  publish-openapi:
    uses: hmcts/cnp-githubactions-library/.github/workflows/publish-openapi-spec.yaml@main
    with:
      generate-command: 'yarn openapi:json /tmp/openapi.json'
      spec-path: /tmp/openapi.json
    secrets: inherit

  notify:
    needs: publish-openapi
    if: needs.publish-openapi.outputs.published == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Published to ${{ needs.publish-openapi.outputs.spec-url }}"
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `spec-path` | Path to the spec file to publish. Must be JSON. | Yes | |
| `generate-command` | Command producing the spec at `spec-path`. Leave empty if committed. | No | (empty) |
| `api-name` | Published filename without extension. Must be unique across HMCTS. | No | calling repo name |
| `group` | Group suffix → `<api-name>.<group>.json` | No | (empty) |
| `setup-node` | Run `actions/setup-node` before generating | No | `true` |
| `node-version` | Node version (overridden by `node-version-file`) | No | (empty) |
| `node-version-file` | Path to a Node version file | No | `.nvmrc` |
| `install-command` | Dependency install command. Set to `":"` to skip. | No | `yarn install --immutable` |
| `dry-run` | Validate and diff but do not push | No | `false` |
| `runner` | GitHub runner to use | No | `ubuntu-latest` |

Node setup and install only run when `generate-command` is set — publishing a committed spec needs neither.

## Secrets

| Secret | Description | Required |
|--------|-------------|----------|
| `SWAGGER_PUBLISHER_API_TOKEN` | GitHub token with push access to `hmcts/cnp-api-docs` | Yes |

Available at the `hmcts` org level, so `secrets: inherit` is sufficient.

## Outputs

| Output | Description |
|--------|-------------|
| `published` | `"true"` when a commit was pushed to the registry |
| `spec-url` | Public URL the spec is served from |

## Notes

- **The push targets `master` on a shared repository with no pull-request gate**, so the workflow's validation is the only guard against publishing a broken spec.
- To appear in the registry's network graph, add an entry to [`docs/microservices.json`](https://github.com/hmcts/cnp-api-docs/blob/master/docs/microservices.json) via pull request, with `spec` set to the published URL. Entries carrying a `urls` array will not render their spec.
- Do not wire this into pull-request workflows without `dry-run: true`, or every PR build will publish to the shared registry.
