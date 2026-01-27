# Terraform Deploy with OpenID Action

A composite GitHub Action that runs Terraform plan and optionally apply for infrastructure changes using Azure OIDC (OpenID Connect) authentication.

## Features

- Full Terraform plan/apply workflow
- Azure OIDC authentication (no secrets required)
- Automatic backend configuration for HMCTS state storage
- PR comment with plan output (idempotent updates)
- Environment tag mapping for Azure policy compliance
- Product name extraction from Helm Chart.yaml
- Detailed GitHub Actions summary

## Usage

### Basic Usage

```yaml
jobs:
  terraform:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      pull-requests: write
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Terraform Deploy
        uses: hmcts/cnp-githubactions-library/terraform-deploy-openid@main
        with:
          environment: aat
          subscription: DCD-CNP-DEV
          aks-subscription: DCD-CFTAPPS-STG
          storage-account: nonprod
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          azure-subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
          product: my-product
```

### With Helm Chart Product Extraction

```yaml
jobs:
  terraform:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      pull-requests: write
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Terraform Deploy
        uses: hmcts/cnp-githubactions-library/terraform-deploy-openid@main
        with:
          environment: aat
          subscription: DCD-CNP-DEV
          aks-subscription: DCD-CFTAPPS-STG
          storage-account: nonprod
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          azure-subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
          helm-chart-path: helm/myapp/Chart.yaml
```

### Plan Only Mode

```yaml
jobs:
  terraform:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      pull-requests: write
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Terraform Plan
        uses: hmcts/cnp-githubactions-library/terraform-deploy-openid@main
        with:
          environment: aat
          subscription: DCD-CNP-DEV
          aks-subscription: DCD-CFTAPPS-STG
          storage-account: nonprod
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          azure-subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
          product: my-product
          plan-only: 'true'
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

## Outputs

| Output | Description |
|--------|-------------|
| `plan-exitcode` | Terraform plan exit code (0=no changes, 2=changes) |
| `has-changes` | Boolean indicating if plan has changes |

## Required Permissions

When using OIDC authentication, your workflow must have the following permissions:

```yaml
permissions:
  id-token: write    # Required for OIDC token
  contents: read     # Required for checkout
  pull-requests: write  # Required for PR comments
```

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

## Comparison with Service Principal Version

| Feature | OpenID (OIDC) | Service Principal |
|---------|---------------|-------------------|
| **Authentication** | Federated identity token | Client secret |
| **Secret Management** | No long-lived secrets | Requires rotating secrets |
| **Setup Complexity** | Requires federated credential setup | Simpler initial setup |
| **Security** | More secure (short-lived tokens) | Less secure (long-lived secrets) |
| **Permissions** | Requires `id-token: write` | No special permissions |

## Prerequisites

- `.terraform-version` file in the working directory
- Azure service principal with federated credentials configured
- Terraform state storage account configured
- GitHub Actions OIDC provider configured in Azure AD

## Notes

- Uses `terraform_wrapper: false` to preserve exit codes
- Exit code 0 = no changes, 2 = changes detected, 1 = error
- The action will fail if product cannot be determined
- The default tenant ID is the HMCTS tenant
