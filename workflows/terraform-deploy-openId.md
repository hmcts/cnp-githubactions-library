# Terraform Deploy (OpenID) Workflow

Run Terraform plan and optionally apply for infrastructure changes using Azure OIDC (OpenID Connect) authentication.

**Workflow File:** `.github/workflows/terraform-deploy-openId.yaml`

## Features

- Full Terraform plan/apply workflow
- Azure OIDC authentication (no secrets required)
- Automatic backend configuration for HMCTS state storage
- PR comment with plan output (idempotent updates)
- Environment tag mapping for Azure policy compliance
- Product name extraction from Helm Chart.yaml
- Detailed GitHub Actions summary

## Example Usage

```yaml
name: Infrastructure

on:
  push:
    branches: [main]
    paths:
      - 'infrastructure/**'
  pull_request:
    branches: [main]
    paths:
      - 'infrastructure/**'

jobs:
  terraform:
    uses: hmcts/cnp-githubactions-library/.github/workflows/terraform-deploy-openId.yaml@main
    with:
      environment: aat
      subscription: DCD-CNP-DEV
      aks-subscription: DCD-CFTAPPS-STG
      storage-account: nonprod
      azure-client-id: ${{ vars.AZURE_CLIENT_ID }}
      azure-subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
      plan-only: ${{ github.event_name == 'pull_request' }}
      helm-chart-path: helm/myapp/Chart.yaml
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `environment` | Target environment (e.g., aat, prod) | **Yes** | - |
| `subscription` | Azure subscription name (e.g., DCD-CNP-DEV) | **Yes** | - |
| `aks-subscription` | Azure subscription name for AKS cluster | **Yes** | - |
| `storage-account` | Storage account postfix (nonprod, prod) | **Yes** | - |
| `azure-client-id` | Azure client ID for OIDC authentication | **Yes** | - |
| `azure-tenant-id` | Azure tenant ID for OIDC authentication | No | `531ff96d-0ae9-462a-8d2d-bec7c0b42082` |
| `azure-subscription-id` | Azure subscription ID for OIDC authentication | **Yes** | - |
| `working-directory` | Terraform working directory | No | `infrastructure` |
| `plan-only` | Run plan only, skip apply | No | `false` |
| `product` | Product name | No | Extracted from helm-chart-path |
| `helm-chart-path` | Path to Chart.yaml for product extraction | No | - |
| `business-area` | Business area tag (CFT, SDS, etc.) | No | `CFT` |
| `post-plan-to-pr` | Post plan output to PR comment | No | `true` |
| `runner` | GitHub runner to use | No | `ubuntu-latest` |
| `checkout-repository` | Whether to checkout the repository | No | `true` |

## Outputs

| Output | Description |
|--------|-------------|
| `plan-exitcode` | Terraform plan exit code (0=no changes, 2=changes) |
| `has-changes` | Boolean indicating if plan has changes |

## Common Use Cases

### Plan on PR, Apply on Merge

```yaml
name: Infrastructure

on:
  push:
    branches: [main]
    paths:
      - 'infrastructure/**'
  pull_request:
    branches: [main]
    paths:
      - 'infrastructure/**'

jobs:
  terraform:
    uses: hmcts/cnp-githubactions-library/.github/workflows/terraform-deploy-openId.yaml@main
    with:
      environment: aat
      subscription: DCD-CNP-DEV
      aks-subscription: DCD-CFTAPPS-STG
      storage-account: nonprod
      azure-client-id: ${{ vars.AZURE_CLIENT_ID }}
      azure-subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
      plan-only: ${{ github.event_name == 'pull_request' }}
      product: my-product
```

### Multi-Environment Deployment

```yaml
name: Infrastructure

on:
  push:
    branches: [main]
    paths:
      - 'infrastructure/**'

jobs:
  terraform-aat:
    uses: hmcts/cnp-githubactions-library/.github/workflows/terraform-deploy-openId.yaml@main
    with:
      environment: aat
      subscription: DCD-CNP-DEV
      aks-subscription: DCD-CFTAPPS-STG
      storage-account: nonprod
      azure-client-id: ${{ vars.AZURE_CLIENT_ID_NONPROD }}
      azure-subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID_NONPROD }}
      product: my-product

  terraform-prod:
    needs: terraform-aat
    uses: hmcts/cnp-githubactions-library/.github/workflows/terraform-deploy-openId.yaml@main
    with:
      environment: prod
      subscription: DCD-CNP-PROD
      aks-subscription: DCD-CFTAPPS-PROD
      storage-account: prod
      azure-client-id: ${{ vars.AZURE_CLIENT_ID_PROD }}
      azure-subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID_PROD }}
      product: my-product
```

### With Change Detection

```yaml
name: Infrastructure

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      has-infra-changes: ${{ steps.filter.outputs.infrastructure }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v2
        id: filter
        with:
          filters: |
            infrastructure:
              - 'infrastructure/**'

  terraform:
    needs: detect-changes
    if: needs.detect-changes.outputs.has-infra-changes == 'true'
    uses: hmcts/cnp-githubactions-library/.github/workflows/terraform-deploy-openId.yaml@main
    with:
      environment: aat
      subscription: DCD-CNP-DEV
      aks-subscription: DCD-CFTAPPS-STG
      storage-account: nonprod
      azure-client-id: ${{ vars.AZURE_CLIENT_ID }}
      azure-subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
      plan-only: ${{ github.event_name == 'pull_request' }}
      product: my-product
```

### Using Plan Output in Subsequent Jobs

```yaml
name: Infrastructure

on:
  push:
    branches: [main]

jobs:
  terraform:
    uses: hmcts/cnp-githubactions-library/.github/workflows/terraform-deploy-openId.yaml@main
    with:
      environment: aat
      subscription: DCD-CNP-DEV
      aks-subscription: DCD-CFTAPPS-STG
      storage-account: nonprod
      azure-client-id: ${{ vars.AZURE_CLIENT_ID }}
      azure-subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
      product: my-product

  notify:
    needs: terraform
    if: needs.terraform.outputs.has-changes == 'true'
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack
        run: |
          echo "Infrastructure changes applied"
```

## Comparison with Service Principal Version

| Feature | OpenID (OIDC) | Service Principal |
|---------|---------------|-------------------|
| **Authentication** | Federated identity token | Client secret |
| **Secret Management** | No long-lived secrets | Requires rotating secrets |
| **Setup Complexity** | Requires federated credential setup | Simpler initial setup |
| **Security** | More secure (short-lived tokens) | Less secure (long-lived secrets) |
| **Workflow File** | `terraform-deploy-openId.yaml` | `terraform-deploy.yaml` |

## Azure Backend Configuration

The workflow automatically configures the Azure storage backend using HMCTS naming conventions:

| Parameter | Pattern |
|-----------|---------|
| `storage_account_name` | `mgmtstatestore{storage-account}` |
| `resource_group_name` | `mgmt-state-store-{storage-account}` |
| `container_name` | `mgmtstatestorecontainer{environment}` |
| `key` | `{repository-name}/{environment}/terraform.tfstate` |

## Environment Tag Mapping

The workflow maps environment names to Azure policy-compliant values:

| Input | Tag Value |
|-------|-----------|
| `prod`, `production` | `production` |
| `aat`, `stg`, `staging` | `staging` |
| `dev`, `development` | `development` |
| `test`, `testing` | `testing` |
| `demo` | `demo` |
| `ithc` | `ithc` |
| `sbox`, `sandbox` | `sandbox` |

## Prerequisites

- Azure service principal with federated credentials configured
- GitHub Actions OIDC provider configured in Azure AD
- `.terraform-version` file in the working directory
- Terraform state storage account configured

## Setting Up OIDC Authentication

1. **Create a service principal** in Azure AD

2. **Add federated credentials** for your GitHub repository:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:your-org/your-repo:ref:refs/heads/main` (adjust as needed)
   - Audience: `api://AzureADTokenExchange`

3. **Grant permissions** to the service principal for your Azure resources

4. **Store the client ID and subscription ID** as repository variables (`AZURE_CLIENT_ID`, `AZURE_SUBSCRIPTION_ID`)

## Notes

- Uses the `terraform-deploy-openid` composite action internally
- Exit code 0 = no changes, 2 = changes detected, 1 = error
- PR comments are idempotent (updates existing comment rather than creating duplicates)
- Plan output is truncated to 60KB if too large
- The default tenant ID is the HMCTS tenant
