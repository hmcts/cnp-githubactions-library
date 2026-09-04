# Application Insights Health Check Action

A composite GitHub Action that runs a set of Application Insights queries on a schedule, evaluates each against a threshold, and emits deduplicated findings for a downstream job to act on.

**This action ships no queries.** Every KQL query, threshold and suppression comes from a config file in your repository. The action runs the queries, compares results against your rules, fingerprints what fired, and suppresses what you have already been told about. All monitoring judgement stays with you; the action only does the mechanical part.

That split is deliberate:

- **Services differ.** A Node frontend, a Spring Boot API and a batch job have different tables, operation-name shapes and definitions of "unhealthy". A shared query set would be wrong for most consumers.
- **Tuning a threshold shouldn't need a PR against this repo.** Your queries live next to the code they observe, reviewed by the team that owns it.
- **The query is the reviewable artefact.** When a threshold changes, it shows up in your repo's history.

## Features

- Consumer-defined KQL, with `{{window}}` and `{{baseline}}` substituted in
- A deliberately small threshold grammar — anything more expressive belongs in the KQL, where you can test it in the portal
- Per-finding fingerprinting, so an ongoing incident is reported once rather than every run
- A suppression list in your config, requiring a stated reason for every entry
- A cap on findings per run, with the remainder counted rather than silently dropped
- Reports resolution when a previously-firing finding goes clean
- Queries the REST API with a token from your `azure/login` session, so no `az` extension install on every run
- **A query that errors, 403s or times out fails the run.** It is never reported as healthy — that confusion is the main failure mode this action exists to avoid

## Prerequisites

- `azure/login` before this action, with `id-token: write` on the job
- The principal needs **Monitoring Reader** on the Application Insights resource. Key Vault access policies do not cover the telemetry data plane:

```hcl
resource "azurerm_role_assignment" "app_insights_reader" {
  scope                = module.application_insights.id
  role_definition_name = "Monitoring Reader"
  principal_id         = var.github_actions_oidc_object_id
}
```

- Check your **sampling percentage**. The shared `terraform-module-application-insights` defaults non-prod environments to 1%, which discards roughly 99 of every 100 errors. Fine for traffic trends; useless for a zero-tolerance error check.

## Usage

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
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    outputs:
      breached: ${{ steps.check.outputs.breached }}
      findings: ${{ steps.check.outputs.findings }}
    steps:
      - uses: actions/checkout@v4

      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      # Dedup needs the state file to survive between runs.
      - uses: actions/cache/restore@v4
        with:
          path: .watchdog-state.json
          key: watchdog-state-${{ github.run_id }}
          restore-keys: watchdog-state-

      - id: check
        uses: hmcts/cnp-githubactions-library/appinsights-health-check@main
        with:
          config-path: .github/watchdog.yml

      - uses: actions/cache/save@v4
        if: always()
        with:
          path: .watchdog-state.json
          key: watchdog-state-${{ github.run_id }}

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: watchdog-findings
          path: ${{ steps.check.outputs.findings-path }}
```

Pin to a tag or commit rather than `@main` for anything you rely on. An unpinned watchdog is a self-inflicted outage.

## Configuration

```yaml
app-insights:
  # The app's GUID, not the resource name:
  #   az monitor app-insights component show -g <rg> --app <name> --query appId -o tsv
  app-id: 18e1ccec-b642-4b1a-acd8-c5ff7139e7c1

defaults:
  severity: medium
  renotify-after: 6h

checks:
  # Any error is worth looking at, so this fires on a single row.
  - id: exceptions
    severity: high
    fingerprint-by: [problemId, cloud_RoleName]
    rule: { rows: '> 0' }
    query: |
      exceptions
      | where timestamp > ago({{window}})
      | summarize n = count() by problemId, cloud_RoleName, outerMessage

  - id: server-errors
    severity: high
    fingerprint-by: [name, resultCode, cloud_RoleName]
    rule: { rows: '> 0' }
    query: |
      requests
      | where timestamp > ago({{window}})
      | where toint(resultCode) >= 500
      | where name !startswith 'GET /health'
      | summarize n = count() by name, resultCode, cloud_RoleName

  # Ratio against a trailing baseline: one row per breaching operation.
  - id: latency-p95-regression
    severity: medium
    fingerprint-by: [name]
    rule: { column: ratio, value: '> 2' }
    query: |
      let base = requests
        | where timestamp between (ago({{baseline}}) .. ago({{window}}))
        | where name !startswith 'GET /health'
        | summarize p95_base = percentile(duration, 95) by name;
      requests
      | where timestamp > ago({{window}})
      | where name !startswith 'GET /health'
      | summarize p95_now = percentile(duration, 95) by name
      | join kind=inner base on name
      | extend ratio = p95_now / p95_base

  # Liveness: fires when the query comes back empty.
  - id: crons-silent
    severity: high
    rule: { rows: '== 0' }
    query: |
      requests
      | where timestamp > ago({{window}})
      | where cloud_RoleName == 'my-crons'
      | take 1

suppressions:
  - fingerprint: "exceptions:ECONNRESET:my-web"
    reason: Client disconnects during file download; benign.
    added-by: "#1234"
```

### Threshold rules

| Rule | Fires when | Typical use |
|---|---|---|
| `rule: { rows: '> 0' }` | The result set has any rows | Errors, exceptions, failed dependencies |
| `rule: { rows: '== 0' }` | The result set is empty | Liveness, no-traffic, a role reporting nothing |
| `rule: { column: ratio, value: '> 2' }` | Per row, where that column breaches | Regressions, rates |

Comparators: `>`, `>=`, `<`, `<=`, `==`, `!=` followed by a number. Anything more complex belongs in the KQL.

For a `column` rule, each breaching row is a separate finding. For `rows`, the check firing is the finding — with one finding per returned row, or a single finding when it fires on emptiness.

### Fingerprints

`fingerprint-by` names the columns identifying a distinct incident. A fingerprint is `<check-id>:<values joined by ':'>`. Two runs producing the same fingerprint are the same incident, so it is reported once until `renotify-after` elapses.

Choose columns that are stable for the same underlying problem and different for genuinely different problems. `problemId` is good; a timestamp or a count is not.

### Suppressions

An entry needs a `fingerprint` and a `reason` — the reason is mandatory, because an unexplained suppression is an invisible blind spot. Suppressed findings still appear in the run summary with their reason, so silencing stays visible.

Review them periodically: an entry that has not fired in 90 days is probably hiding something that no longer happens, or something that changed shape.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `config-path` | no | `.github/watchdog.yml` | Path to the check configuration. |
| `app-id` | no | from config | Overrides the config, so one config can serve several environments from a matrix. |
| `window` | no | `15m` | Evaluation window, substituted as `{{window}}`. |
| `baseline-window` | no | `7d` | Comparison window, substituted as `{{baseline}}`. |
| `max-findings` | no | `3` | Cap on fresh findings per run. |
| `renotify-after` | no | `6h` | How long a reported finding stays quiet. |
| `state-path` | no | `.watchdog-state.json` | Where dedup state is read and written. |
| `fail-on-breach` | no | `false` | Fail the step when any check fires. |

## Outputs

| Output | Description |
|---|---|
| `breached` | `true` when there is at least one fresh finding. Gate downstream jobs on this. |
| `findings` | Fresh findings as a JSON array. |
| `findings-path` | Full verdict artefact: every check, query, row count, rule and outcome. |
| `deferred-count` | Fresh findings that exceeded `max-findings`. |
| `resolved` | Fingerprints that were firing and are now clean. |

## Notes

- **State must persist between runs**, or every run re-reports everything. Cache it, as in the example, or commit it to a branch.
- **Scheduled workflows only run the default branch's copy** of the workflow file, and GitHub drops `schedule` triggers under load. Consider a check that alerts when the watchdog itself has not run recently.
- **Watch query cost.** A `join` over a 7-day baseline every 15 minutes adds up. The summary reports each query's execution time.
- **Validate queries in the portal first**, and record the observed baseline alongside the threshold. A badly-scoped query either cries wolf or hides a real incident, and the action cannot tell which.
- `fail-on-breach` defaults to `false` so that a breach and a broken action are distinguishable in the run list. Read `breached` instead.
