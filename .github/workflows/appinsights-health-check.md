# Application Insights Health Check Workflow

Run a set of Application Insights queries on a schedule, evaluate each against a threshold, and emit deduplicated findings for a downstream job to act on.

**Workflow file:** `.github/workflows/appinsights-health-check.yaml`

The workflow ships no queries. Everything service-specific — the KQL, the thresholds, the suppressions — lives in a config file in your repository, `.github/watchdog.yml` by default. See the [composite action's README](../../appinsights-health-check/README.md) for the config schema and the threshold grammar.

## Features

- Handles the Azure OIDC login, the state cache and the artefact upload, so a caller needs one job
- Deduplicates findings across runs, so an ongoing incident is reported once
- Caps findings per run and reports what was deferred rather than dropping it
- Reports resolution when a previously-firing finding goes clean
- A query that errors, 403s or times out fails the run — it is never reported as healthy

## When to use

**Use this reusable workflow when:**

- One Application Insights resource is being checked on a schedule
- The defaults for state caching and artefact retention suit you
- You want minimal boilerplate

**Use the [composite action](../../appinsights-health-check/README.md) when:**

- You need a matrix across environments, passing a different `app-id` per leg
- The check shares a job with other work
- You want to control how state is persisted — committing it to a branch rather than caching it, say
- You need the `findings-path` artefact handled differently

## Prerequisites

The OIDC principal needs **Monitoring Reader** on the Application Insights resource. Key Vault access policies do not cover the telemetry data plane:

```hcl
resource "azurerm_role_assignment" "app_insights_reader" {
  scope                = module.application_insights.id
  role_definition_name = "Monitoring Reader"
  principal_id         = var.github_actions_oidc_object_id
}
```

Check your **sampling percentage** too. The shared `terraform-module-application-insights` defaults non-prod to 1%, which discards roughly 99 of every 100 errors — fine for traffic trends, useless for error checks.

## Example Usage

### Detect, then notify

```yaml
name: Watchdog

on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch:

concurrency:
  group: watchdog
  cancel-in-progress: false

jobs:
  detect:
    uses: hmcts/cnp-githubactions-library/.github/workflows/appinsights-health-check.yaml@main
    with:
      config-path: .github/watchdog.yml
    secrets: inherit

  notify:
    needs: detect
    if: needs.detect.outputs.breached == 'true'
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          allow-no-subscriptions: true

      - name: Load the Slack token
        run: |
          TOKEN=$(az keyvault secret show --vault-name my-bootstrap-stg-kv \
            --name slack-bot-token --query value -o tsv)
          echo "::add-mask::$TOKEN"
          echo "SLACK_BOT_TOKEN=$TOKEN" >> "$GITHUB_ENV"

      - uses: hmcts/cnp-githubactions-library/slack-notify@main
        with:
          channel: C0123456789
          text: |
            :rotating_light: ${{ fromJSON(needs.detect.outputs.findings)[0].checkId }} fired
            <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View the run>
```

### Several environments from one config

The reusable workflow takes a single `app-id`, so use a matrix of callers:

```yaml
jobs:
  detect:
    strategy:
      fail-fast: false
      matrix:
        include:
          - env: aat
            app-id: 00000000-1111-2222-3333-444444444444
          - env: prod
            app-id: 55555555-6666-7777-8888-999999999999
    uses: hmcts/cnp-githubactions-library/.github/workflows/appinsights-health-check.yaml@main
    with:
      app-id: ${{ matrix.app-id }}
    secrets: inherit
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `config-path` | no | `.github/watchdog.yml` | Path to the check configuration. |
| `app-id` | no | from config | Application Insights app GUID. Overrides the config. |
| `window` | no | `15m` | Evaluation window, substituted as `{{window}}`. |
| `baseline-window` | no | `7d` | Comparison window, substituted as `{{baseline}}`. |
| `max-findings` | no | `3` | Cap on fresh findings per run. |
| `renotify-after` | no | `6h` | How long a reported finding stays quiet. |
| `runner` | no | `ubuntu-latest` | Runner to use. |

## Secrets

| Secret | Required | Description |
|---|---|---|
| `AZURE_CLIENT_ID` | yes | App registration used for OIDC. Needs Monitoring Reader on the resource. |
| `AZURE_TENANT_ID` | yes | Azure tenant ID. |
| `AZURE_SUBSCRIPTION_ID` | yes | Subscription containing the resource. |

`secrets: inherit` is usually enough.

## Outputs

| Output | Description |
|---|---|
| `breached` | `true` when there is at least one fresh finding. Gate downstream jobs on this. |
| `findings` | Fresh findings as a JSON array. |
| `deferred-count` | Fresh findings that exceeded `max-findings`. |
| `resolved` | Fingerprints that were firing and are now clean. |

The full verdict artefact — every check with its query, row count, rule and outcome — is uploaded as `appinsights-health-check-findings-<run_id>-<run_attempt>`, retained 14 days.

## Notes

- **Pin to a tag or SHA** rather than `@main`. An unpinned watchdog is a self-inflicted outage.
- **Scheduled workflows only ever run the default branch's copy** of the workflow file, so changes do nothing until merged. `workflow_dispatch` is there to test on a branch.
- **GitHub drops `schedule` triggers under load.** Consider a separate check that alerts when the watchdog itself has not run recently.
- State is cached, so it survives normal runs but not a cache eviction. After an eviction the next run re-reports open findings once.
