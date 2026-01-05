# Helm Deploy Action

A composite GitHub Action that deploys Helm charts to Azure AKS clusters. This action can be used directly in workflows or extended with custom logic.

## Features

- Deploy Helm charts from local paths with OCI dependencies
- Azure AKS authentication with service principal
- OCI registry login for chart dependencies
- Flexible values configuration (files, set, set-string)
- Dry-run capability for testing deployments
- Atomic deployments with automatic rollback on failure
- Detailed deployment summary output
- Extensible for custom workflows

## Usage

### Basic Usage

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Deploy Helm chart
    uses: hmcts/cnp-githubactions-library/helm-deploy@main
    with:
      cluster-name: my-aks-cluster
      resource-group: my-resource-group
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      release-name: my-app
      namespace: production
      chart: ./charts/my-app
```

### Deploy with Values Files

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Deploy Helm chart
    uses: hmcts/cnp-githubactions-library/helm-deploy@main
    with:
      cluster-name: my-aks-cluster
      resource-group: my-resource-group
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      release-name: my-app
      namespace: production
      chart: ./charts/my-app
      values-files: charts/my-app/values.yaml,charts/my-app/values.prod.yaml
      set: |
        global.environment=production
        ingress.enabled=true
      set-string: |
        image=${{ github.sha }}
```

### Deploy with OCI Dependencies

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Deploy Helm chart
    uses: hmcts/cnp-githubactions-library/helm-deploy@main
    with:
      cluster-name: my-aks-cluster
      resource-group: my-resource-group
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      release-name: my-app
      namespace: production
      chart: ./charts/my-app
      oci-registry: hmctspublic.azurecr.io
      oci-username: ${{ secrets.ACR_USERNAME }}
      oci-password: ${{ secrets.ACR_PASSWORD }}
```

### Dry-Run Deployment

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Test deployment (dry-run)
    uses: hmcts/cnp-githubactions-library/helm-deploy@main
    with:
      cluster-name: my-aks-cluster
      resource-group: my-resource-group
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      release-name: my-app
      namespace: staging
      chart: ./charts/my-app
      dry-run: 'true'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `cluster-name` | Azure AKS cluster name | **Yes** | - |
| `resource-group` | Azure resource group containing the AKS cluster | **Yes** | - |
| `azure-credentials` | Azure service principal credentials (JSON format) | **Yes** | - |
| `release-name` | Helm release name | **Yes** | - |
| `namespace` | Kubernetes namespace for deployment | No | `default` |
| `chart` | Path to the Helm chart (e.g., `./charts/my-app`) | **Yes** | - |
| `values-files` | Comma-separated list of values files | No | - |
| `set` | Set values (newline-delimited key=value pairs) | No | - |
| `set-string` | Set STRING values (newline-delimited key=value pairs) | No | - |
| `timeout` | Time to wait for Kubernetes operations | No | `5m0s` |
| `atomic` | Roll back on failure | No | `true` |
| `wait` | Wait for resources to be ready | No | `true` |
| `dry-run` | Simulate deployment without making changes | No | `false` |
| `oci-registry` | OCI registry URL for chart dependencies | No | - |
| `oci-username` | Username for OCI registry authentication | No | - |
| `oci-password` | Password for OCI registry authentication | No | - |

## Outputs

| Output | Description |
|--------|-------------|
| `release-revision` | Helm release revision number |
| `release-status` | Status of the Helm release (deployed, failed, etc.) |
| `deployment-time` | Time taken for the deployment |

## Advanced Examples

### Environment-Based Deployment

```yaml
name: Deploy to Environment

on:
  push:
    branches: [ main, develop ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Determine environment
        id: env
        run: |
          if [[ "${{ github.ref }}" == "refs/heads/main" ]]; then
            echo "env=production" >> $GITHUB_OUTPUT
            echo "namespace=prod" >> $GITHUB_OUTPUT
          else
            echo "env=staging" >> $GITHUB_OUTPUT
            echo "namespace=staging" >> $GITHUB_OUTPUT
          fi

      - name: Deploy to ${{ steps.env.outputs.env }}
        uses: hmcts/cnp-githubactions-library/helm-deploy@main
        with:
          cluster-name: ${{ secrets.AKS_CLUSTER_NAME }}
          resource-group: ${{ secrets.AKS_RESOURCE_GROUP }}
          azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
          release-name: my-app
          namespace: ${{ steps.env.outputs.namespace }}
          chart: ./charts/my-app
          values-files: charts/my-app/values.yaml,charts/my-app/values.${{ steps.env.outputs.env }}.yaml
          set-string: |
            java.image=${{ github.sha }}
          oci-registry: hmctspublic.azurecr.io
          oci-username: ${{ secrets.ACR_USERNAME }}
          oci-password: ${{ secrets.ACR_PASSWORD }}
```

### Using Outputs for Notifications

```yaml
- name: Deploy Helm chart
  id: deploy
  uses: hmcts/cnp-githubactions-library/helm-deploy@main
  with:
    cluster-name: my-aks-cluster
    resource-group: my-resource-group
    azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
    release-name: my-app
    namespace: production
    chart: ./charts/my-app

- name: Notify deployment
  run: |
    echo "Deployed revision ${{ steps.deploy.outputs.release-revision }}"
    echo "Status: ${{ steps.deploy.outputs.release-status }}"
    echo "Duration: ${{ steps.deploy.outputs.deployment-time }}"
```

## Comparison with Reusable Workflow

| Feature | Composite Action | Reusable Workflow |
|---------|------------------|-------------------|
| **Flexibility** | High - Can be mixed with custom steps | Limited - Self-contained job |
| **Secret Handling** | Direct input required | Built-in secret management |
| **Checkout** | Must be done separately | Optional built-in checkout |
| **Use Case** | Custom workflows with additional logic | Simple, standardised deployments |
| **Extensibility** | Easily extended with pre/post steps | Limited extension capability |

## When to Use

**Use the Composite Action when:**
- You need to add custom steps before or after the deployment
- You want to integrate with other actions in the same job
- You need to use outputs from previous steps
- You want more control over the workflow structure
- You're deploying multiple releases in one job

**Use the Reusable Workflow when:**
- You want a simple, standardised deployment process
- You prefer secret management through workflow_call
- You don't need custom pre/post deployment steps
- You prefer a higher-level abstraction

## Azure Credentials Format

The `azure-credentials` input expects a JSON object with Azure service principal credentials:

```json
{
  "clientId": "<service-principal-app-id>",
  "clientSecret": "<service-principal-secret>",
  "subscriptionId": "<azure-subscription-id>",
  "tenantId": "<azure-tenant-id>"
}
```

## Notes

- Azure login and AKS context are automatically configured
- Helm 3.14.0 is used by default
- Atomic deployments ensure rollback on failure
- Build summaries are added to the GitHub Actions summary page
- Chart dependencies are automatically updated before deployment
