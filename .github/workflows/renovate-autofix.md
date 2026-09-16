# Renovate Autofix Workflow

When CI fails on a Renovate dependency-update PR, hand the failure to Claude once and push the fix to the branch.

**Workflow file:** `.github/workflows/renovate-autofix.yaml`

The workflow ships no instructions. What a valid fix looks like in your repository — the toolchain, the commit convention, what to leave alone — lives in the `prompt` input, because that is the part that cannot be shared.

## Features

- Resolves the PR from a `workflow_run` event, with a branch lookup for when the event's `pull_requests` array comes through empty
- One attempt per PR, claimed **before** the agent runs and inside the same serialised region as the eligibility gate, so a crash, a timeout or two failures arriving together cannot produce a second attempt
- Decides the outcome from `git`, not from what the agent says it did, and refuses to push a rewritten history
- Pushes with `--force-with-lease` against the checked-out SHA, so a branch Renovate refreshed mid-run is refused rather than clobbered
- Reports on the push rather than the fix — a rejected lease never reads as success, and is distinguished from a push that never ran
- Skips failures no code change can fix, via `skip-when-all-failures-match`
- Reports into a single updated PR comment rather than a new one per run

## When to use

**Use this workflow when:**

- Renovate opens PRs against your repository and some of them fail for reasons a small code change would fix — a renamed export, a stricter type, a new lint rule, a stale snapshot
- You would rather read a diagnosis than write one

**Do not use it when:**

- Your CI failures are mostly environmental. Every attempt is spent whether or not it produces a fix, so a pipeline that fails for infrastructure reasons will burn attempts writing reports that say so. Narrow it with `skip-when-all-failures-match` first.
- You need more than one attempt per PR unattended. That is deliberate — see [Notes](#notes).

## Prerequisites

**A GitHub App** whose id and private key are available as secrets. It needs `actions: read`, `contents: write`, `pull-requests: write` and `issues: write` on the repository. The workflow scopes the generated token down to exactly those four, because the agent runs unattended with that token within reach. `actions: read` is what reads the failed run's logs: a public repository grants that to any authenticated token, a private one does not.

**Bedrock access** via the shared `HMCTSClaudeGitHubActionsRole`, which the default `aws-role` points at. The calling job must grant `id-token: write` or the OIDC exchange fails.

**A CI workflow to watch.** Name its file in `ci-workflow`; the calling workflow triggers on its completion.

## Example Usage

### Minimal

```yaml
name: Renovate Autofix

on:
  workflow_run:
    workflows: [Preview]
    types: [completed]

permissions:
  contents: read
  pull-requests: read
  actions: read
  id-token: write

jobs:
  autofix:
    uses: hmcts/cnp-githubactions-library/.github/workflows/renovate-autofix.yaml@main
    secrets: inherit
    with:
      ci-workflow: workflow.preview.yml
      prompt: |
        Run `yarn install --immutable` before any lint or test command.

        When the failure is caused by the update, adapt this repository to the new
        version. Never widen or pin back the version in package.json.

        Run `yarn lint` and `yarn test` before committing. Commit once, subject
        `fix(deps): adapt to <dependency> update`. Do NOT push.

        Always write /tmp/autofix-report.md.
```

### With a manual trigger and an environmental skip

```yaml
on:
  workflow_run:
    workflows: [Preview]
    types: [completed]
  workflow_dispatch:
    inputs:
      pr-number:
        description: "PR number to attempt"
        type: string
        required: true

jobs:
  autofix:
    uses: hmcts/cnp-githubactions-library/.github/workflows/renovate-autofix.yaml@main
    secrets: inherit
    with:
      ci-workflow: workflow.preview.yml
      pr-number: ${{ inputs.pr-number }}
      # The preview cluster is off outside working hours, so a deploy-only failure is
      # not something a code change can fix. Leave those to a scheduled re-run.
      skip-when-all-failures-match: "Deploy to"
      extra-allowed-tools: "Bash(corepack:*),Bash(yarn:*)"
      prompt: |
        ...
```

`pr-number` has to be passed through explicitly: inside a reusable workflow, `inputs` refers to this workflow's inputs, not the caller's dispatch inputs.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `prompt` | Yes | - | Instructions for the agent, appended to a generated context block |
| `ci-workflow` | Yes | - | Filename of the workflow being diagnosed |
| `pr-number` | No | `''` | PR to attempt, for manual runs |
| `base-branch` | No | `master` | Only attempt PRs targeting this branch |
| `renovate-author` | No | `renovate[bot]` | Author login that makes a PR eligible |
| `allowed-bots` | No | `renovate` | Passed to `allowed_bots`; the bot's short name, not the author login |
| `attempt-label` | No | `claude:autofix-attempted` | Label that caps this at one attempt |
| `skip-when-all-failures-match` | No | `''` | Regex; skip when every failed job name matches |
| `node-version-file` | No | `.nvmrc` | Empty string skips Node setup entirely |
| `cache` | No | `yarn` | `actions/setup-node` cache; empty disables |
| `cache-dependency-path` | No | `**/yarn.lock` | `actions/setup-node` cache key path |
| `enable-corepack` | No | `true` | Run `corepack enable` before Node setup |
| `max-turns` | No | `40` | Turn limit; a stop here is reported as incomplete |
| `allowed-tools` | No | read/write/edit + enumerated git | Replaces the default tool allowlist |
| `extra-allowed-tools` | No | `''` | Appended to `allowed-tools`, for build tooling |
| `commit-author-name` | No | `claude-code-bot[bot]` | Author on the fix commit |
| `commit-author-email` | No | `claude-code-bot[bot]@users.noreply.github.com` | Author email |
| `aws-role` | No | `HMCTSClaudeGitHubActionsRole` | Role assumed for Bedrock |
| `aws-region` | No | `eu-west-1` | Bedrock region |
| `opus-model` / `sonnet-model` / `haiku-model` | No | current Bedrock ids | Model overrides |
| `runs-on` | No | `ubuntu-latest` | Runner label |

## Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `CLAUDE_CODE_APP_ID` | Yes | App id of the App that commits and comments |
| `CLAUDE_CODE_PRIVATE_KEY` | Yes | Private key for that App |

## Outputs

| Output | Description |
|--------|-------------|
| `pr-number` | PR resolved, whether or not it was attempted |
| `eligible` | Whether the gate allowed an attempt |
| `outcome` | `fixed`, `no-change`, `rewritten` or `dirty`; empty when no attempt was made |
| `pushed` | `true` only when a commit reached the branch |

## Notes

**Dependency installation is not a step.** The update being diagnosed is often what breaks `install`, and a step can only report that secondhand. Run by the agent, the error is in its own terminal where it can read it and act. Tell it what to run in `prompt`, and grant the tooling via `extra-allowed-tools`.

**A push takes the PR out of Renovate's management.** A commit from anyone else makes Renovate treat the branch as edited, so it stops rebasing and stops automerging. `gitIgnoredAuthors` would suppress that and is deliberately not used, so the report comment says the PR needs manual review whenever a commit landed. It follows that a speculative fix has a real cost, and the `prompt` should say plainly that changing nothing is a correct outcome.

**One attempt, claimed up front.** The label goes on before the agent starts, so a throttle, a timeout or a `max-turns` stop consumes it. Remove the label to allow one more. Without this a repeatedly-failing pipeline would re-run the agent on every push.

The claim sits in the eligibility job, under a `concurrency` group keyed on the branch, so reading the label and setting it are one serialised region. Claiming in the second job instead would let two failures arriving within a minute of each other both read the label as absent and both go on to run the agent.

**Eligibility is decided in one place.** All the gates live in a single step in the `resolve` job so they cannot drift apart, and each one logs why it declined. When nothing happened, that job's log says which condition failed.

**An unreadable log stops the run.** The agent is told to diagnose from the failed run's log, so a log it cannot read would leave it guessing. That step runs before the attempt is claimed, so failing there costs nothing and the run can simply be retried.

**`workflow_run` only ever runs the default-branch copy of the calling workflow.** Edits to the caller do nothing until merged, which is why the manual `workflow_dispatch` path is worth wiring up.
