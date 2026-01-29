````markdown
# Terraform Deploy (OpenID) Workflow

Run Terraform plan and optionally apply for infrastructure changes using Azure OIDC (OpenID Connect) authentication.

**Workflow File:** `.github/workflows/terraform-deploy-openId.yaml`

> **Need More Flexibility?** This reusable workflow is great for simple, standardized deployments. If you need to add custom steps before/after the deployment or integrate with other actions, check out the [composite action](../../terraform-deploy-openid/README.md) which provides the same core logic in a more flexible format.

## Features

- Full Terraform plan/apply workflow
- Azure OIDC authentication (no secrets required)
- Automatic backend configuration for HMCTS state storage
- PR comment with plan output (idempotent updates)
- Environment tag mapping for Azure policy compliance
- Product name extraction from Helm Chart.yaml
- Detailed GitHub Actions summary

## When to Use

**Use this reusable workflow when:**
- You want a simple, standardized Terraform deployment
- You prefer OIDC authentication (no long-lived secrets)
- You don't need custom pre/post deployment steps
- You want optional repository checkout

**Use the [composite action](../../terraform-deploy-openid/README.md) when:**
- You need to add custom steps before or after the deployment
- You want to integrate with other actions in the same job
- You need more control over the workflow structure
- You're running multiple Terraform operations in one job

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

## Notes

- Uses the `terraform-deploy-openid` composite action internally
- Exit code 0 = no changes, 2 = changes detected, 1 = error
- PR comments are idempotent (updates existing comment rather than creating duplicates)
- Plan output is truncated to 60KB if too large
- The default tenant ID is the HMCTS tenant
````
