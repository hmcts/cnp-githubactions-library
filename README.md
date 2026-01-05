# CNP GitHub Actions Library

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A reusable library of GitHub Actions workflows for HMCTS CNP (Cloud Native Platform) projects. This library provides standardised, production-ready workflows that can be called from other repositories to maintain consistency and reduce duplication.

## 📋 Table of Contents

- [Available Workflows](#available-workflows)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## 🚀 Available Workflows & Actions

### Container Build and Push

Build and push container images to a container registry with support for multi-platform builds.

**Available in Two Formats:**

#### 1. Reusable Workflow (Simple, Standardized)
Perfect for straightforward builds with minimal customization.

📖 **[View workflow documentation](.github/workflows/container-build-and-push.md)**

```yaml
jobs:
  build:
    uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@main
    with:
      image-name: my-application
    secrets:
      REGISTRY_LOGIN_SERVER: ${{ secrets.ACR_LOGIN_SERVER }}
      REGISTRY_USERNAME: ${{ secrets.ACR_USERNAME }}
      REGISTRY_PASSWORD: ${{ secrets.ACR_PASSWORD }}
```

#### 2. Composite Action (Flexible, Extensible)
Ideal when you need to add custom steps or integrate with other actions.

📖 **[View action documentation](container-build-push/README.md)**

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run custom pre-build steps
        run: npm test
      
      - name: Build and push
        uses: hmcts/cnp-githubactions-library/container-build-push@main
        with:
          registry: myregistry.azurecr.io
          registry-username: ${{ secrets.ACR_USERNAME }}
          registry-password: ${{ secrets.ACR_PASSWORD }}
          image-name: my-application
      
      - name: Run custom post-build steps
        run: ./deploy.sh
```

**Features:**
- Multi-platform build support (linux/amd64, linux/arm64, etc.)
- Flexible authentication (inputs or secrets)
- Docker BuildKit caching for faster builds
- Customisable tags, build args, and context
- Automatic metadata extraction
- Detailed build summary output

**Choosing Between Workflow and Action:**

| Use Case | Reusable Workflow | Composite Action |
|----------|-------------------|------------------|
| Simple, standardized builds | ✅ | ⚠️ |
| Built-in secret management | ✅ | ❌ |
| Custom pre/post build steps | ❌ | ✅ |
| Multiple images in one job | ❌ | ✅ |
| Integration with other actions | ❌ | ✅ |
| Matrix strategy builds | ❌ | ✅ |

### Helm Deploy

Deploy Helm charts to Azure AKS clusters with support for OCI dependencies.

**Available in Two Formats:**

#### 1. Reusable Workflow (Simple, Standardised)
Perfect for straightforward deployments with minimal customisation.

📖 **[View workflow documentation](.github/workflows/helm-deploy.md)**

```yaml
jobs:
  deploy:
    uses: hmcts/cnp-githubactions-library/.github/workflows/helm-deploy.yaml@main
    with:
      release-name: my-application
      namespace: production
      chart: ./charts/my-app
    secrets:
      AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
      AKS_CLUSTER_NAME: ${{ secrets.AKS_CLUSTER_NAME }}
      AKS_RESOURCE_GROUP: ${{ secrets.AKS_RESOURCE_GROUP }}
```

#### 2. Composite Action (Flexible, Extensible)
Ideal when you need to add custom steps or integrate with other actions.

📖 **[View action documentation](helm-deploy/README.md)**

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run pre-deployment checks
        run: ./scripts/pre-deploy.sh

      - name: Deploy Helm chart
        uses: hmcts/cnp-githubactions-library/helm-deploy@main
        with:
          cluster-name: my-aks-cluster
          resource-group: my-resource-group
          azure-credentials: ${{ secrets.AZURE_CREDENTIALS }}
          release-name: my-application
          namespace: production
          chart: ./charts/my-app

      - name: Run smoke tests
        run: ./scripts/smoke-test.sh
```

**Features:**
- Deploy Helm charts from local paths with OCI dependencies
- Azure AKS authentication with service principal
- OCI registry login for chart dependencies
- Flexible values configuration (files, set, set-string)
- Dry-run capability for testing deployments
- Atomic deployments with automatic rollback
- Detailed deployment summary output

**Choosing Between Workflow and Action:**

| Use Case | Reusable Workflow | Composite Action |
|----------|-------------------|------------------|
| Simple, standardised deployments | ✅ | ⚠️ |
| Built-in secret management | ✅ | ❌ |
| Custom pre/post deployment steps | ❌ | ✅ |
| Multiple releases in one job | ❌ | ✅ |
| Integration with other actions | ❌ | ✅ |
| Matrix strategy deployments | ❌ | ✅ |

## 📖 Usage

### Using Reusable Workflows

To use a reusable workflow in your repository:

1. Reference the workflow using the `uses` keyword in your workflow file
2. Specify the version/branch after the `@` symbol (e.g., `@main`, `@v1.0.0`)
3. Pass required inputs and secrets as needed

```yaml
jobs:
  call-workflow:
    uses: hmcts/cnp-githubactions-library/.github/workflows/<workflow-name>.yaml@main
    with:
      # your inputs here
    secrets:
      # your secrets here
```

### Using Composite Actions

To use a composite action in your workflow:

1. Add it as a step within your job
2. Provide required inputs directly
3. Optionally use outputs in subsequent steps

```yaml
jobs:
  your-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Your custom action
        uses: hmcts/cnp-githubactions-library/<action-name>@main
        with:
          # your inputs here
      
      - name: Use outputs
        run: echo "Result: ${{ steps.your-custom-action.outputs.result }}"
```

### Versioning

We recommend pinning to a specific version or commit SHA for production use:

```yaml
# Pin to a specific tag
uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@v1.0.0

# Pin to a specific commit
uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@abc123def

# Use the latest from main (not recommended for production)
uses: hmcts/cnp-githubactions-library/.github/workflows/container-build-and-push.yaml@main
```

For composite actions:
```yaml
uses: hmcts/cnp-githubactions-library/container-build-push@v1.0.0
```

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository** and create a new branch for your feature or bugfix
2. **Follow the existing code style** and conventions
3. **Test your changes** thoroughly before submitting
4. **Update documentation** if you're adding new features or changing behavior
5. **Submit a pull request** with a clear description of your changes

### Adding a New Workflow or Action

When adding new reusable workflows:

1. Place the workflow file in the `.github/workflows/` directory
2. Create a corresponding `.md` documentation file in the same directory
3. Use the `workflow_call` trigger
4. Update the main README with a summary and link

When adding new composite actions:

1. Create a new directory with a descriptive name
2. Add an `action.yaml` file in that directory
3. Create a comprehensive `README.md` with examples
4. Update the main README with a summary and link

### Workflow Guidelines

- Use semantic versioning for releases
- Keep workflows focused and single-purpose
- Provide sensible defaults for optional inputs
- Use secrets for sensitive data
- Add descriptive output summaries
- Enable caching where appropriate

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Reusable Workflows](https://docs.github.com/en/actions/using-workflows/reusing-workflows)
- [HMCTS GitHub](https://github.com/hmcts)

## 📧 Support

For issues, questions, or contributions, please open an issue in this repository.
