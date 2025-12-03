````markdown
# Container Build and Push Workflow

Build and push container images to a container registry with support for multi-platform builds.

**Workflow File:** `.github/workflows/container-build-and-push.yaml`

> **💡 Need More Flexibility?** This reusable workflow is great for simple, standardized builds. If you need to add custom steps before/after the build or integrate with other actions, check out the [composite action](../../container-build-push/README.md) which provides the same core logic in a more flexible format.

## Features

- Multi-platform build support (linux/amd64, linux/arm64, etc.)
- Flexible authentication (inputs or secrets)
- Docker BuildKit caching for faster builds
- Customisable tags, build args, and context
- Automatic metadata extraction
- Detailed build summary output

## When to Use

**Use this reusable workflow when:**
- You want a simple, standardized build process
- You prefer secret management through workflow_call
- You don't need custom pre/post build steps
- You want optional repository checkout

**Use the [composite action](../../container-build-push/README.md) when:**
- You need to add custom steps before or after the build
- You want to integrate with other actions in the same job
- You need more control over the workflow structure
- You're building multiple images in one job

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
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@main
    with:
      image-name: my-application
      image-tags: |
        latest
        ${{ github.sha }}
      platforms: linux/amd64,linux/arm64
      build-args: |
        VERSION=${{ github.sha }}
        BUILD_DATE=${{ github.event.head_commit.timestamp }}
    secrets:
      REGISTRY_LOGIN_SERVER: ${{ secrets.ACR_LOGIN_SERVER }}
      REGISTRY_USERNAME: ${{ secrets.ACR_USERNAME }}
      REGISTRY_PASSWORD: ${{ secrets.ACR_PASSWORD }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `dockerfile` | Path to the Dockerfile | No | `./Dockerfile` |
| `context` | Build context path | No | `.` |
| `registry` | Container registry URL (e.g., myregistry.azurecr.io) | No | Uses `REGISTRY_LOGIN_SERVER` secret |
| `image-name` | Image name (e.g., myapp) | **Yes** | - |
| `image-tags` | Space-separated list of tags | No | `latest` |
| `build-args` | Build-time variables (newline-delimited KEY=value pairs) | No | - |
| `platforms` | Comma-separated list of target platforms | No | `linux/amd64` |
| `push` | Push image to registry | No | `true` |
| `runner` | GitHub runner to use | No | `ubuntu-latest` |
| `checkout-repository` | Whether to checkout the repository | No | `true` |
| `registry-username` | Container registry username | No | Uses `REGISTRY_USERNAME` secret |
| `registry-password` | Container registry password | No | Uses `REGISTRY_PASSWORD` secret |

## Secrets

| Secret | Description | Required |
|--------|-------------|----------|
| `REGISTRY_LOGIN_SERVER` | Container registry URL | No (if provided via input) |
| `REGISTRY_USERNAME` | Container registry username | No (if provided via input) |
| `REGISTRY_PASSWORD` | Container registry password | No (if provided via input) |

## Outputs

| Output | Description |
|--------|-------------|
| `image-digest` | Image digest of the built container |
| `image-tags` | Full image tags that were pushed |

## Common Use Cases

### Basic Build and Push

```yaml
jobs:
  build:
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@main
    with:
      image-name: my-app
    secrets:
      REGISTRY_LOGIN_SERVER: ${{ secrets.ACR_LOGIN_SERVER }}
      REGISTRY_USERNAME: ${{ secrets.ACR_USERNAME }}
      REGISTRY_PASSWORD: ${{ secrets.ACR_PASSWORD }}
```

### Multi-Platform Build with Custom Tags

```yaml
jobs:
  build:
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@main
    with:
      image-name: my-app
      image-tags: |
        latest
        v1.0.0
        ${{ github.sha }}
      platforms: linux/amd64,linux/arm64
    secrets:
      REGISTRY_LOGIN_SERVER: ${{ secrets.ACR_LOGIN_SERVER }}
      REGISTRY_USERNAME: ${{ secrets.ACR_USERNAME }}
      REGISTRY_PASSWORD: ${{ secrets.ACR_PASSWORD }}
```

### Build with Custom Context and Dockerfile

```yaml
jobs:
  build:
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@main
    with:
      image-name: my-app
      dockerfile: ./docker/Dockerfile.prod
      context: ./app
    secrets:
      REGISTRY_LOGIN_SERVER: ${{ secrets.ACR_LOGIN_SERVER }}
      REGISTRY_USERNAME: ${{ secrets.ACR_USERNAME }}
      REGISTRY_PASSWORD: ${{ secrets.ACR_PASSWORD }}
```

### Build with Build Arguments

```yaml
jobs:
  build:
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@main
    with:
      image-name: my-app
      build-args: |
        VERSION=${{ github.sha }}
        BUILD_DATE=${{ github.event.head_commit.timestamp }}
        NODE_ENV=production
    secrets:
      REGISTRY_LOGIN_SERVER: ${{ secrets.ACR_LOGIN_SERVER }}
      REGISTRY_USERNAME: ${{ secrets.ACR_USERNAME }}
      REGISTRY_PASSWORD: ${{ secrets.ACR_PASSWORD }}
```

### Build Without Pushing (Testing)

```yaml
jobs:
  build:
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@main
    with:
      image-name: my-app
      push: false
    secrets:
      REGISTRY_LOGIN_SERVER: ${{ secrets.ACR_LOGIN_SERVER }}
      REGISTRY_USERNAME: ${{ secrets.ACR_USERNAME }}
      REGISTRY_PASSWORD: ${{ secrets.ACR_PASSWORD }}
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

## Notes

- The workflow uses Docker BuildKit with GitHub Actions cache for improved build performance
- Authentication can be provided via inputs or secrets (inputs take priority)
- The workflow automatically generates metadata and labels for the container image
- Build summaries are added to the GitHub Actions summary page for easy reference

````