# Helm Deploy with OpenID Action

A composite GitHub Action that deploys Helm charts to Azure AKS clusters with built-in OpenID Connect (OIDC) authentication.

> **Note:** This action handles OIDC authentication internally. Simply provide your Azure client ID and tenant ID, and the action will authenticate with Azure and AKS automatically.

## Features

- OIDC authentication (no stored credentials required)
- Automatic AKS cluster context setup
- OCI registry support for chart dependencies
- Values file templating with `envsubst`
- Subchart dependency management
- HMCTS global values injection
- Dry-run capability
- Atomic deployments with automatic rollback
- Detailed deployment summary output

## Usage

### Basic Usage (with OIDC Reusable Workflow)

```yaml
name: Deploy to AKS

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

### Direct Composite Action Usage (OIDC handled internally)

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Deploy to AKS
        uses: hmcts/cnp-githubactions-library/helm-deploy-openid@main
        with:
          azure-client-id: ${{ vars.AZURE_CLIENT_ID }}
          azure-tenant-id: ${{ vars.AZURE_TENANT_ID }}
          environment: cft-preview-01
          team-name: my-team
          application-name: my-app
          release-name: my-app
          chart: ./charts/my-app
```

### Extended Usage with Pre/Post Steps

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run pre-deployment checks
        run: |
          helm lint ./charts/my-app
          kubectl cluster-info --context my-cluster

      - name: Deploy to AKS
        id: deploy
        uses: hmcts/cnp-githubactions-library/helm-deploy-openid@main
        with:
          azure-client-id: ${{ vars.AZURE_CLIENT_ID }}
          environment: cft-preview-01
          team-name: my-team
          application-name: my-app
          release-name: my-app
          chart: ./charts/my-app
          values-files: ./charts/my-app/values-aat.yaml
          set: |
            image.tag=${{ github.sha }}
            replicas=3

      - name: Run smoke tests
        run: |
          ./scripts/smoke-test.sh ${{ steps.deploy.outputs.release-status }}
```

### Multi-Environment Deployment

```yaml
name: Deploy to Multiple Environments

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    strategy:
      matrix:
        environment:
          - name: preview
            prefix: cft-preview-01
          - name: aat
            prefix: cft-aat-00
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Deploy to ${{ matrix.environment.name }}
        uses: hmcts/cnp-githubactions-library/helm-deploy-openid@main
        with:
          azure-client-id: ${{ vars.AZURE_CLIENT_ID }}
          environment: ${{ matrix.environment.prefix }}
          team-name: my-team
          application-name: my-app
          release-name: my-app
          chart: ./charts/my-app
          values-files: ./charts/my-app/values-${{ matrix.environment.name }}.yaml
```

### Using Values Template

```yaml
- name: Deploy with templated values
  uses: hmcts/cnp-githubactions-library/helm-deploy-openid@main
  env:
    DB_HOST: mydb.postgres.database.azure.com
    REDIS_HOST: myredis.redis.cache.windows.net
  with:
    azure-client-id: ${{ vars.AZURE_CLIENT_ID }}
    environment: cft-preview-01
    team-name: my-team
    application-name: my-app
    release-name: my-app
    chart: ./charts/my-app
    values-template: ./charts/my-app/values.template.yaml
```

### With OCI Registry Dependencies

```yaml
- name: Deploy with OCI chart dependencies
  uses: hmcts/cnp-githubactions-library/helm-deploy-openid@main
  with:
    azure-client-id: ${{ vars.AZURE_CLIENT_ID }}
    environment: cft-preview-01
    team-name: my-team
    application-name: my-app
    release-name: my-app
    chart: ./charts/my-app
    oci-registry: hmctspublic.azurecr.io
    oci-username: ${{ secrets.ACR_USERNAME }}
    oci-password: ${{ secrets.ACR_PASSWORD }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `azure-client-id` | Azure client ID for OIDC authentication | **Yes** | - |
| `azure-tenant-id` | Azure tenant ID for OIDC authentication | No | `531ff96d-0ae9-462a-8d2d-bec7c0b42082` |
| `environment` | Azure environment prefix (e.g., cft-preview-01). Derives cluster as `{environment}-aks` and resource group as `{environment}-rg` | **Yes** | - |
| `team-name` | Team name for Azure resource tagging | **Yes** | - |
| `application-name` | Application name for Azure resource tagging | **Yes** | - |
| `release-name` | Helm release name | **Yes** | - |
| `chart` | Path to the Helm chart | **Yes** | - |
| `namespace` | Kubernetes namespace for deployment | No | `default` |
| `values-files` | Comma-separated list of values files | No | - |
| `set` | Set values on command line (newline-delimited key=value) | No | - |
| `set-string` | Set STRING values (newline-delimited key=value) | No | - |
| `timeout` | Time to wait for operations | No | `5m0s` |
| `dry-run` | Simulate deployment without changes | No | `false` |
| `oci-registry` | OCI registry URL for chart dependencies | No | - |
| `oci-username` | Username for OCI registry | No | - |
| `oci-password` | Password for OCI registry | No | - |
| `values-template` | Path to values template file for envsubst | No | - |
| `subchart-paths` | Glob pattern for subchart directories | No | - |

## Outputs

| Output | Description |
|--------|-------------|
| `release-revision` | Helm release revision number |
| `release-status` | Status of the Helm release (deployed, failed, etc.) |
| `deployment-time` | Time taken for the deployment |

## Using Outputs

```yaml
- name: Deploy
  id: deploy
  uses: hmcts/cnp-githubactions-library/helm-deploy-openid@main
  with:
    azure-client-id: ${{ vars.AZURE_CLIENT_ID }}
    environment: cft-preview-01
    team-name: my-team
    application-name: my-app
    release-name: my-app
    chart: ./charts/my-app

- name: Check deployment
  run: |
    echo "Revision: ${{ steps.deploy.outputs.release-revision }}"
    echo "Status: ${{ steps.deploy.outputs.release-status }}"
    echo "Duration: ${{ steps.deploy.outputs.deployment-time }}"
```

## HMCTS Global Values

This action automatically injects HMCTS-specific global values:

```yaml
global:
  tenantId: 531ff96d-0ae9-462a-8d2d-bec7c0b42082
  environment: aat
  enableKeyVaults: true
  disableTraefikTls: false
  tags:
    teamName: <from team-name input>
    applicationName: <from application-name input>
    builtFrom: <github repository URL>
    businessArea: CFT
    environment: aat
```

These can be overridden using the `set` input.

## Comparison with Reusable Workflow

| Feature | Composite Action | Reusable Workflow |
|---------|------------------|-------------------|
| **Flexibility** | High - mix with custom steps | Limited - self-contained job |
| **Checkout** | Must be done separately | Optional built-in checkout |
| **Use Case** | Custom workflows with additional logic | Simple, standardized deployments |
| **Extensibility** | Easily extended with pre/post steps | Limited extension capability |

## When to Use

**Use the Composite Action when:**
- You need flexibility and control over the workflow structure
- You want to add custom steps before or after deployment
- You're deploying multiple releases in one job
- You need environment-specific deployment logic
- You want to use outputs from previous steps

**Use the Reusable Workflow when:**
- You want a simple, one-line deployment
- You prefer a higher-level abstraction
- You don't need custom pre/post deployment steps
- You want optional repository checkout built-in

## Prerequisites

- Azure subscription with AKS cluster
- Service principal with OIDC federation configured
- Helm chart in your repository
- GitHub Actions job with `permissions: { id-token: write }`

## Notes

- **OIDC Authentication:** This action handles all OIDC authentication internally
  - Azure CLI login is performed automatically using your client ID and tenant ID
  - AKS credentials are fetched automatically
  - No need for external authentication setup
- The `--atomic` flag is always used, ensuring automatic rollback on failure
- Helm version 3.14.0 is used by default
- Build summaries are added to the GitHub Actions summary page
