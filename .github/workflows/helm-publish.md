# Helm Publish workflow

Packages Helm charts and pushes them to an HMCTS Azure Container Registry, versioned so the newest build always resolves highest.

For repositories that do not use the standard CNP Jenkins pipeline. A Jenkins-built service has its chart published to [`hmcts/hmcts-charts`](https://github.com/hmcts/hmcts-charts) as `stable/<chart-name>` and flux reads it from there; nothing in GitHub Actions writes to that repository, so a GitHub Actions service publishes to a registry and points flux at that instead.

Use the [composite action](../../helm-publish/README.md) directly if you need setup steps of your own before publishing.

## Usage

```yaml
jobs:
  publish-charts:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-publish.yaml@main
    with:
      chart: helm/my-app
    secrets: inherit
```

Monorepo with subcharts and an umbrella chart, verifying on pull requests without pushing:

```yaml
jobs:
  publish-charts:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-publish.yaml@main
    with:
      chart-paths: 'apps/*/helm'
      chart: helm/my-monorepo
      dry-run: ${{ github.event_name == 'pull_request' }}
      helm-repos: |
        bitnami=https://charts.bitnami.com/bitnami
    secrets: inherit
```

Subcharts are published before the umbrella chart, since the umbrella's dependencies must be in the registry before it can be packaged.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `chart` | no | — | Path to one chart. |
| `chart-paths` | no | — | Glob matching several chart directories. |
| `registry` | no | `hmctsprod.azurecr.io` | Charts land under `<registry>/helm/<chart-name>`. |
| `short-sha` | no | first 7 of `github.sha` | Short SHA recorded in the version. |
| `helm-repos` | no | — | Chart repositories to add first, one `name=url` per line. |
| `helm-version` | no | `v3.14.0` | Version of Helm to use. |
| `dry-run` | no | `false` | Package and report, but do not push. |
| `runner` | no | `ubuntu-latest` | Runner to use. |

Set `chart`, `chart-paths`, or both. Setting neither fails.

## Secrets

| Secret | Required | Description |
| --- | --- | --- |
| `AZURE_CLIENT_ID` | yes | App registration federated with this repository, for OIDC login to the registry. |
| `AZURE_TENANT_ID` | no | Defaults to the HMCTS tenant. |

## Outputs

| Output | Description |
| --- | --- |
| `version-suffix` | Prerelease suffix shared by every chart in the run, e.g. `t20260909150000.gabc1234`. |
| `chart-version` | Full version `chart` was published as. Empty when only `chart-paths` was used. |
| `charts-published` | Space-separated `name=version` pairs for every chart pushed. |

Charts in one repository often carry different `version:` values, so each is published as its own `Chart.yaml` version plus the shared suffix — `version-suffix` is the only value common to all of them.

## Versioning, and wiring it into flux

Charts are published as `<Chart.yaml version>-t<timestamp>.g<short-sha>`. Both letter prefixes are load-bearing: semver compares prerelease identifiers lexically and ranks numeric identifiers below alphanumeric ones, so a bare SHA resolves to the highest-*sorting* build rather than the newest, and a bare timestamp sorts beneath every hex SHA already published. The [action documentation](../../helm-publish/README.md#how-charts-are-versioned-and-why-it-looks-odd) explains this in full, with the measured consequences.

**In `cnp-flux-config`, pin the exact version — do not use a range.** A `version:` range against an OCI `HelmRepository` is only re-resolved when source-controller restarts, so a newly published chart is never picked up while the `HelmChart` carries on reporting `Ready`. See [Wiring it into flux](../../helm-publish/README.md#wiring-it-into-flux).
