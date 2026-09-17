# CNP GitHub Actions Library

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Shared GitHub Actions for HMCTS CNP repositories: building and pushing container
images, deploying Helm charts and Terraform, cutting releases, publishing API
specs, and reporting into Slack. If your repo runs on Jenkins you get most of
this from `cnp-jenkins-library` instead; this repository is the equivalent for
repos that build on GitHub Actions.

Most things here come in two forms, a reusable workflow and a composite action.
See [Workflow or action?](#workflow-or-action) for which to pick.

## What's provided

| | What it does | Reusable workflow | Composite action |
|---|---|---|---|
| **Container build and push** | Builds a container image and pushes it to a registry, with multi-platform builds and BuildKit caching. | [docs](.github/workflows/container-build-and-push.md) | [docs](container-build-push/README.md) |
| **Container build and push (OIDC)** | The same, authenticating to ACR with workload identity federation instead of a registry password. | [docs](.github/workflows/container-build-and-push-openId.md) | [docs](container-build-push-openid/README.md) |
| **Helm deploy** | Deploys a Helm chart to an AKS cluster, resolving OCI chart dependencies and templating values files. | [docs](.github/workflows/helm-deploy.md) | [docs](helm-deploy/README.md) |
| **Helm deploy (OIDC)** | The same, authenticating to Azure and AKS with workload identity federation. | [docs](.github/workflows/helm-deploy-openId.md) | [docs](helm-deploy-openid/README.md) |
| **Terraform deploy** | Runs `terraform plan` and optionally `apply` against the HMCTS state storage backend, and comments the plan on the PR. | [docs](.github/workflows/terraform-deploy.md) | [docs](terraform-deploy/README.md) |
| **Terraform deploy (OIDC)** | The same, authenticating to Azure with workload identity federation. | [docs](.github/workflows/terraform-deploy-openId.md) | [docs](terraform-deploy-openid/README.md) |
| **Terraform format check** | Fails the build when Terraform files are not `terraform fmt` clean, using the repo's `.terraform-version`. | | [docs](terraform-fmt/README.md) |
| **PR label check** | Applies a release label from the PR title's Conventional Commits prefix, then enforces that one is present. | [docs](.github/workflows/label-check.md) | |
| **Release drafter** | Keeps a draft GitHub release up to date from merged PR titles and labels, for a human to publish. | [template](.github/workflows/release-drafter.md) | |
| **Update changelog** | Prepends a version section to `CHANGELOG.md` in Keep a Changelog format and commits it back. | [docs](.github/workflows/update-changelog.md) | [docs](update-changelog/README.md) |
| **npm publish library** | Runs release-please over a monorepo and publishes bumped packages to the HMCTS Azure Artifacts npm feed. | [docs](.github/workflows/npm-publish-library.md) | [docs](npm-publish-library/README.md) |
| **Publish OpenAPI spec** | Publishes an OpenAPI or Swagger spec to `hmcts/cnp-api-docs`, where it is served and rendered centrally. | [docs](.github/workflows/publish-openapi-spec.md) | [docs](publish-openapi-spec/README.md) |
| **App Insights health check** | Runs your Application Insights queries on a schedule and emits deduplicated findings for a downstream job. | [docs](.github/workflows/appinsights-health-check.md) | [docs](appinsights-health-check/README.md) |
| **Slack notify** | Posts a message to Slack via a bot token or webhook, resolving GitHub logins to Slack mentions. | | [docs](slack-notify/README.md) |
| **Renovate autofix** | Hands a failing Renovate PR to Claude once and pushes the fix to the branch. | [docs](.github/workflows/renovate-autofix.md) | |

Each linked page is the reference for that one thing: what it is for, every
input, output and secret it takes, worked examples, and any prerequisites. Start
there rather than here.

## Workflow or action?

A **reusable workflow** is a whole job you call with `uses:` at job level. It
brings its own runner and its own steps, takes secrets through the `secrets:`
block, and gives you no room to insert anything. That is the point: for a
standard build or deploy it is one short block and there is nothing to get
wrong.

A **composite action** is a step you drop into a job you own. Reach for it when
you need to do something before or after (run tests first, smoke-test the
deployment after), when one job handles several images or releases, or when you
want a matrix. Composite actions cannot see the `secrets` context, so anything
sensitive is passed as an input or set as job-level `env`.

| Use case | Reusable workflow | Composite action |
|---|---|---|
| Simple, standardised builds and deploys | ✅ | ⚠️ |
| Built-in secret management | ✅ | ❌ |
| Custom pre/post steps | ❌ | ✅ |
| Multiple images or releases in one job | ❌ | ✅ |
| Integration with other actions | ❌ | ✅ |
| Matrix strategy | ❌ | ✅ |

Where a thing exists in both forms, the composite action holds the logic and the
reusable workflow is a single job that calls it. So the two are never out of
step, and choosing between them is a question of how much control you need
rather than of capability.

That also explains why the table has gaps. Some entries are workflows only
because they span more than one job and need `concurrency` and their own
`permissions`, none of which a composite action can declare. Others are actions
only because they exist to run inside a job you already own, next to the checkout
or the step whose failure they report on. If you are adding something new, write
the composite action first and add the wrapper only if callers want one.

The two call shapes, whichever you pick:

```yaml
jobs:
  # a reusable workflow is the whole job
  example:
    uses: hmcts/cnp-githubactions-library/.github/workflows/<name>.yaml@main
    with:
      # inputs, per that workflow's docs
    secrets:
      # or `secrets: inherit` where the docs say org-level secrets are enough

  # a composite action is a step in a job you own
  other:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hmcts/cnp-githubactions-library/<name>@main
        with:
          # inputs, per that action's docs
```

## Versioning

There are no release tags yet, so everything here is consumed at `@main` and you
get changes as they land. If you need to insulate a repository from that, pin to
a commit SHA:

```yaml
uses: hmcts/cnp-githubactions-library/.github/workflows/<name>.yaml@0f3c1a9
uses: hmcts/cnp-githubactions-library/<name>@0f3c1a9
```

Renovate will not bump a SHA pin for you here, so treat it as something you
revisit deliberately.

There used to be a second copy of seven of these workflows in a top-level
`workflows/` directory. It has been removed. If you have a `uses:` line pointing
at `cnp-githubactions-library/workflows/...`, insert `.github/` before
`workflows/` and it will keep working; everything else about the call is
unchanged.

## Contributing

Pull requests are welcome. Branch off `main`, keep the change focused, and give
the PR a Conventional Commits title so it lands under the right heading in the
release notes.

Adding a reusable workflow:

1. Put the workflow in `.github/workflows/` with a `workflow_call` trigger.
2. Write a `.md` next to it documenting every input, output and secret.
3. Add a row to the table at the top of this README. Keep the detail in the doc, not here.

Adding a composite action:

1. Create a directory named after it with an `action.yaml` inside.
2. Write a `README.md` covering inputs, outputs and at least one real example.
3. Add a row to the table at the top of this README. Keep the detail in the doc, not here.

A few conventions that keep these consistent with each other: give optional
inputs sensible defaults, keep each workflow to one job of work, write a run
summary so a failure can be diagnosed from the Actions tab without downloading
logs, and fail loudly rather than reporting success when something could not be
checked.

## License

MIT. See [LICENSE](LICENSE).

## Related

- [GitHub Actions documentation](https://docs.github.com/en/actions)
- [Reusable workflows](https://docs.github.com/en/actions/using-workflows/reusing-workflows)
- [`cnp-jenkins-library`](https://github.com/hmcts/cnp-jenkins-library), the Jenkins equivalent
- [`cnp-api-docs`](https://github.com/hmcts/cnp-api-docs), the API spec registry

Questions, bugs and suggestions: open an issue on this repository.
