# Container Build and Push Workflow (OpenID Connect)

Build and push container images to Azure Container Registry (ACR) using OpenID Connect (OIDC) authentication with support for multi-platform builds.

**Workflow File:** `.github/workflows/container-build-and-push-openId.yaml`

> **💡 Need More Flexibility?** This reusable workflow is great for simple, standardized builds with OIDC authentication. If you need to add custom steps before/after the build or integrate with other actions, check out the [composite action](../../container-build-push/README.md) which provides the same core logic in a more flexible format.

## Features

- OpenID Connect (OIDC) authentication with Azure (no stored secrets needed)
- Multi-platform build support (linux/amd64, linux/arm64, etc.)
- Docker BuildKit caching for faster builds
- Customisable tags, build args, and context
- Automatic metadata extraction
- Detailed build summary output
- Automatic ACR login via Azure CLI

## When to Use

**Use this reusable workflow when:**
- You want a simple, standardized build process with OIDC authentication
- You prefer keyless authentication via OpenID Connect
- You don't need custom pre/post build steps
- You want optional repository checkout
- You're pushing to Azure Container Registry (ACR)

**Use the [composite action](../../container-build-push/README.md) when:**
- You need to add custom steps before or after the build
- You want to integrate with other actions in the same job
- You need more control over the workflow structure
- You're building multiple images in one job

## Prerequisites

1. **Azure Service Principal** with ACR push permissions
2. **Federated credentials** configured in Azure Entra ID for GitHub OIDC
3. The service principal must have `AcrPush` role on the target ACR

For setup instructions, see [Azure Login Action with OIDC](https://github.com/Azure/login#configure-deployment-credentials)

## Example Usage

```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push-openId.yaml@main
    with:
      image-name: my-application
      image-tags: |
        latest
        ${{ github.sha }}
      platforms: linux/amd64,linux/arm64
      azureContainerRegistryName: myacrname
      azureClientId: ${{ secrets.AZURE_CLIENT_ID }}
      azureTenantId: ${{ secrets.AZURE_TENANT_ID }}
      build-args: |
        VERSION=${{ github.sha }}
        BUILD_DATE=${{ github.event.head_commit.timestamp }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `dockerfile` | Path to the Dockerfile | No | `./Dockerfile` |
| `context` | Build context path | No | `.` |
| `image-name` | Image name (e.g., myapp) | **Yes** | - |
| `image-tags` | Space-separated list of tags | No | `latest` |
| `build-args` | Build-time variables (newline-delimited KEY=value pairs) | No | - |
| `platforms` | Comma-separated list of target platforms | No | `linux/amd64` |
| `push` | Push image to registry | No | `true` |
| `runner` | GitHub runner to use | No | `ubuntu-latest` |
| `checkout-repository` | Whether to checkout the repository | No | `true` |
| `azureContainerRegistryName` | Name of the ACR (without .azurecr.io) | **Yes** | - |
| `azureClientId` | Client ID of the service principal for OIDC | **Yes** | - |
| `azureTenantId` | Tenant ID hosting the service principal | No | `531ff96d-0ae9-462a-8d2d-bec7c0b42082` |

## Outputs

| Output | Description |
|--------|-------------|
| `image-digest` | Image digest of the built container |
| `image-tags` | Full image tags that were pushed |

## Common Use Cases

### Basic Build and Push to ACR

```yaml
jobs:
  build:
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push-openId.yaml@main
    with:
      image-name: my-app
      azureContainerRegistryName: hmctsprod
      azureClientId: ${{ secrets.AZURE_CLIENT_ID }}
      azureTenantId: ${{ secrets.AZURE_TENANT_ID }}
```

### Multi-Platform Build with Custom Tags

```yaml
jobs:
  build:
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push-openId.yaml@main
    with:
      image-name: my-app
      image-tags: |
        latest
        v1.0.0
        ${{ github.sha }}
      platforms: linux/amd64,linux/arm64
      azureContainerRegistryName: hmctsprod
      azureClientId: ${{ secrets.AZURE_CLIENT_ID }}
      azureTenantId: ${{ secrets.AZURE_TENANT_ID }}
```

### Build with Custom Context and Dockerfile

```yaml
jobs:
  build:
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push-openId.yaml@main
    with:
      image-name: my-app
      dockerfile: ./docker/Dockerfile.prod
      context: ./app
      azureContainerRegistryName: hmctsprod
      azureClientId: ${{ secrets.AZURE_CLIENT_ID }}
      azureTenantId: ${{ secrets.AZURE_TENANT_ID }}
```

### Build with Build Arguments

```yaml
jobs:
  build:
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push-openId.yaml@main
    with:
      image-name: my-app
      build-args: |
        VERSION=${{ github.sha }}
        BUILD_DATE=${{ github.event.head_commit.timestamp }}
        NODE_ENV=production
      azureContainerRegistryName: hmctsprod
      azureClientId: ${{ secrets.AZURE_CLIENT_ID }}
      azureTenantId: ${{ secrets.AZURE_TENANT_ID }}
```

### Build Without Pushing (Testing)

```yaml
jobs:
  build:
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push-openId.yaml@main
    with:
      image-name: my-app
      push: false
      azureContainerRegistryName: hmctsprod
      azureClientId: ${{ secrets.AZURE_CLIENT_ID }}
      azureTenantId: ${{ secrets.AZURE_TENANT_ID }}
```

## Platform Options

Common platform options for the `platforms` input:

- `linux/amd64` - Intel/AMD 64-bit (most common)
- `linux/arm64` - ARM 64-bit (Apple Silicon, AWS Graviton, etc.)
- `linux/arm/v7` - ARM 32-bit
- `linux/arm/v6` - ARM 32-bit (older)

You can specify multiple platforms separated by commas:
```yaml
platforms: linux/amd64,linux/arm64
```

## Authentication Details

This workflow uses **OpenID Connect (OIDC)** for keyless authentication:

1. GitHub Actions generates a token using the workflow's context
2. The token is exchanged with Azure Entra ID for a service principal token
3. The service principal is then used to authenticate with ACR
4. No long-lived credentials are stored as secrets

### Why Use OIDC?

- **More Secure**: No long-lived credentials stored as secrets
- **Easier Rotation**: Credentials expire automatically
- **Audit Trail**: Better tracking of who deployed what
- **Compliance**: Better security posture for regulated environments

### Setting Up OIDC

1. Create a service principal in Azure
2. Configure federated credentials in Entra ID pointing to your GitHub repository
3. Store the client ID and tenant ID as repository secrets
4. Assign the `AcrPush` role to the service principal on your ACR

See [Azure Login Action Documentation](https://github.com/Azure/login#configure-deployment-credentials) for detailed setup instructions.

## Notes

- The workflow uses Docker BuildKit with GitHub Actions cache for improved build performance
- Registry URL is automatically constructed as `{azureContainerRegistryName}.azurecr.io`
- ACR login is performed automatically via Azure CLI after OIDC authentication
- The workflow requires `id-token: write` permission for OIDC token generation
- Build summaries are added to the GitHub Actions summary page for easy reference

## Troubleshooting

### "Permission denied" errors

- Verify the service principal has `AcrPush` role on the ACR
- Check that federated credentials are correctly configured in Entra ID
- Ensure the `id-token: write` permission is set in the job

### "ACR Login Failed"

- Verify `azureContainerRegistryName` is correct (without `.azurecr.io`)
- Check that the service principal can authenticate with `az acr login`
- Verify network connectivity to the ACR endpoint

### "Image digest not available"

- Ensure `push: true` (the default)
- Check that the ACR has sufficient quota/storage
- Review the build output for any warnings or errors
