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

Each linked page lists every input, output and secret, so the sections below
only cover what a thing is for and enough of a snippet to get started.

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

That also explains why the table has gaps. `renovate-autofix` and `label-check`
are workflows only because they span two jobs, and `renovate-autofix` needs
`concurrency` and its own `permissions` on each of them; a composite action
cannot declare any of those. `terraform-fmt` and `slack-notify` are actions only
because they exist to run inside a job you already own, next to the checkout or
the step whose failure you are reporting. If you are adding something new, write
the composite action first and add the wrapper only if callers want one.

## Container build and push

Builds from your `Dockerfile` and pushes to a registry. Tags and labels come
from the commit by default, and BuildKit layer caching is on, so repeat builds
of an unchanged base are quick.

Two authentication options: the plain version takes a registry username and
password, and the OIDC version takes an Azure client ID and tenant ID and logs
into ACR itself, with no stored credentials. Prefer OIDC for anything new.

```yaml
jobs:
  build:
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@main
    with:
      image-name: my-application
    secrets:
      REGISTRY_LOGIN_SERVER: ${{ secrets.ACR_LOGIN_SERVER }}
      REGISTRY_USERNAME: ${{ secrets.ACR_USERNAME }}
      REGISTRY_PASSWORD: ${{ secrets.ACR_PASSWORD }}
```

As an action, when you want steps either side:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - run: npm test

      - uses: hmcts/cnp-githubactions-library/container-build-push@main
        with:
          registry: myregistry.azurecr.io
          registry-username: ${{ secrets.ACR_USERNAME }}
          registry-password: ${{ secrets.ACR_PASSWORD }}
          image-name: my-application
```

## Helm deploy

Deploys a chart from a path in your repo to an AKS namespace. It logs into the
cluster, logs into the OCI registry to pull chart dependencies, updates
subcharts, and runs an atomic `helm upgrade --install` so a failed release rolls
itself back. Values can come from files, `--set`, or a template run through
`envsubst` if you need environment variables substituted in.

There is an OIDC variant here too, and the same advice applies.

```yaml
jobs:
  deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy.yaml@main
    with:
      environment: cft-preview-01
      team-name: my-team
      application-name: my-app
      release-name: my-app
      chart: ./charts/my-app
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
```

The cluster and resource group are derived from `environment`, so you name the
environment rather than the cluster.

The action form is the one to use if you want pre-deployment checks or smoke
tests in the same job:

```yaml
      - uses: hmcts/cnp-githubactions-library/helm-deploy@main
        with:
          environment: cft-preview-01
          team-name: my-team
          application-name: my-app
          azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
          release-name: my-app
          chart: ./charts/my-app
```

## Terraform deploy

Runs `plan`, comments the plan on the pull request (updating the same comment
rather than adding another on every push), and applies when you tell it to. The
HMCTS state storage backend is configured for you, the product name is read out
of `Chart.yaml`, and environment tags are set to keep Azure Policy happy.

```yaml
jobs:
  terraform:
    uses: hmcts/cnp-githubactions-library/.github/workflows/terraform-deploy.yaml@main
    with:
      environment: aat
      subscription: DCD-CNP-DEV
      aks-subscription: DCD-CFTAPPS-STG
      storage-account: nonprod
      plan-only: ${{ github.event_name == 'pull_request' }}
      helm-chart-path: helm/myapp/Chart.yaml
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
```

Pair it with the [Terraform format check](terraform-fmt/README.md) action on
pull requests so formatting failures show up before a plan runs.

## Releases

Three pieces that fit together, and are useful separately.

**PR label check** auto-labels a pull request from its Conventional Commits
title prefix and then fails if no release label is present. Release Drafter uses
those labels to decide the next version and to group the notes, so a PR without
one silently becomes a patch bump filed under nothing.

```yaml
on:
  pull_request:
    types: [opened, edited, synchronize, labeled, unlabeled]

jobs:
  label-check:
    uses: hmcts/cnp-githubactions-library/.github/workflows/label-check.yaml@main
```

**Release drafter** keeps a draft release updated on every merge to `main`, and
a human publishes it when the time is right. This one is a template to copy
rather than a workflow to call, because it needs a GitHub App token in your own
repo: read [the setup notes](.github/workflows/release-drafter.md) first, as the
app has to be granted access to your repository and added to any branch
protection bypass list before it can write.

**Update changelog** prepends the new version to `CHANGELOG.md`, pulling the
body from the draft release, and commits it back with `[skip ci]` so it does not
retrigger your workflows. It creates the file if there isn't one. Feed it the
version and tag from the draft job:

```yaml
  changelog:
    needs: draft
    if: needs.draft.outputs.version != ''
    uses: hmcts/cnp-githubactions-library/.github/workflows/update-changelog.yaml@main
    with:
      version: ${{ needs.draft.outputs.version }}
      tag:     ${{ needs.draft.outputs.tag }}
```

## npm publish library

Publishes JavaScript packages from a monorepo to the HMCTS Azure Artifacts npm
feed (`hmcts-lib`), driven by [release-please](https://github.com/googleapis/release-please).
Every push to the release branch does one of two things: if there are unreleased
Conventional Commits it opens or updates a release PR, and if that release PR has
just been merged it publishes the bumped packages, tags them, and creates the
GitHub releases. Contributors do not have to remember a changeset step.

Authentication reuses the org-level `AZURE_DEVOPS_ARTIFACT_USERNAME` and
`AZURE_DEVOPS_ARTIFACT_TOKEN` secrets that HMCTS Gradle publishes already use,
so `secrets: inherit` is enough and there is no npm token to manage.

```yaml
jobs:
  release:
    uses: hmcts/cnp-githubactions-library/.github/workflows/npm-publish-library.yaml@main
    with:
      npm-scope: '@hmcts-cft'
    secrets: inherit
```

## Publish OpenAPI spec

Pushes a spec to [`hmcts/cnp-api-docs`](https://github.com/hmcts/cnp-api-docs),
the central registry, where it is served at
`https://hmcts.github.io/cnp-api-docs/specs/<api-name>.json` and rendered in the
registry's Swagger UI. It takes a path to a JSON file and has no
language-specific inputs, so Gradle, yarn, pip, a `curl` against a running
container, or a committed spec all work the same way. Generating the spec is
your job; this only publishes it.

Before pushing it checks the file exists, is non-empty, is valid JSON, and looks
like an OpenAPI 3.x or Swagger 2.0 document. The registry never parses
`docs/specs/*.json` in its own CI, so without that check a broken spec would
publish quietly. Republishing an unchanged spec is a no-op, and `dry-run` diffs
without pushing so pull requests can verify the spec still builds.

```yaml
jobs:
  publish-openapi:
    uses: hmcts/cnp-githubactions-library/.github/workflows/publish-openapi-spec.yaml@main
    with:
      spec-path: docs/api/openapi.json
    secrets: inherit
```

If generating the spec needs a toolchain, use the action and put your setup
steps in front of it. Note the job-level `env`, which is how a composite action
gets at a secret:

```yaml
jobs:
  publish-spec:
    runs-on: ubuntu-latest
    env:
      SWAGGER_PUBLISHER_API_TOKEN: ${{ secrets.SWAGGER_PUBLISHER_API_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: temurin
      - run: ./gradlew generateOpenApiDocs
      - uses: hmcts/cnp-githubactions-library/publish-openapi-spec@main
        with:
          spec-path: build/openapi.json
```

Spring Boot services should generally use
[`hmcts/workflow-publish-openapi-spec`](https://github.com/hmcts/workflow-publish-openapi-spec)
instead, which emits the spec from a Gradle integration test. This covers
everything else.

## Application Insights health check

Runs a set of Application Insights queries on a schedule, checks each result
against a threshold, and emits findings for a downstream job to act on, whether
that is a Slack post, a triage job, or something of your own.

It ships no queries. Every KQL query, threshold and suppression lives in a
config file in your repo (`.github/watchdog.yml` by default). Services differ
too much for a shared query set to be right, and tuning your own monitoring
should not need a PR against this repository.

```yaml
jobs:
  detect:
    uses: hmcts/cnp-githubactions-library/.github/workflows/appinsights-health-check.yaml@main
    with:
      config-path: .github/watchdog.yml
    secrets: inherit
```

Worth knowing before you rely on it:

- Findings are fingerprinted, so an ongoing incident is reported once rather
  than on every run, and a resolution is reported when it goes clean.
- The threshold grammar is deliberately thin: `rows > 0`, `rows == 0`, or a
  per-row column comparison. Anything more expressive belongs in the KQL, where
  you can test it in the portal.
- Suppressions require a stated reason, so silencing a query is auditable
  rather than invisible.
- A query that errors, 403s or times out fails the run instead of reporting
  healthy. The difference between "nothing is wrong" and "nothing ran" is the
  whole reason to have this.
- The principal needs **Monitoring Reader** on the Application Insights
  resource. Key Vault access policies do not cover the telemetry data plane.

## Slack notify

Posts to Slack from a workflow, either with a bot token via `chat.postMessage`
or through an incoming webhook. Jenkins pipelines get this from
`cnp-jenkins-library`, which reads the channel out of
`cnp-jenkins-config/team-config.yml`. GitHub Actions had no equivalent, so repos
were hand-rolling `curl` calls. That file is only read by the Jenkins library at
pipeline runtime and is not consulted here, so pass the channel explicitly.

```yaml
jobs:
  notify:
    runs-on: ubuntu-latest
    env:
      SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
    steps:
      - uses: hmcts/cnp-githubactions-library/slack-notify@main
        with:
          channel: C0123456789
          text: ":white_check_mark: Deploy to AAT finished."
```

Block Kit is supported, with `text` as the notification fallback. Pass
`thread-ts` in and read `ts` out to reply to an earlier alert. GitHub logins are
resolved to Slack mentions via
[`hmcts/github-slack-user-mappings`](https://github.com/hmcts/github-slack-user-mappings),
falling back to a plain `@login` when someone is not mapped. Payloads are built
with `jq`, so quotes, newlines and braces in a message cannot break the JSON.
Slack answers `ok: false` with HTTP 200, which the action treats as a failure,
because a status-code check alone would call it a success. By default a failed
notification does not fail your job, on the grounds that it is usually reporting
on something more important than itself.

## Renovate autofix

When CI fails on a Renovate dependency-update PR, this hands the failure to
Claude once and pushes the fix to the branch.

It ships no instructions. What a valid fix looks like for your repo (the
toolchain, the commit convention, what to leave alone) goes in the `prompt`
input, because that is the part that cannot be shared. Everything around it is
the same everywhere: resolving the PR, gating, capping attempts, deciding the
outcome, pushing safely, and reporting.

```yaml
permissions:
  contents: write
  pull-requests: write
  issues: write
  actions: read
  id-token: write

jobs:
  autofix:
    uses: hmcts/cnp-githubactions-library/.github/workflows/renovate-autofix.yaml@main
    secrets: inherit
    with:
      ci-workflow: workflow.preview.yml
      prompt: |
        Run `yarn install --immutable` before any lint or test command.
        Never widen or pin back the version in package.json.
        Commit once, do NOT push. Always write /tmp/autofix-report.md.
```

The guardrails are the interesting part:

- One attempt per PR, claimed before the agent runs and serialised with the
  eligibility gate, so a crash, a timeout, or two failures landing at once
  cannot produce a second attempt.
- The outcome is read from `git`, not from what the agent says it did, and a
  rewritten history is refused rather than force-pushed.
- The push uses `--force-with-lease` against the checked-out SHA, so a branch
  Renovate refreshed mid-run is refused rather than clobbered. The report is on
  the push, not the fix, so a rejected lease never reads as success.
- `skip-when-all-failures-match` drops failures that no code change can fix, so
  attempts are not spent on infrastructure flakes.
- Reporting goes into one PR comment that gets updated, not a new one per run.

One thing to be aware of: a commit from anyone other than Renovate takes a PR
out of Renovate's management, so no more rebasing and no more automerge. The
report says the PR needs manual review whenever a commit has landed.

## Versioning

There are no release tags yet, so everything above is consumed at `@main` and
you get changes as they land. If you need to insulate a repository from that,
pin to a commit SHA:

```yaml
uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@0f3c1a9
uses: hmcts/cnp-githubactions-library/container-build-push@0f3c1a9
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
3. Add a row to the table at the top of this README and a short section below.

Adding a composite action:

1. Create a directory named after it with an `action.yaml` inside.
2. Write a `README.md` covering inputs, outputs and at least one real example.
3. Add a row to the table at the top of this README and a short section below.

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
