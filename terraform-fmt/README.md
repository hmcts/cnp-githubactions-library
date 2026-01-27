# Terraform Format Check Action

A composite GitHub Action that checks Terraform files are properly formatted.

## Features

- Uses `.terraform-version` file for consistent Terraform version
- Recursive format checking
- Detailed error output with fix instructions
- GitHub Actions summary output

## Usage

### Basic Usage

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Check Terraform formatting
    uses: hmcts/cnp-githubactions-library/terraform-fmt@main
```

### Custom Working Directory

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Check Terraform formatting
    uses: hmcts/cnp-githubactions-library/terraform-fmt@main
    with:
      working-directory: terraform/environments/prod
```

### Non-Recursive Check

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Check Terraform formatting
    uses: hmcts/cnp-githubactions-library/terraform-fmt@main
    with:
      recursive: 'false'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `working-directory` | Terraform working directory | No | `infrastructure` |
| `terraform-version-file` | Path to .terraform-version file (relative to working-directory) | No | `.terraform-version` |
| `recursive` | Check formatting recursively | No | `true` |

## Prerequisites

Your repository should have a `.terraform-version` file in the Terraform working directory specifying the Terraform version to use:

```
1.5.7
```

## Fixing Format Errors

If the action fails, run the following command in your Terraform directory:

```bash
terraform fmt -recursive
```

This will automatically format all Terraform files.

## Notes

- The action uses `terraform fmt -check -diff` to show exactly which files need formatting
- Failed checks are reported with an error annotation in the GitHub Actions UI
- A summary is added to the GitHub Actions summary page
