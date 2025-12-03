# Container Build and Push Action

A composite GitHub Action that provides the core logic for building and pushing container images with multi-platform support. This action can be used directly in workflows or extended with custom logic.

## Features

- Multi-platform build support (linux/amd64, linux/arm64, etc.)
- Docker BuildKit caching for faster builds
- Customizable tags, build args, and context
- Automatic metadata extraction
- Detailed build summary output
- Extensible for custom workflows

## Usage

### Basic Usage

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Build and push
    uses: hmcts/cnp-githubactions-library/container-build-push@main
    with:
      registry: myregistry.azurecr.io
      registry-username: ${{ secrets.ACR_USERNAME }}
      registry-password: ${{ secrets.ACR_PASSWORD }}
      image-name: my-app
      image-tags: |
        latest
        ${{ github.sha }}
```

### Extended Usage with Pre/Post Steps

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Run security scan
    run: |
      trivy fs --severity HIGH,CRITICAL .

  - name: Build and push
    uses: hmcts/cnp-githubactions-library/container-build-push@main
    with:
      registry: myregistry.azurecr.io
      registry-username: ${{ secrets.ACR_USERNAME }}
      registry-password: ${{ secrets.ACR_PASSWORD }}
      image-name: my-app
      image-tags: latest
      platforms: linux/amd64,linux/arm64

  - name: Scan container image
    run: |
      trivy image myregistry.azurecr.io/my-app:latest
```

### Custom Workflow with Additional Logic

```yaml
name: Custom Container Build

on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up custom build environment
        run: |
          echo "Setting up custom tools..."
          npm install -g semantic-release

      - name: Generate version
        id: version
        run: |
          VERSION=$(semantic-release --dry-run | grep 'next release version' | awk '{print $NF}')
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - name: Run tests
        run: |
          npm test
          npm run e2e

      - name: Build and push container
        uses: hmcts/cnp-githubactions-library/container-build-push@main
        with:
          registry: myregistry.azurecr.io
          registry-username: ${{ secrets.ACR_USERNAME }}
          registry-password: ${{ secrets.ACR_PASSWORD }}
          image-name: my-app
          image-tags: |
            latest
            v${{ steps.version.outputs.version }}
            ${{ github.sha }}
          build-args: |
            VERSION=${{ steps.version.outputs.version }}
            BUILD_DATE=${{ github.event.head_commit.timestamp }}
            COMMIT_SHA=${{ github.sha }}

      - name: Deploy to staging
        run: |
          kubectl set image deployment/my-app my-app=myregistry.azurecr.io/my-app:v${{ steps.version.outputs.version }}

      - name: Run smoke tests
        run: |
          ./scripts/smoke-test.sh staging
```

### Multi-Stage Build with Conditional Logic

```yaml
name: Multi-Environment Build

on:
  push:
    branches: [ main, develop ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Determine environment
        id: env
        run: |
          if [[ "${{ github.ref }}" == "refs/heads/main" ]]; then
            echo "environment=production" >> $GITHUB_OUTPUT
            echo "dockerfile=Dockerfile.prod" >> $GITHUB_OUTPUT
          else
            echo "environment=development" >> $GITHUB_OUTPUT
            echo "dockerfile=Dockerfile.dev" >> $GITHUB_OUTPUT
          fi

      - name: Build and push
        uses: hmcts/cnp-githubactions-library/container-build-push@main
        with:
          registry: myregistry.azurecr.io
          registry-username: ${{ secrets.ACR_USERNAME }}
          registry-password: ${{ secrets.ACR_PASSWORD }}
          image-name: my-app
          dockerfile: ${{ steps.env.outputs.dockerfile }}
          image-tags: |
            ${{ steps.env.outputs.environment }}
            ${{ github.sha }}
          build-args: |
            ENVIRONMENT=${{ steps.env.outputs.environment }}

      - name: Notify deployment
        run: |
          curl -X POST ${{ secrets.WEBHOOK_URL }} \
            -H 'Content-Type: application/json' \
            -d '{"environment": "${{ steps.env.outputs.environment }}", "image": "myregistry.azurecr.io/my-app:${{ github.sha }}"}'
```

### Using with Matrix Strategy

```yaml
name: Multi-App Build

on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        app:
          - name: frontend
            context: ./apps/frontend
            dockerfile: ./apps/frontend/Dockerfile
          - name: backend
            context: ./apps/backend
            dockerfile: ./apps/backend/Dockerfile
          - name: worker
            context: ./apps/worker
            dockerfile: ./apps/worker/Dockerfile
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Build and push ${{ matrix.app.name }}
        uses: hmcts/cnp-githubactions-library/container-build-push@main
        with:
          registry: myregistry.azurecr.io
          registry-username: ${{ secrets.ACR_USERNAME }}
          registry-password: ${{ secrets.ACR_PASSWORD }}
          image-name: ${{ matrix.app.name }}
          context: ${{ matrix.app.context }}
          dockerfile: ${{ matrix.app.dockerfile }}
          image-tags: |
            latest
            ${{ github.sha }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `dockerfile` | Path to the Dockerfile | No | `./Dockerfile` |
| `context` | Build context path | No | `.` |
| `registry` | Container registry URL | **Yes** | - |
| `registry-username` | Registry username or service principal ID | **Yes** | - |
| `registry-password` | Registry password or service principal secret | **Yes** | - |
| `image-name` | Image name | **Yes** | - |
| `image-tags` | Space-separated list of tags | No | `latest` |
| `build-args` | Build-time variables (newline-delimited KEY=value pairs) | No | - |
| `platforms` | Comma-separated list of target platforms | No | `linux/amd64` |
| `push` | Push image to registry | No | `true` |
| `cache-from` | External cache sources | No | `type=gha` |
| `cache-to` | Cache export destinations | No | `type=gha,mode=max` |

## Outputs

| Output | Description |
|--------|-------------|
| `digest` | Image digest of the built container |
| `tags` | Full image tags that were pushed |
| `metadata` | Build metadata (JSON) |

## Advanced Examples

### Custom Cache Configuration

```yaml
- name: Build with custom cache
  uses: hmcts/cnp-githubactions-library/container-build-push@main
  with:
    registry: myregistry.azurecr.io
    registry-username: ${{ secrets.ACR_USERNAME }}
    registry-password: ${{ secrets.ACR_PASSWORD }}
    image-name: my-app
    cache-from: |
      type=registry,ref=myregistry.azurecr.io/my-app:buildcache
      type=gha
    cache-to: type=registry,ref=myregistry.azurecr.io/my-app:buildcache,mode=max
```

### Using Outputs in Subsequent Steps

```yaml
- name: Build and push
  id: build
  uses: hmcts/cnp-githubactions-library/container-build-push@main
  with:
    registry: myregistry.azurecr.io
    registry-username: ${{ secrets.ACR_USERNAME }}
    registry-password: ${{ secrets.ACR_PASSWORD }}
    image-name: my-app

- name: Sign image
  run: |
    cosign sign --key cosign.key myregistry.azurecr.io/my-app@${{ steps.build.outputs.digest }}

- name: Create SBOM
  run: |
    syft myregistry.azurecr.io/my-app@${{ steps.build.outputs.digest }} -o spdx-json > sbom.json
```

## Comparison with Reusable Workflow

| Feature | Composite Action | Reusable Workflow |
|---------|------------------|-------------------|
| **Flexibility** | High - Can be mixed with custom steps | Limited - Self-contained job |
| **Secret Handling** | Direct input required | Built-in secret management |
| **Checkout** | Must be done separately | Optional built-in checkout |
| **Use Case** | Custom workflows with additional logic | Simple, standardized builds |
| **Extensibility** | Easily extended with pre/post steps | Limited extension capability |

## When to Use

**Use the Composite Action when:**
- You need to add custom steps before or after the build
- You want to integrate with other actions in the same job
- You need to use outputs from previous steps
- You want more control over the workflow structure
- You're building multiple images in one job

**Use the Reusable Workflow when:**
- You want a simple, standardized build process
- You prefer secret management through workflow_call
- You don't need custom pre/post build steps
- You want optional repository checkout
- You prefer a higher-level abstraction

## Platform Options

Common platform options for multi-arch builds:

- `linux/amd64` - Intel/AMD 64-bit (most common)
- `linux/arm64` - ARM 64-bit (Apple Silicon, AWS Graviton)
- `linux/arm/v7` - ARM 32-bit
- `linux/arm/v6` - ARM 32-bit (older)

Example multi-platform build:
```yaml
platforms: linux/amd64,linux/arm64,linux/arm/v7
```

## Notes

- Docker Buildx is automatically set up by this action
- GitHub Actions cache is used by default for faster builds
- All images are automatically tagged and labeled with metadata
- Build summaries are added to the GitHub Actions summary page
