# Helm Deploy Reusable Workflow

A reusable GitHub Actions workflow that deploys Helm charts to Azure AKS clusters using service principal authentication.

> **Note:** This workflow uses traditional Azure service principal credentials (JSON format). For OIDC-based authentication without stored secrets, use the [helm-deploy-openId](./helm-deploy-openId.md) workflow instead.

## When to Use

Use this workflow when:
- You have Azure service principal credentials stored as a secret
- You want a simple, one-line deployment in your workflow
- You don't need custom steps before or after deployment
- You prefer the higher-level abstraction of a reusable workflow

For more flexibility (custom pre/post steps), use the [helm-deploy composite action](../helm-deploy/README.md) directly.

## Usage

### Basic Usage

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

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

### With Values Files and Overrides

```yaml
jobs:
  deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy.yaml@main
    with:
      environment: cft-aat-00
      team-name: my-team
      application-name: my-app
      release-name: my-app
      chart: ./charts/my-app
      namespace: my-namespace
      values-files: ./charts/my-app/values-aat.yaml
      set: |
        image.tag=${{ github.sha }}
        replicas=3
      timeout: 10m0s
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
```

### With OCI Registry Dependencies

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
      OCI_REGISTRY: hmctspublic.azurecr.io
      OCI_USERNAME: ${{ secrets.ACR_USERNAME }}
      OCI_PASSWORD: ${{ secrets.ACR_PASSWORD }}
```

### Dry Run

```yaml
jobs:
  dry-run:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy.yaml@main
    with:
      environment: cft-preview-01
      team-name: my-team
      application-name: my-app
      release-name: my-app
      chart: ./charts/my-app
      dry-run: true
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `environment` | Azure environment prefix (e.g., cft-preview-01). Derives cluster as `{environment}-aks` | **Yes** | - |
| `team-name` | Team name for Azure resource tagging | **Yes** | - |
| `application-name` | Application name for Azure resource tagging | **Yes** | - |
| `release-name` | Helm release name | **Yes** | - |
| `chart` | Path to the Helm chart | **Yes** | - |
| `namespace` | Kubernetes namespace | No | `default` |
| `values-files` | Comma-separated list of values files | No | - |
| `set` | Set values (newline-delimited key=value) | No | - |
| `set-string` | Set STRING values (newline-delimited key=value) | No | - |
| `timeout` | Time to wait for operations | No | `5m0s` |
| `dry-run` | Simulate deployment | No | `false` |
| `recover-stuck-release` | Roll back or uninstall a release left in a pending state by an interrupted deploy, before upgrading | No | `true` |
| `recovery-timeout` | Time to wait for that rollback or uninstall | No | `4m` |
| `helm-qps` | Queries per second for Helm's Kubernetes client (`HELM_QPS`) | No | `50` |
| `helm-burst-limit` | Client-side throttling burst limit for Helm's Kubernetes client (`HELM_BURST_LIMIT`) | No | `300` |
| `oci-registry` | OCI registry URL (overrides secret) | No | - |
| `oci-username` | OCI username (overrides secret) | No | - |
| `oci-password` | OCI password (overrides secret) | No | - |
| `values-template` | Path to values template for envsubst | No | - |
| `subchart-paths` | Glob pattern for subchart directories | No | - |
| `runner` | GitHub runner to use | No | `ubuntu-latest` |
| `checkout-repository` | Whether to checkout the repository | No | `true` |

## Secrets

| Secret | Description | Required |
|--------|-------------|----------|
| `AZURE_CREDENTIALS` | Azure service principal credentials (JSON) | **Yes** |
| `OCI_REGISTRY` | OCI registry URL | No |
| `OCI_USERNAME` | OCI registry username | No |
| `OCI_PASSWORD` | OCI registry password | No |

## Outputs

| Output | Description |
|--------|-------------|
| `release-revision` | Helm release revision number |
| `release-status` | Status of the Helm release |
| `deployment-time` | Time taken for the deployment |
| `recovery` | What the stuck-release recovery did, if anything: `rollback`, `uninstall`, or empty |

## Using Outputs

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

  notify:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - name: Report deployment
        run: |
          echo "Deployed revision: ${{ needs.deploy.outputs.release-revision }}"
          echo "Status: ${{ needs.deploy.outputs.release-status }}"
```

## Recovering a stuck release

The deploy runs `helm upgrade --install --atomic`. If that is interrupted, by a
cancelled workflow or by the job hitting its own `timeout-minutes`, Helm never
finishes and the release is left in `pending-upgrade`. Every later deploy then
fails with:

```
another operation (install/upgrade/rollback) is in progress
```

and stays broken until someone clears it by hand.

Before upgrading, this action checks for that state and clears it:

- If the release is in `pending-install`, `pending-upgrade` or `pending-rollback`
  and there is more than one revision, it runs `helm rollback` to the last good
  revision.
- If there is only one revision there is no good state to return to, so it
  uninstalls instead. That case means the release never installed successfully.
- Otherwise it does nothing.

Set `recover-stuck-release: false` to skip the check and let the deploy fail.
The step is `continue-on-error`, so a recovery that cannot run does not fail the
deploy: the upgrade then fails on its own with a clearer error.
The `recovery` output reports what happened, so a caller can react to a deploy
that was preceded by an uninstall.

The uninstall deliberately does not pass `--wait`. Azure Service Operator
resources such as blob services and flexible-server databases sit in
`Terminating` for minutes, and waiting on them achieves nothing: the release
secret that blocks the next upgrade has already gone.


The recovery cannot bound itself with `timeout-minutes`, which composite action
steps do not support. Each Helm call it makes carries `--timeout`
`recovery-timeout` instead, so the worst case is roughly twice that value: a
rollback that runs out of time, then the uninstall that follows it.
### Give the job enough time

Set the calling job's `timeout-minutes` higher than the `timeout` you pass here
plus the `recovery-timeout`. Otherwise the job can be killed part-way through the
upgrade, which produces exactly the pending state this recovery exists to clean
up, on every run.

## Related Resources

- [helm-deploy-openId workflow](./helm-deploy-openId.md) - OIDC authentication version
- [helm-deploy composite action](../helm-deploy/README.md) - For custom workflows with pre/post steps
- [helm-deploy-openid composite action](../helm-deploy-openid/README.md) - OIDC composite action
