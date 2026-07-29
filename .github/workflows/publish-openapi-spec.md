# Publish OpenAPI Spec Workflow

Publish an OpenAPI/Swagger spec to [`hmcts/cnp-api-docs`](https://github.com/hmcts/cnp-api-docs), the central HMCTS spec registry. Published specs are served at `https://hmcts.github.io/cnp-api-docs/specs/<api-name>.json`.

**Workflow file:** `.github/workflows/publish-openapi-spec.yaml`

Language-agnostic: it publishes whatever JSON file you point it at. It sets up no toolchain, so it suits repos where the spec is committed, or where generating it needs nothing beyond what the runner already provides.

> **💡 Need a toolchain?** If generating your spec requires Node, Java, Python, or Docker, this workflow cannot set that up — it deliberately has no language-specific inputs. Use the [composite action](../../publish-openapi-spec/README.md) inside your own job, where you control the setup steps.

> For Spring Boot services, [`hmcts/workflow-publish-openapi-spec`](https://github.com/hmcts/workflow-publish-openapi-spec) runs a Gradle integration test to emit the spec and may be a closer fit.

## Features

- Optional generate step, so the spec can be built at publish time or read from the repo
- Validates the spec before pushing — the registry does not validate `docs/specs/*.json` in its own CI
- Idempotent: unchanged specs produce no commit
- `dry-run` for pull-request verification
- `secrets: inherit` picks up the org-level `SWAGGER_PUBLISHER_API_TOKEN` automatically

## When to use

**Use this reusable workflow when:**

- The spec is committed to your repo, or generating it needs no toolchain setup
- The publish can live in its own job
- You want minimal boilerplate

**Use the [composite action](../../publish-openapi-spec/README.md) when:**

- Generating the spec needs a toolchain (Node, Java, Python, Docker) — the action sits in your job, after your own setup steps
- The publish needs to share a job with other work
- You need `published` / `spec-url` outputs mid-job

## Example Usage

### Spec committed to the repo

```yaml
jobs:
  publish-openapi:
    uses: hmcts/cnp-githubactions-library/.github/workflows/publish-openapi-spec.yaml@main
    with:
      spec-path: docs/api/openapi.json
    secrets: inherit
```

### Generating with a self-contained command

`generate-command` runs on a bare runner immediately after checkout. It works when the command needs nothing installed first — here, converting committed YAML to JSON with a container:

```yaml
jobs:
  publish-openapi:
    uses: hmcts/cnp-githubactions-library/.github/workflows/publish-openapi-spec.yaml@main
    with:
      generate-command: >-
        docker run --rm -v ${{ github.workspace }}:/w mikefarah/yq
        -o=json '.' /w/docs/api/openapi.yaml > /tmp/openapi.json
      spec-path: /tmp/openapi.json
    secrets: inherit
```

If your generation step needs `yarn install`, `./gradlew`, or `pip install` first, use the composite action instead — see [its README](../../publish-openapi-spec/README.md) for Node and Gradle examples.

### Dry run on pull requests, real publish on master

```yaml
jobs:
  publish-openapi:
    uses: hmcts/cnp-githubactions-library/.github/workflows/publish-openapi-spec.yaml@main
    with:
      spec-path: docs/api/openapi.json
      dry-run: ${{ github.event_name == 'pull_request' }}
    secrets: inherit
```

### Reading outputs downstream

```yaml
jobs:
  publish-openapi:
    uses: hmcts/cnp-githubactions-library/.github/workflows/publish-openapi-spec.yaml@main
    with:
      spec-path: docs/api/openapi.json
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
| `generate-command` | Shell command producing the spec at `spec-path`, run on a bare runner after checkout. Leave empty if committed. | No | (empty) |
| `api-name` | Published filename without extension. Must be unique across HMCTS. | No | calling repo name |
| `group` | Group suffix → `<api-name>.<group>.json` | No | (empty) |
| `dry-run` | Validate and diff but do not push | No | `false` |
| `runner` | GitHub runner to use | No | `ubuntu-latest` |

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
