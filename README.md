# CNP GitHub Actions Library

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A reusable library of GitHub Actions workflows for HMCTS CNP (Cloud Native Platform) projects. This library provides standardised, production-ready workflows that can be called from other repositories to maintain consistency and reduce duplication.

## 📋 Table of Contents

- [Available Workflows](#available-workflows)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## 🚀 Available Workflows

### Container Build and Push

Build and push container images to a container registry with support for multi-platform builds.

**Features:**
- Multi-platform build support (linux/amd64, linux/arm64, etc.)
- Flexible authentication (inputs or secrets)
- Docker BuildKit caching for faster builds
- Customisable tags, build args, and context

📖 **[View full documentation](workflows/container-build-and-push.md)**

**Quick Example:**

```yaml
jobs:
  build:
    uses: hmcts/cnp-githubactions-library/workflows/container-build-and-push.yaml@main
    with:
      image-name: my-application
    secrets:
      REGISTRY_LOGIN_SERVER: ${{ secrets.ACR_LOGIN_SERVER }}
      REGISTRY_USERNAME: ${{ secrets.ACR_USERNAME }}
      REGISTRY_PASSWORD: ${{ secrets.ACR_PASSWORD }}
```

## 📖 Usage

To use these workflows in your repository:

1. Reference the workflow using the `uses` keyword in your workflow file
2. Specify the version/branch after the `@` symbol (e.g., `@main`, `@v1.0.0`)
3. Pass required inputs and secrets as needed

```yaml
jobs:
  call-workflow:
    uses: hmcts/cnp-githubactions-library/workflows/<workflow-name>.yaml@main
    with:
      # your inputs here
    secrets:
      # your secrets here
```

### Versioning

We recommend pinning to a specific version or commit SHA for production use:

```yaml
# Pin to a specific tag
uses: hmcts/cnp-githubactions-library/workflows/container-build-and-push.yaml@v1.0.0

# Pin to a specific commit
uses: hmcts/cnp-githubactions-library/workflows/container-build-and-push.yaml@abc123def

# Use the latest from main (not recommended for production)
uses: hmcts/cnp-githubactions-library/workflows/container-build-and-push.yaml@main
```

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository** and create a new branch for your feature or bugfix
2. **Follow the existing code style** and conventions
3. **Test your changes** thoroughly before submitting
4. **Update documentation** if you're adding new features or changing behavior
5. **Submit a pull request** with a clear description of your changes

### Adding a New Workflow

When adding a new reusable workflow:

1. Place the workflow file in the `workflows/` directory
2. Create a corresponding `.md` documentation file in the same directory
3. Use the `workflow_call` trigger
4. Document all inputs, secrets, and outputs clearly in the documentation file
5. Add a summary and link to the README
6. Follow GitHub Actions best practices for security and maintainability

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
