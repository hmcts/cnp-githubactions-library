# Terraform Deploy Action

A composite GitHub Action that runs Terraform plan and optionally apply for infrastructure changes using Azure service principal authentication.

## Features

- Full Terraform plan/apply workflow
- Azure service principal authentication
- Automatic backend configuration for HMCTS state storage
- PR comment with plan output (idempotent updates)
- Environment tag mapping for Azure policy compliance
- Product name extraction from Helm Chart.yaml
- Detailed GitHub Actions summary

## Usage

### Basic Usage

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Terraform Deploy
    uses: hmcts/cnp-githubactions-library/terraform-deploy@main
    with:
      environment: aat
      subscription: DCD-CNP-DEV
      aks-subscription: DCD-CFTAPPS-STG
      storage-account: nonprod
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      product: my-product
```

### With Helm Chart Product Extraction

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Terraform Deploy
    uses: hmcts/cnp-githubactions-library/terraform-deploy@main
    with:
      environment: aat
      subscription: DCD-CNP-DEV
      aks-subscription: DCD-CFTAPPS-STG
      storage-account: nonprod
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      helm-chart-path: helm/myapp/Chart.yaml
```

### Plan Only Mode

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Terraform Plan
    uses: hmcts/cnp-githubactions-library/terraform-deploy@main
    with:
      environment: aat
      subscription: DCD-CNP-DEV
      aks-subscription: DCD-CFTAPPS-STG
      storage-account: nonprod
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      product: my-product
      plan-only: 'true'
```

### Custom Working Directory

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Terraform Deploy
    uses: hmcts/cnp-githubactions-library/terraform-deploy@main
    with:
      environment: prod
      subscription: DCD-CNP-PROD
      aks-subscription: DCD-CFTAPPS-PROD
      storage-account: prod
      azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
      product: my-product
      working-directory: terraform/environments/prod
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `environment` | Target environment (e.g., aat, prod) | **Yes** | - |
| `subscription` | Azure subscription name (e.g., DCD-CNP-DEV) | **Yes** | - |
| `aks-subscription` | Azure subscription name for AKS cluster | **Yes** | - |
| `storage-account` | Storage account postfix (nonprod, prod) | **Yes** | - |
| `azure-credentials` | Azure service principal credentials (JSON) | **Yes** | - |
| `working-directory` | Terraform working directory | No | `infrastructure` |
| `plan-only` | Run plan only, skip apply | No | `false` |
| `product` | Product name | No | Extracted from helm-chart-path |
| `helm-chart-path` | Path to Chart.yaml for product extraction | No | - |
| `business-area` | Business area tag (CFT, SDS, etc.) | No | `CFT` |
| `post-plan-to-pr` | Post plan output to PR comment | No | `true` |

## Outputs

| Output | Description |
|--------|-------------|
| `plan-exitcode` | Terraform plan exit code (0=no changes, 2=changes) |
| `has-changes` | Boolean indicating if plan has changes |

## Azure Backend Configuration

The action automatically configures the Azure storage backend using HMCTS naming conventions:

| Parameter | Pattern |
|-----------|---------|
| `storage_account_name` | `mgmtstatestore{storage-account}` |
| `resource_group_name` | `mgmt-state-store-{storage-account}` |
| `container_name` | `mgmtstatestorecontainer{environment}` |
| `key` | `{repository-name}/{environment}/terraform.tfstate` |

## Environment Tag Mapping

The action maps environment names to Azure policy-compliant values:

| Input | Tag Value |
|-------|-----------|
| `prod`, `production` | `production` |
| `aat`, `stg`, `staging` | `staging` |
| `dev`, `development` | `development` |
| `test`, `testing` | `testing` |
| `demo` | `demo` |
| `ithc` | `ithc` |
| `sbox`, `sandbox` | `sandbox` |

## Terraform Variables

The action passes the following variables to Terraform:

| Variable | Source |
|----------|--------|
| `env` | `environment` input |
| `product` | `product` input or extracted from Chart.yaml |
| `subscription` | Resolved subscription ID |
| `aks_subscription_id` | Resolved AKS subscription ID |
| `tenant_id` | Azure tenant ID from login context |
| `builtFrom` | `github.repository` |
| `ci_service_principal_object_id` | Service principal object ID |
| `common_tags` | Auto-generated (written to terraform.auto.tfvars) |

## PR Comments

When running on a pull request with changes detected, the action posts a comment with the plan output:

- Comments are idempotent (updates existing comment rather than creating duplicates)
- Plan output is truncated to 60KB if too large
- Each environment gets its own comment marker

## Prerequisites

- `.terraform-version` file in the working directory
- Azure service principal with appropriate permissions
- Terraform state storage account configured

## Notes

- Uses `terraform_wrapper: false` to preserve exit codes
- Exit code 0 = no changes, 2 = changes detected, 1 = error
- The action will fail if product cannot be determined
