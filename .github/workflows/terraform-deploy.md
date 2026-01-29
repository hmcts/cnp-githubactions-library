````markdown
# Terraform Deploy Workflow

Run Terraform plan and optionally apply for infrastructure changes using Azure service principal authentication.

**Workflow File:** `.github/workflows/terraform-deploy.yaml`

> **Need More Flexibility?** This reusable workflow is great for simple, standardized deployments. If you need to add custom steps before/after the deployment or integrate with other actions, check out the [composite action](../../terraform-deploy/README.md) which provides the same core logic in a more flexible format.

## Features

- Full Terraform plan/apply workflow
- Azure service principal authentication
- Automatic backend configuration for HMCTS state storage
- PR comment with plan output (idempotent updates)
- Environment tag mapping for Azure policy compliance
- Product name extraction from Helm Chart.yaml
- Detailed GitHub Actions summary

## When to Use

**Use this reusable workflow when:**
- You want a simple, standardized Terraform deployment
- You prefer secret management through workflow_call
- You don't need custom pre/post deployment steps
- You want optional repository checkout

**Use the [composite action](../../terraform-deploy/README.md) when:**
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
    uses: hmcts/cnp-githubactions-library/.github/workflows/terraform-deploy.yaml@main
    with:
      environment: aat
      subscription: DCD-CNP-DEV
      aks-subscription: DCD-CFTAPPS-STG
      storage-account: nonprod
      plan-only: ${{ github.event_name == 'pull_request' }}
      helm-chart-path: helm/myapp/Chart.yaml
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `environment` | Target environment (e.g., aat, prod) | **Yes** | - |
| `subscription` | Azure subscription name (e.g., DCD-CNP-DEV) | **Yes** | - |
| `aks-subscription` | Azure subscription name for AKS cluster | **Yes** | - |
| `storage-account` | Storage account postfix (nonprod, prod) | **Yes** | - |
| `working-directory` | Terraform working directory | No | `infrastructure` |
| `plan-only` | Run plan only, skip apply | No | `false` |
| `product` | Product name | No | Extracted from helm-chart-path |
| `helm-chart-path` | Path to Chart.yaml for product extraction | No | - |
| `business-area` | Business area tag (CFT, SDS, etc.) | No | `CFT` |
| `post-plan-to-pr` | Post plan output to PR comment | No | `true` |
| `runner` | GitHub runner to use | No | `ubuntu-latest` |
| `checkout-repository` | Whether to checkout the repository | No | `true` |

## Secrets

| Secret | Description | Required |
|--------|-------------|----------|
| `AZURE_CREDENTIALS` | Azure service principal credentials (JSON) | **Yes** |

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
    uses: hmcts/cnp-githubactions-library/.github/workflows/terraform-deploy.yaml@main
    with:
      environment: aat
      subscription: DCD-CNP-DEV
      aks-subscription: DCD-CFTAPPS-STG
      storage-account: nonprod
      plan-only: ${{ github.event_name == 'pull_request' }}
      product: my-product
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
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
    uses: hmcts/cnp-githubactions-library/.github/workflows/terraform-deploy.yaml@main
    with:
      environment: aat
      subscription: DCD-CNP-DEV
      aks-subscription: DCD-CFTAPPS-STG
      storage-account: nonprod
      product: my-product
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS_NONPROD }}

  terraform-prod:
    needs: terraform-aat
    uses: hmcts/cnp-githubactions-library/.github/workflows/terraform-deploy.yaml@main
    with:
      environment: prod
      subscription: DCD-CNP-PROD
      aks-subscription: DCD-CFTAPPS-PROD
      storage-account: prod
      product: my-product
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS_PROD }}
```

### Using Plan Output in Subsequent Jobs

```yaml
name: Infrastructure

on:
  push:
    branches: [main]

jobs:
  terraform:
    uses: hmcts/cnp-githubactions-library/.github/workflows/terraform-deploy.yaml@main
    with:
      environment: aat
      subscription: DCD-CNP-DEV
      aks-subscription: DCD-CFTAPPS-STG
      storage-account: nonprod
      product: my-product
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}

  notify:
    needs: terraform
    if: needs.terraform.outputs.has-changes == 'true'
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack
        run: |
          echo "Infrastructure changes applied"
```

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

- Uses the `terraform-deploy` composite action internally
- Exit code 0 = no changes, 2 = changes detected, 1 = error
- PR comments are idempotent (updates existing comment rather than creating duplicates)
- Plan output is truncated to 60KB if too large
````
