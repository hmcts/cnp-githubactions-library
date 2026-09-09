# Helm Publish

Packages Helm charts and pushes them to an HMCTS Azure Container Registry, versioning them so that **the newest build always resolves highest**.

This exists for repositories that do not use the standard CNP Jenkins pipeline. A Jenkins-built service gets its chart published to [`hmcts/hmcts-charts`](https://github.com/hmcts/hmcts-charts) as `stable/<chart-name>`, and flux reads it from there — see [GitOps](https://hmcts.github.io/cloud-native-platform/new-component/gitops-flux.html#application-config-in-flux). Nothing in GitHub Actions writes to that repository, so a GitHub Actions service has to publish its chart to a registry instead and point flux at that. This action does the publishing half; [Wiring it into flux](#wiring-it-into-flux) covers the other half, which is where the traps are.

## Usage

```yaml
- uses: hmcts/cnp-githubactions-library/helm-publish@main
  with:
    azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
    chart: helm/my-app
```

A monorepo publishing several subcharts plus an umbrella chart:

```yaml
- uses: hmcts/cnp-githubactions-library/helm-publish@main
  id: publish
  with:
    azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
    chart-paths: 'apps/*/helm'
    chart: helm/my-monorepo
    helm-repos: |
      bitnami=https://charts.bitnami.com/bitnami
```

Subcharts are published before the umbrella chart, because the umbrella's dependencies have to exist in the registry before it can be packaged.

The job needs `id-token: write` for OIDC, and `contents: read`.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `azure-client-id` | no | — | Client ID for OIDC login. Leave empty if the job has already run `azure/login` and `az acr login`. |
| `azure-tenant-id` | no | HMCTS tenant | Tenant ID for OIDC login. |
| `registry` | no | `hmctsprod.azurecr.io` | Charts land under `<registry>/helm/<chart-name>`. |
| `chart` | no | — | Path to one chart. |
| `chart-paths` | no | — | Glob matching several chart directories, for monorepos. |
| `short-sha` | no | first 7 of `github.sha` | Short SHA recorded in the version. |
| `helm-repos` | no | — | Chart repositories to add first, one `name=url` per line. |
| `helm-version` | no | `v3.14.0` | Version of Helm to use. |
| `dry-run` | no | `false` | Package and report, but do not push. |

Set `chart`, `chart-paths`, or both. Setting neither fails.

## Outputs

| Output | Description |
| --- | --- |
| `version-suffix` | The prerelease suffix shared by every chart in the run, e.g. `t20260909150000.gabc1234`. |
| `chart-version` | Full version that `chart` was published as. Empty when only `chart-paths` was used. |
| `charts-published` | Space-separated `name=version` pairs for every chart pushed. |

Charts in one repository often carry different `version:` values, so there is no single "the version" — each chart is published as **its own** `Chart.yaml` version plus the shared suffix. `version-suffix` is the only value common to all of them; `charts-published` gives you the exact version of each.

## How charts are versioned, and why it looks odd

A chart is published as `<Chart.yaml version>-t<timestamp>.g<short-sha>`:

```
0.0.1-t20260909150000.gabc1234
```

The two letter prefixes are not decoration. Both are load-bearing, and getting either wrong produces a deployment that is silently months out of date while reporting healthy.

**Why not `0.0.1-<short-sha>`?** Because that is what several HMCTS repositories did, and it does not work. Semver compares prerelease identifiers **lexically**, so a flux range like `>=0.0.1-0` resolves to whichever SHA sorts highest — not the newest build. One HMCTS app spent six months deploying a chart from `0.0.1-fd3c4e1` in preference to 28 later publishes, because `f` was the highest leading hex character anyone had happened to commit. Every subsequent build published a chart that could never be selected.

**Why `t<timestamp>` and not a bare timestamp?** Because semver ranks **numeric identifiers below alphanumeric ones**. `0.0.1-20260909150000` sorts *beneath* every existing hex SHA, so switching to a bare timestamp fixes nothing while charts published under the old scheme still exist. A leading `t` is above `f`, so it outranks any hex SHA already in the registry, and the fixed-width digits after it keep ordering monotonic from then on.

**Why `g<short-sha>` and not a bare SHA?** Because a 7-character SHA that happens to be all decimal digits with a leading zero — `0123456` — is an invalid semver numeric identifier, and `helm package` rejects it outright. That is roughly 1 build in 270. The `g` is the `git describe` convention.

The timestamp is generated once per run, so every chart in a monorepo shares a suffix and you can tell at a glance which charts came from the same build.

## Wiring it into flux

Publishing correctly is not sufficient — the `HelmRelease` in [`cnp-flux-config`](https://github.com/hmcts/cnp-flux-config) has to be able to see the new chart.

**Pin the exact version. Do not use a range.**

```yaml
  chart:
    spec:
      chart: my-app
      version: "0.0.1-t20260909150000.gabc1234"
      sourceRef:
        kind: HelmRepository
        name: hmctsprod-oci
        namespace: flux-system
      interval: 1m
```

A `version:` range against an OCI `HelmRepository` is **only re-resolved when source-controller restarts**. Measured on both AAT clusters, every OCI-sourced `HelmChart` artifact is stamped at its source-controller pod's start time and never updated again — a chart published at 10:57 was still deploying the previous version four hours later, with `interval: 1m` and the `HelmChart` reporting `Ready` and `ChartPullSucceeded`. There is no error to notice.

Changing `version:` is a spec change, so flux re-resolves it within a minute of the commit landing. That is why the majority of OCI-sourced releases in `cnp-flux-config` pin an exact version, and it is the only way to get a prompt, predictable deploy from a registry-published chart.

That does mean a commit to `cnp-flux-config` per chart change. If you would rather not, the alternative is to move the service onto the standard Jenkins pipeline and get `hmcts-charts` publishing for free.
