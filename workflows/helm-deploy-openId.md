# Helm Deploy (OpenID) Reusable Workflow

A reusable GitHub Actions workflow that deploys Helm charts to Azure AKS clusters using OpenID Connect (OIDC) authentication.

> **Note:** This workflow uses OIDC authentication - no stored Azure credentials required. Simply provide your Azure client ID and tenant ID.

## When to Use

Use this workflow when:
- You want to use OIDC authentication (no stored credentials)
- You want a simple, one-line deployment in your workflow
- You don't need custom steps before or after deployment
- You prefer the higher-level abstraction of a reusable workflow

For more flexibility (custom pre/post steps), use the [helm-deploy-openid composite action](../helm-deploy-openid/README.md) directly.

## Prerequisites

1. Azure service principal with OIDC federation configured
2. Store the client ID in a GitHub variable (e.g., `vars.AZURE_CLIENT_ID`)
3. No secrets required for Azure authentication

## Usage

### Basic Usage

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy-openId.yaml@main
    with:
      azureClientId: ${{ vars.AZURE_CLIENT_ID }}
      environment: cft-preview-01
      team-name: my-team
      application-name: my-app
      release-name: my-app
      chart: ./charts/my-app
```

### With Values Files and Overrides

```yaml
jobs:
  deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy-openId.yaml@main
    with:
      azureClientId: ${{ vars.AZURE_CLIENT_ID }}
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
```

### With Custom Tenant ID

```yaml
jobs:
  deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy-openId.yaml@main
    with:
      azureClientId: ${{ vars.AZURE_CLIENT_ID }}
      azureTenantId: ${{ vars.AZURE_TENANT_ID }}
      environment: cft-preview-01
      team-name: my-team
      application-name: my-app
      release-name: my-app
      chart: ./charts/my-app
```

### With OCI Registry Dependencies

```yaml
jobs:
  deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy-openId.yaml@main
    with:
      azureClientId: ${{ vars.AZURE_CLIENT_ID }}
      environment: cft-preview-01
      team-name: my-team
      application-name: my-app
      release-name: my-app
      chart: ./charts/my-app
      oci-registry: hmctspublic.azurecr.io
      oci-username: ${{ secrets.ACR_USERNAME }}
      oci-password: ${{ secrets.ACR_PASSWORD }}
```

### Dry Run

```yaml
jobs:
  dry-run:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy-openId.yaml@main
    with:
      azureClientId: ${{ vars.AZURE_CLIENT_ID }}
      environment: cft-preview-01
      team-name: my-team
      application-name: my-app
      release-name: my-app
      chart: ./charts/my-app
      dry-run: true
```

### Multi-Environment Matrix

```yaml
name: Deploy to Environments

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    strategy:
      matrix:
        env: [preview, aat, prod]
        include:
          - env: preview
            environment: cft-preview-01
          - env: aat
            environment: cft-aat-00
          - env: prod
            environment: cft-prod-00
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy-openId.yaml@main
    with:
      azureClientId: ${{ vars.AZURE_CLIENT_ID }}
      environment: ${{ matrix.environment }}
      team-name: my-team
      application-name: my-app
      release-name: my-app
      chart: ./charts/my-app
      values-files: ./charts/my-app/values-${{ matrix.env }}.yaml
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `azureClientId` | Azure client ID for OIDC authentication | **Yes** | - |
| `azureTenantId` | Azure tenant ID | No | `531ff96d-0ae9-462a-8d2d-bec7c0b42082` |
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
| `oci-registry` | OCI registry URL | No | - |
| `oci-username` | OCI username | No | - |
| `oci-password` | OCI password | No | - |
| `values-template` | Path to values template for envsubst | No | - |
| `subchart-paths` | Glob pattern for subchart directories | No | - |
| `runner` | GitHub runner to use | No | `ubuntu-latest` |
| `checkout-repository` | Whether to checkout the repository | No | `true` |

## Outputs

| Output | Description |
|--------|-------------|
| `release-revision` | Helm release revision number |
| `release-status` | Status of the Helm release |
| `deployment-time` | Time taken for the deployment |

## Using Outputs

```yaml
jobs:
  deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy-openId.yaml@main
    with:
      azureClientId: ${{ vars.AZURE_CLIENT_ID }}
      environment: cft-preview-01
      team-name: my-team
      application-name: my-app
      release-name: my-app
      chart: ./charts/my-app

  notify:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - name: Report deployment
        run: |
          echo "Deployed revision: ${{ needs.deploy.outputs.release-revision }}"
          echo "Status: ${{ needs.deploy.outputs.release-status }}"
```

## Comparison with Service Principal Workflow

| Feature | OpenID Workflow | Service Principal Workflow |
|---------|-----------------|---------------------------|
| **Authentication** | OIDC (keyless) | JSON credentials secret |
| **Secrets required** | None for Azure auth | `AZURE_CREDENTIALS` |
| **Security** | Short-lived tokens | Long-lived credentials |
| **Setup complexity** | Requires OIDC federation | Simpler initial setup |

## Related Resources

- [helm-deploy workflow](./helm-deploy.md) - Service principal authentication version
- [helm-deploy-openid composite action](../helm-deploy-openid/README.md) - For custom workflows with pre/post steps
- [helm-deploy composite action](../helm-deploy/README.md) - Service principal composite action
