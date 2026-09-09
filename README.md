# CNP GitHub Actions Library

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A reusable library of GitHub Actions workflows for HMCTS CNP (Cloud Native Platform) projects. This library provides standardised, production-ready workflows that can be called from other repositories to maintain consistency and reduce duplication.

## 📋 Table of Contents

- [Available Workflows](#available-workflows)
  - [Container Build and Push](#container-build-and-push)
  - [Helm Deploy](#helm-deploy)
  - [Helm Publish](#helm-publish)
  - [npm Publish Library](#npm-publish-library)
  - [Draft Release](#draft-release)
  - [Update Changelog](#update-changelog)
  - [Publish OpenAPI Spec](#publish-openapi-spec)
  - [Application Insights Health Check](#application-insights-health-check)
  - [Slack Notify](#slack-notify)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## 🚀 Available Workflows & Actions

### Container Build and Push

Build and push container images to a container registry with support for multi-platform builds.

**Available in Two Formats:**

#### 1. Reusable Workflow (Simple, Standardized)
Perfect for straightforward builds with minimal customization.

📖 **[View workflow documentation](.github/workflows/container-build-and-push.md)**

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

#### 2. Composite Action (Flexible, Extensible)
Ideal when you need to add custom steps or integrate with other actions.

📖 **[View action documentation](container-build-push/README.md)**

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run custom pre-build steps
        run: npm test
      
      - name: Build and push
        uses: hmcts/cnp-githubactions-library/container-build-push@main
        with:
          registry: myregistry.azurecr.io
          registry-username: ${{ secrets.ACR_USERNAME }}
          registry-password: ${{ secrets.ACR_PASSWORD }}
          image-name: my-application
      
      - name: Run custom post-build steps
        run: ./deploy.sh
```

**Features:**
- Multi-platform build support (linux/amd64, linux/arm64, etc.)
- Flexible authentication (inputs or secrets)
- Docker BuildKit caching for faster builds
- Customisable tags, build args, and context
- Automatic metadata extraction
- Detailed build summary output

**Choosing Between Workflow and Action:**

| Use Case | Reusable Workflow | Composite Action |
|----------|-------------------|------------------|
| Simple, standardized builds | ✅ | ⚠️ |
| Built-in secret management | ✅ | ❌ |
| Custom pre/post build steps | ❌ | ✅ |
| Multiple images in one job | ❌ | ✅ |
| Integration with other actions | ❌ | ✅ |
| Matrix strategy builds | ❌ | ✅ |

### Helm Deploy

Deploy Helm charts to Azure AKS clusters with support for OCI dependencies.

**Available in Two Formats:**

#### 1. Reusable Workflow (Simple, Standardised)
Perfect for straightforward deployments with minimal customisation.

📖 **[View workflow documentation](.github/workflows/helm-deploy.md)**

```yaml
jobs:
  deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy.yaml@main
    with:
      release-name: my-application
      namespace: production
      chart: ./charts/my-app
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
      AKS_CLUSTER_NAME: ${{ secrets.AKS_CLUSTER_NAME }}
      AKS_RESOURCE_GROUP: ${{ secrets.AKS_RESOURCE_GROUP }}
```

#### 2. Composite Action (Flexible, Extensible)
Ideal when you need to add custom steps or integrate with other actions.

📖 **[View action documentation](helm-deploy/README.md)**

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run pre-deployment checks
        run: ./scripts/pre-deploy.sh

      - name: Deploy Helm chart
        uses: hmcts/cnp-githubactions-library/helm-deploy@main
        with:
          cluster-name: my-aks-cluster
          resource-group: my-resource-group
          azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
          release-name: my-application
          namespace: production
          chart: ./charts/my-app

      - name: Run smoke tests
        run: ./scripts/smoke-test.sh
```

**Features:**
- Deploy Helm charts from local paths with OCI dependencies
- Azure AKS authentication with service principal
- OCI registry login for chart dependencies
- Flexible values configuration (files, set, set-string)
- Values template processing with `envsubst` for environment variable substitution
- Subchart dependency updates for monorepo structures
- Dry-run capability for testing deployments
- Atomic deployments with automatic rollback
- Detailed deployment summary output

**Choosing Between Workflow and Action:**

| Use Case | Reusable Workflow | Composite Action |
|----------|-------------------|------------------|
| Simple, standardised deployments | ✅ | ⚠️ |
| Built-in secret management | ✅ | ❌ |
| Custom pre/post deployment steps | ❌ | ✅ |
| Multiple releases in one job | ❌ | ✅ |
| Integration with other actions | ❌ | ✅ |
| Matrix strategy deployments | ❌ | ✅ |

### Helm Publish

Package Helm charts and push them to an HMCTS Azure Container Registry, versioned so the newest build always resolves highest.

For repositories that do not use the standard CNP Jenkins pipeline. A Jenkins-built service has its chart published to [`hmcts/hmcts-charts`](https://github.com/hmcts/hmcts-charts) as `stable/<chart-name>` and flux reads it from there — nothing in GitHub Actions writes to that repository, so a GitHub Actions service publishes to a registry and points flux at that instead.

> The version scheme is deliberate and worth reading before you copy it: `<Chart.yaml version>-t<timestamp>.g<short-sha>`. Semver compares prerelease identifiers **lexically** and ranks numeric identifiers **below** alphanumeric ones, so the obvious `<version>-<short-sha>` resolves to the highest-*sorting* build rather than the newest — one HMCTS app deployed a six-month-old chart for exactly this reason, reporting healthy throughout. See [How charts are versioned](helm-publish/README.md#how-charts-are-versioned-and-why-it-looks-odd).

**Available in Two Formats:**

#### 1. Reusable Workflow (Simple, Standardised)

📖 **[View workflow documentation](.github/workflows/helm-publish.md)**

```yaml
jobs:
  publish-charts:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-publish.yaml@main
    with:
      chart: helm/my-app
    secrets: inherit
```

#### 2. Composite Action (Flexible, Extensible)

Use when the charts need generating or templating first — put your own steps ahead of it.

📖 **[View action documentation](helm-publish/README.md)**

```yaml
jobs:
  publish-charts:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - uses: hmcts/cnp-githubactions-library/helm-publish@main
        id: publish
        with:
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          chart-paths: 'apps/*/helm'
          chart: helm/my-monorepo
          helm-repos: |
            bitnami=https://charts.bitnami.com/bitnami
```

**Features:**
- Chart versions order by build time, so a flux range or a version pin always points at the newest chart
- Publishes monorepo subcharts before the umbrella chart, since the umbrella's dependencies must exist in the registry before it can be packaged
- One timestamp per run, so every chart from the same build shares a suffix
- Resolves chart dependencies and can add chart repositories first
- `dry-run` mode packages and reports without pushing, so pull requests can verify the charts build
- OIDC login, or skip it and reuse a login the job already did
- Outputs `version-suffix`, `chart-version` and `charts-published` (`name=version` pairs) for wiring the result into `cnp-flux-config`
- Documents [how to wire the published chart into flux](helm-publish/README.md#wiring-it-into-flux), which is where this most often goes wrong

### npm Publish Library

Publish JavaScript packages to the HMCTS Azure Artifacts npm feed (`hmcts-lib`) from a monorepo using [release-please](https://github.com/googleapis/release-please). On every push to the release branch the workflow either upserts a release pull request (when unreleased Conventional Commits exist) or publishes to Azure Artifacts + creates GitHub releases (when the release PR has been merged). Uses the existing `AZURE_DEVOPS_ARTIFACT_USERNAME` / `AZURE_DEVOPS_ARTIFACT_TOKEN` org-level secrets (same pair HMCTS Gradle publishes use).

**Available in Two Formats:**

#### 1. Reusable Workflow (Simple, Standardised)

📖 **[View workflow documentation](.github/workflows/npm-publish-library.md)**

```yaml
jobs:
  release:
    uses: hmcts/cnp-githubactions-library/.github/workflows/npm-publish-library.yaml@main
    with:
      npm-scope: '@hmcts-cft'
    secrets: inherit
```

#### 2. Composite Action (Flexible, Extensible)

📖 **[View action documentation](npm-publish-library/README.md)**

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

      - uses: hmcts/cnp-githubactions-library/npm-publish-library@main
        with:
          azure-artifact-username: ${{ secrets.AZURE_DEVOPS_ARTIFACT_USERNAME }}
          azure-artifact-token: ${{ secrets.AZURE_DEVOPS_ARTIFACT_TOKEN }}
          npm-scope: '@hmcts-cft'
```

**Features:**
- Single workflow handles version-bumping, publishing, tagging, and GitHub release creation
- Driven by Conventional Commits — no separate changeset step for contributors
- Reuses the org-level Azure Artifacts secrets (no separate npm token to manage)
- Configurable install / build commands (yarn, npm, pnpm)
- Yarn 4 + Corepack-friendly defaults
- Outputs `releases_created` / `paths_released` for downstream steps

### Draft Release

Automatically draft GitHub releases on every push to `main` using [Release Drafter](https://github.com/release-drafter/release-drafter). Release notes are generated from merged PR titles and labels. A human publishes the draft when ready.

Add this workflow to your repo's `.github/workflows/` directory:

```yaml
name: Release Drafter

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  draft:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    outputs:
      version: ${{ steps.drafter.outputs.resolved_version }}
      tag:     ${{ steps.drafter.outputs.tag_name }}
    steps:
      - uses: release-drafter/release-drafter@v6
        id: drafter
        env:
          GITHUB_TOKEN: ${{ github.token }}

  changelog:
    needs: draft
    if: needs.draft.outputs.version != ''
    uses: hmcts/cnp-githubactions-library/workflows/update-changelog.yaml@main
    with:
      version: ${{ needs.draft.outputs.version }}
      tag:     ${{ needs.draft.outputs.tag }}
```

**Features:**
- Release notes automatically generated from merged PR titles and labels
- Draft-only by default — publishes only when a human approves
- `CHANGELOG.md` updated automatically via the `update-changelog` reusable workflow
- Callers can customise note categories via `.github/release-drafter.yml` in their own repo

### Update Changelog

Automatically prepend a new version section to `CHANGELOG.md` and commit it back to the branch. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Pass the `version` and `tag` outputs from the draft job straight in.

**Available in Two Formats:**

#### 1. Reusable Workflow (Simple, Standardised)
Call from the `changelog` job in your Release Drafter workflow (see example above).

📖 **[View workflow documentation](workflows/update-changelog.md)**

```yaml
  changelog:
    needs: draft
    if: needs.draft.outputs.version != ''
    uses: hmcts/cnp-githubactions-library/workflows/update-changelog.yaml@main
    with:
      version: ${{ needs.draft.outputs.version }}
      tag:     ${{ needs.draft.outputs.tag }}
```

#### 2. Composite Action (Flexible, Extensible)
Use when you need to update the changelog within an existing job.

📖 **[View action documentation](update-changelog/README.md)**

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Update changelog
        uses: hmcts/cnp-githubactions-library/update-changelog@main
        with:
          github-token: ${{ github.token }}
          version: "1.0.1"   # version from Release Drafter or your own release step
          tag: "v1.0.1"
```

**Features:**
- Creates `CHANGELOG.md` from scratch if it doesn't exist (bootstrap-safe)
- Auto-fetches release notes from the GitHub draft release (populated by Release Drafter)
- Entries are prepended in newest-first order, following Keep a Changelog convention
- Appends `[skip ci]` to the commit message to prevent recursive workflow runs
- Outputs `changelog-path` and `committed` for downstream steps

### Publish OpenAPI Spec

Publish an OpenAPI/Swagger spec to [`hmcts/cnp-api-docs`](https://github.com/hmcts/cnp-api-docs), the central HMCTS spec registry, where it is served at `https://hmcts.github.io/cnp-api-docs/specs/<api-name>.json` and rendered by the registry's Swagger UI. Language-agnostic — it takes a path to a generated JSON spec, so it works with any toolchain.

> For Spring Boot services, prefer [`hmcts/workflow-publish-openapi-spec`](https://github.com/hmcts/workflow-publish-openapi-spec), which emits the spec from a Gradle integration test. This action covers everything else.

**Available in Two Formats:**

Neither format sets up a toolchain, so generating the spec is the caller's business.

#### 1. Reusable Workflow (Simple, Standardised)

For a committed spec, or generation that needs nothing installed first.

📖 **[View workflow documentation](.github/workflows/publish-openapi-spec.md)**

```yaml
jobs:
  publish-openapi:
    uses: hmcts/cnp-githubactions-library/.github/workflows/publish-openapi-spec.yaml@main
    with:
      spec-path: docs/api/openapi.json
    secrets: inherit
```

#### 2. Composite Action (Flexible, Extensible)

Use when generating the spec needs a toolchain — put your own setup steps ahead of it.

📖 **[View action documentation](publish-openapi-spec/README.md)**

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

      - name: Generate spec
        run: ./gradlew generateOpenApiDocs

      - uses: hmcts/cnp-githubactions-library/publish-openapi-spec@main
        with:
          spec-path: build/openapi.json
```

**Features:**
- No language-specific inputs — works with Gradle, yarn, pip, `curl` against a running container, or a committed spec
- Validates the spec is present, non-empty, valid JSON, and actually a spec before publishing — the registry never parses `docs/specs/*.json` in its own CI, so an invalid spec would otherwise publish silently
- Idempotent: no commit when the spec is unchanged
- `dry-run` mode diffs without pushing, so pull requests can verify the spec builds
- Supports the `<api-name>.<group>.json` convention for repos publishing several specs
- Accepts OpenAPI 3.x and Swagger 2.0
- Uses the org-level `SWAGGER_PUBLISHER_API_TOKEN`, so `secrets: inherit` is enough for the reusable workflow, and a one-line job `env` for the action (GitHub does not expose the `secrets` context to composite actions)
- Outputs `published`, `spec-name`, and `spec-url`

### Application Insights Health Check

Run a set of Application Insights queries on a schedule, evaluate each against a threshold, and emit deduplicated findings for a downstream job to act on — a Slack post, a triage job, whatever the consumer needs.

**The action ships no queries.** Every KQL query, threshold and suppression lives in a config file in the consuming repo (`.github/watchdog.yml` by default). Services differ too much for a shared query set to be right, and a team should be able to tune its own monitoring without a PR against this repository.

**Available in Two Formats:**

#### 1. Reusable Workflow (Simple, Standardised)

Handles the OIDC login, the state cache and the artefact upload.

📖 **[View workflow documentation](.github/workflows/appinsights-health-check.md)**

```yaml
jobs:
  detect:
    uses: hmcts/cnp-githubactions-library/.github/workflows/appinsights-health-check.yaml@main
    with:
      config-path: .github/watchdog.yml
    secrets: inherit
```

#### 2. Composite Action (Flexible, Extensible)

For a matrix across environments, or when state needs persisting differently.

📖 **[View action documentation](appinsights-health-check/README.md)**

```yaml
jobs:
  detect:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - id: check
        uses: hmcts/cnp-githubactions-library/appinsights-health-check@main
        with:
          app-id: ${{ matrix.app-id }}
```

**Features:**
- Consumer-defined KQL with `{{window}}` and `{{baseline}}` substituted in
- A deliberately small threshold grammar — `rows > 0`, `rows == 0`, or a per-row column comparison. Anything more expressive belongs in the KQL, where it can be tested in the portal
- Per-finding fingerprinting, so an ongoing incident is reported once rather than every run
- Suppression list in the consumer's config, requiring a stated reason for every entry, so silencing is auditable rather than invisible
- Caps findings per run and reports what was deferred, so one bad deploy cannot fan out into hundreds of downstream jobs
- Reports resolution when a previously-firing finding goes clean
- Queries the REST API using the ambient `azure/login` session, so no `az` extension install on every scheduled run
- **A query that errors, 403s or times out fails the run** rather than reporting healthy — the difference between "nothing is wrong" and "nothing ran" is the whole point
- Outputs `breached`, `findings`, `findings-path`, `deferred-count` and `resolved`

Requires **Monitoring Reader** on the target resource; Key Vault access policies do not cover the telemetry data plane.

### Slack Notify

Post a message to Slack from a workflow, via a bot token (`chat.postMessage`) or an incoming webhook. Jenkins pipelines get this from `cnp-jenkins-library`, which reads the channel from `cnp-jenkins-config/team-config.yml`; GitHub Actions had no equivalent, so repos were hand-rolling `curl` calls.

📖 **[View action documentation](slack-notify/README.md)**

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

**Features:**
- Bot token or incoming webhook, token taking precedence when both are present
- Block Kit support, with `text` as the notification fallback
- Threading: `thread-ts` in, `ts` out, so a resolution message can reply to the original alert
- Resolves GitHub logins to Slack mentions via [`hmcts/github-slack-user-mappings`](https://github.com/hmcts/github-slack-user-mappings), falling back to a plain `@login` when unmapped
- Payloads assembled with `jq`, so quotes, newlines and braces in a message cannot break the JSON
- Treats Slack's `ok: false` as a failure — it arrives with HTTP 200, so a status-code check alone would report success
- Does not fail the job by default: a notification usually reports on something more important than itself
- Outputs `delivered` and `ts`

`team-config.yml` is Jenkins-only and is not consulted — pass the channel explicitly.

## 📖 Usage

### Using Reusable Workflows

To use a reusable workflow in your repository:

1. Reference the workflow using the `uses` keyword in your workflow file
2. Specify the version/branch after the `@` symbol (e.g., `@main`, `@v1.0.0`)
3. Pass required inputs and secrets as needed

```yaml
jobs:
  call-workflow:
    uses: hmcts/cnp-githubactions-library/.github/workflows/<workflow-name>.yaml@main
    with:
      # your inputs here
    secrets:
      # your secrets here
```

### Using Composite Actions

To use a composite action in your workflow:

1. Add it as a step within your job
2. Provide required inputs directly
3. Optionally use outputs in subsequent steps

```yaml
jobs:
  your-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Your custom action
        uses: hmcts/cnp-githubactions-library/<action-name>@main
        with:
          # your inputs here
      
      - name: Use outputs
        run: echo "Result: ${{ steps.your-custom-action.outputs.result }}"
```

### Versioning

We recommend pinning to a specific version or commit SHA for production use:

```yaml
# Pin to a specific tag
uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@v1.0.0

# Pin to a specific commit
uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@abc123def

# Use the latest from main (not recommended for production)
uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@main
```

For composite actions:
```yaml
uses: hmcts/cnp-githubactions-library/container-build-push@v1.0.0
```

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository** and create a new branch for your feature or bugfix
2. **Follow the existing code style** and conventions
3. **Test your changes** thoroughly before submitting
4. **Update documentation** if you're adding new features or changing behavior
5. **Submit a pull request** with a clear description of your changes

### Adding a New Workflow or Action

When adding new reusable workflows:

1. Place the workflow file in the `.github/workflows/` directory
2. Create a corresponding `.md` documentation file in the same directory
3. Use the `workflow_call` trigger
4. Update the main README with a summary and link

When adding new composite actions:

1. Create a new directory with a descriptive name
2. Add an `action.yaml` file in that directory
3. Create a comprehensive `README.md` with examples
4. Update the main README with a summary and link

### Workflow Guidelines

- Use semantic versioning for releases
- Keep workflows focused and single-purpose
- Provide sensible defaults for optional inputs
- Use secrets for sensitive data
- Add descriptive output summaries
- Enable caching where appropriate

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Reusable Workflows](https://docs.github.com/en/actions/using-workflows/reusing-workflows)
- [HMCTS GitHub](https://github.com/hmcts)

## 📧 Support

For issues, questions, or contributions, please open an issue in this repository.
