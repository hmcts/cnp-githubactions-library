# Helm Deploy Workflow

Deploy Helm charts to Azure AKS clusters with support for OCI dependencies and flexible configuration.

**Workflow File:** `.github/workflows/helm-deploy.yaml`

> **Need More Flexibility?** This reusable workflow is great for simple, standardised deployments. If you need to add custom steps before/after the deployment or integrate with other actions, check out the [composite action](../../helm-deploy/README.md) which provides the same core logic in a more flexible format.

## Features

- Deploy Helm charts from local paths with OCI dependencies
- Flexible authentication (inputs or secrets)
- Azure AKS integration with service principal
- OCI registry login for chart dependencies
- Flexible values configuration (files, set, set-string)
- Dry-run capability for testing deployments
- Atomic deployments with automatic rollback on failure
- Detailed deployment summary output

## When to Use

**Use this reusable workflow when:**
- You want a simple, standardised deployment process
- You prefer secret management through workflow_call
- You don't need custom pre/post deployment steps

**Use the [composite action](../../helm-deploy/README.md) when:**
- You need to add custom steps before or after the deployment
- You want to integrate with other actions in the same job
- You need more control over the workflow structure
- You're deploying multiple releases in one job

## Example Usage

```yaml
name: Deploy Application

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy.yaml@main
    with:
      release-name: my-application
      namespace: production
      chart: ./charts/my-app
      values-files: charts/my-app/values.yaml,charts/my-app/values.prod.yaml
      set-string: |
        java.image=${{ github.sha }}
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
      AKS_CLUSTER_NAME: ${{ secrets.AKS_CLUSTER_NAME }}
      AKS_RESOURCE_GROUP: ${{ secrets.AKS_RESOURCE_GROUP }}
      OCI_REGISTRY: ${{ secrets.ACR_LOGIN_SERVER }}
      OCI_USERNAME: ${{ secrets.ACR_USERNAME }}
      OCI_PASSWORD: ${{ secrets.ACR_PASSWORD }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `cluster-name` | AKS cluster name | No | Uses `AKS_CLUSTER_NAME` secret |
| `resource-group` | Azure resource group | No | Uses `AKS_RESOURCE_GROUP` secret |
| `release-name` | Helm release name | **Yes** | - |
| `namespace` | Kubernetes namespace | No | `default` |
| `chart` | Path to the Helm chart | **Yes** | - |
| `values-files` | Comma-separated values files | No | - |
| `set` | Set values (newline-delimited key=value) | No | - |
| `set-string` | Set STRING values | No | - |
| `timeout` | Timeout for Kubernetes operations | No | `5m0s` |
| `atomic` | Roll back on failure | No | `true` |
| `wait` | Wait for resources to be ready | No | `true` |
| `dry-run` | Simulate deployment | No | `false` |
| `oci-registry` | OCI registry URL | No | Uses `OCI_REGISTRY` secret |
| `oci-username` | OCI registry username | No | Uses `OCI_USERNAME` secret |
| `oci-password` | OCI registry password | No | Uses `OCI_PASSWORD` secret |
| `runner` | GitHub runner to use | No | `ubuntu-latest` |
| `checkout-repository` | Checkout the repository | No | `true` |

## Secrets

| Secret | Description | Required |
|--------|-------------|----------|
| `AZURE_CREDENTIALS` | Azure service principal credentials (JSON) | **Yes** |
| `AKS_CLUSTER_NAME` | AKS cluster name | No (if provided via input) |
| `AKS_RESOURCE_GROUP` | Azure resource group | No (if provided via input) |
| `OCI_REGISTRY` | OCI registry URL | No (if provided via input) |
| `OCI_USERNAME` | OCI registry username | No (if provided via input) |
| `OCI_PASSWORD` | OCI registry password | No (if provided via input) |

## Outputs

| Output | Description |
|--------|-------------|
| `release-revision` | Helm release revision number |
| `release-status` | Status of the Helm release |
| `deployment-time` | Time taken for the deployment |

## Common Use Cases

### Basic Deployment

```yaml
jobs:
  deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy.yaml@main
    with:
      release-name: my-app
      chart: ./charts/my-app
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
      AKS_CLUSTER_NAME: ${{ secrets.AKS_CLUSTER_NAME }}
      AKS_RESOURCE_GROUP: ${{ secrets.AKS_RESOURCE_GROUP }}
```

### Deploy with OCI Dependencies

```yaml
jobs:
  deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy.yaml@main
    with:
      release-name: my-app
      namespace: production
      chart: ./charts/my-app
      values-files: charts/my-app/values.yaml,charts/my-app/values.prod.yaml
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
      AKS_CLUSTER_NAME: ${{ secrets.AKS_CLUSTER_NAME }}
      AKS_RESOURCE_GROUP: ${{ secrets.AKS_RESOURCE_GROUP }}
      OCI_REGISTRY: ${{ secrets.ACR_LOGIN_SERVER }}
      OCI_USERNAME: ${{ secrets.ACR_USERNAME }}
      OCI_PASSWORD: ${{ secrets.ACR_PASSWORD }}
```

### Deploy with Values Override

```yaml
jobs:
  deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy.yaml@main
    with:
      release-name: my-app
      namespace: production
      chart: ./charts/my-app
      values-files: charts/my-app/values.yaml,charts/my-app/values.prod.yaml
      set: |
        global.environment=production
        ingress.enabled=true
      set-string: |
        java.image=${{ github.sha }}
        java.ingressHost=my-app.service.core-compute-prod.internal
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
      AKS_CLUSTER_NAME: ${{ secrets.AKS_CLUSTER_NAME }}
      AKS_RESOURCE_GROUP: ${{ secrets.AKS_RESOURCE_GROUP }}
```

### Dry-Run Deployment (Testing)

```yaml
jobs:
  test-deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy.yaml@main
    with:
      release-name: my-app
      namespace: staging
      chart: ./charts/my-app
      dry-run: true
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
      AKS_CLUSTER_NAME: ${{ secrets.AKS_CLUSTER_NAME }}
      AKS_RESOURCE_GROUP: ${{ secrets.AKS_RESOURCE_GROUP }}
```

### Deploy to Multiple Environments

```yaml
name: Deploy to Environments

on:
  push:
    branches: [ main ]

jobs:
  deploy-staging:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy.yaml@main
    with:
      release-name: my-app
      namespace: staging
      chart: ./charts/my-app
      values-files: charts/my-app/values.yaml,charts/my-app/values.staging.yaml
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
      AKS_CLUSTER_NAME: ${{ secrets.AKS_CLUSTER_NAME_STAGING }}
      AKS_RESOURCE_GROUP: ${{ secrets.AKS_RESOURCE_GROUP_STAGING }}
      OCI_REGISTRY: ${{ secrets.ACR_LOGIN_SERVER }}
      OCI_USERNAME: ${{ secrets.ACR_USERNAME }}
      OCI_PASSWORD: ${{ secrets.ACR_PASSWORD }}

  deploy-production:
    needs: deploy-staging
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy.yaml@main
    with:
      release-name: my-app
      namespace: production
      chart: ./charts/my-app
      values-files: charts/my-app/values.yaml,charts/my-app/values.prod.yaml
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
      AKS_CLUSTER_NAME: ${{ secrets.AKS_CLUSTER_NAME_PROD }}
      AKS_RESOURCE_GROUP: ${{ secrets.AKS_RESOURCE_GROUP_PROD }}
      OCI_REGISTRY: ${{ secrets.ACR_LOGIN_SERVER }}
      OCI_USERNAME: ${{ secrets.ACR_USERNAME }}
      OCI_PASSWORD: ${{ secrets.ACR_PASSWORD }}
```

## Notes

- The workflow uses Azure service principal authentication with AKS
- Authentication can be provided via inputs or secrets (inputs take priority)
- Helm 3.14.0 is used by default
- Atomic deployments ensure automatic rollback on failure
- Deployment summaries are added to the GitHub Actions summary page
- Chart dependencies are automatically updated before deployment
