# Helm Deploy Action

A composite GitHub Action that deploys Helm charts to Azure AKS clusters. This action can be used directly in workflows or extended with custom logic.

## Features

- Deploy Helm charts from local paths with OCI dependencies
- Azure AKS authentication with service principal
- OCI registry login for chart dependencies
- Flexible values configuration (files, set, set-string)
- Values template processing with `envsubst` for environment variable substitution
- Subchart dependency updates for monorepo structures
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
      environment: cft-preview-01
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      release-name: my-app
      namespace: my-team
      chart: ./charts/my-app
```

### Deploy

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Deploy Helm chart
    uses: hmcts/cnp-githubactions-library/helm-deploy@main
    with:
      environment: cft-preview-01
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      release-name: my-app-pr-123
      namespace: my-team
      chart: ./helm/my-app
      values-files: helm/my-app/values.yaml,helm/my-app/values.preview.yaml
      set: |
        global.tenantId=531ff96d-0ae9-462a-8d2d-bec7c0b42082
        global.environment=aat
        global.enableKeyVaults=true
        global.devMode=true
        global.tags.teamName=my-team
        global.tags.applicationName=my-app
        global.tags.builtFrom=https://github.com/hmcts/my-app
        global.tags.businessArea=CFT
        global.tags.environment=development
```

### Deploy with OCI Dependencies

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Deploy Helm chart
    uses: hmcts/cnp-githubactions-library/helm-deploy@main
    with:
      environment: cft-preview-01
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      release-name: my-app
      namespace: my-team
      chart: ./charts/my-app
      oci-registry: hmctspublic.azurecr.io
      oci-username: ${{ secrets.ACR_USERNAME }}
      oci-password: ${{ secrets.ACR_PASSWORD }}
```

### Deploy with Values Template (envsubst)

Use `values-template` to process a template file with environment variable substitution before deployment:

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Deploy Helm chart
    uses: hmcts/cnp-githubactions-library/helm-deploy@main
    env:
      WEB_IMAGE: pr-123-abc1234
      API_IMAGE: pr-123-abc1234
    with:
      environment: cft-preview-01
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      release-name: my-app
      namespace: my-team
      chart: ./charts/my-app
      values-template: ./charts/my-app/values.preview.template.yaml
```

The template file can contain environment variables like `${WEB_IMAGE}` which will be substituted.

### Deploy Monorepo with Subcharts

Use `subchart-paths` to update dependencies for subcharts in a monorepo structure:

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Deploy Helm chart
    uses: hmcts/cnp-githubactions-library/helm-deploy@main
    with:
      environment: cft-preview-01
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      release-name: my-app
      namespace: my-team
      chart: ./helm/my-app
      subchart-paths: apps/*/helm
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
      environment: cft-preview-01
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      release-name: my-app
      namespace: my-team
      chart: ./charts/my-app
      dry-run: 'true'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `environment` | Azure environment prefix (e.g., `cft-preview-01`, `cft-aat-00`). Cluster and resource group are derived as `{environment}-aks` and `{environment}-rg` | **Yes** | - |
| `azure-credentials` | Azure service principal credentials (JSON format) | **Yes** | - |
| `release-name` | Helm release name | **Yes** | - |
| `namespace` | Kubernetes namespace for deployment | No | `default` |
| `chart` | Path to the Helm chart (e.g., `./charts/my-app`) | **Yes** | - |
| `values-files` | Comma-separated list of values files (e.g., `charts/my-app/values.yaml,charts/my-app/values.preview.yaml`) | No | - |
| `values-template` | Path to values template file for `envsubst` processing | No | - |
| `subchart-paths` | Glob pattern for subchart directories to update dependencies (e.g., `apps/*/helm`) | No | - |
| `set` | Set values (newline-delimited key=value pairs, e.g., `global.environment=aat`) | No | - |
| `set-string` | Set STRING values (newline-delimited key=value pairs, e.g., `java.image=${{ github.sha }}`) | No | - |
| `timeout` | Time to wait for Kubernetes operations | No | `5m0s` |
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
            echo "environment=cft-aat-00" >> $GITHUB_OUTPUT
            echo "namespace=my-team" >> $GITHUB_OUTPUT
          else
            echo "environment=cft-preview-01" >> $GITHUB_OUTPUT
            echo "namespace=my-team" >> $GITHUB_OUTPUT
          fi

      - name: Deploy to ${{ steps.env.outputs.environment }}
        uses: hmcts/cnp-githubactions-library/helm-deploy@main
        with:
          environment: ${{ steps.env.outputs.environment }}
          azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
          release-name: my-app
          namespace: ${{ steps.env.outputs.namespace }}
          chart: ./helm/my-app
          values-template: ./helm/my-app/values.preview.template.yaml
          set: |
            global.environment=aat
            global.enableKeyVaults=true
            global.tags.teamName=${{ steps.env.outputs.namespace }}
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
    environment: cft-preview
    azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
    release-name: my-app
    namespace: my-team
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
