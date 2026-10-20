# Renovate Autofix Workflow

When CI fails on a Renovate dependency-update PR, hand the failure to Claude once and push the fix to the branch. CI can be GitHub Actions or Jenkins.

**Workflow file:** `.github/workflows/renovate-autofix.yaml`

The workflow ships no instructions. What a valid fix looks like in your repository — the toolchain, the commit convention, what to leave alone — lives in the `prompt` input, because that is the part that cannot be shared.

## Features

- Reads the failure from GitHub Actions or from Jenkins, selected with `ci-system`
- Resolves the PR from a `workflow_run` event, with a branch lookup for when the event's `pull_requests` array comes through empty
- In Jenkins mode, resolves the PR from the `status` event's commit, ignoring every status that is not the configured Jenkins context reporting a failed build
- One attempt per PR, claimed **before** the agent runs and inside the same serialised region as the eligibility gate, so a crash, a timeout or two failures arriving together cannot produce a second attempt
- Decides the outcome from `git`, not from what the agent says it did, and refuses to push a rewritten history
- Pushes with `--force-with-lease` against the checked-out SHA, so a branch Renovate refreshed mid-run is refused rather than clobbered
- Reports on the push rather than the fix — a rejected lease never reads as success, and is distinguished from a push that never ran
- Skips failures no code change can fix, via `skip-when-all-failures-match` — matched against failed GitHub Actions job names, or against failed Jenkins pipeline stage names
- Reports into a single updated PR comment rather than a new one per run

## When to use

**Use this workflow when:**

- Renovate opens PRs against your repository and some of them fail for reasons a small code change would fix — a renamed export, a stricter type, a new lint rule, a stale snapshot
- You would rather read a diagnosis than write one
- Your CI is Jenkins rather than GitHub Actions — set `ci-system: jenkins` and read [Jenkins mode](#jenkins-mode) first, which needs an in-network runner

**Do not use it when:**

- Your CI failures are mostly environmental. Every attempt is spent whether or not it produces a fix, so a pipeline that fails for infrastructure reasons will burn attempts writing reports that say so. Narrow it with `skip-when-all-failures-match` first.
- You need more than one attempt per PR unattended. That is deliberate — see [Notes](#notes).

## Prerequisites

**A GitHub App** whose id and private key are available as secrets. It needs `actions: read`, `contents: write`, `pull-requests: write` and `issues: write` on the repository. The workflow scopes the generated token down to exactly those four, because the agent runs unattended with that token within reach. `actions: read` is what reads the failed run's logs: a public repository grants that to any authenticated token, a private one does not.

**Bedrock access** via the shared `HMCTSClaudeGitHubActionsRole`, which the default `aws-role` points at.

**Permissions on the caller.** A called workflow cannot request more than its caller grants, so the caller must grant everything below or the run ends in `startup_failure` before any job starts — which produces no logs and no annotation, so it reads as an empty run rather than an error:

```yaml
permissions:
  contents: write      # commit the fix
  pull-requests: write # read the PR, comment on it
  issues: write        # the attempt label
  actions: read        # read the failed run and its logs
  id-token: write      # Bedrock OIDC
```

This workflow narrows them back down per job: only the job that runs the agent gets the write scopes, and the eligibility job keeps read plus `issues: write` for the label.

**A CI workflow to watch.** Name its file in `ci-workflow`; the calling workflow triggers on its completion. In Jenkins mode there is no workflow to name — see below.

### In Jenkins mode

**A runner inside the HMCTS network.** `build.hmcts.net` resolves to a private address (10.10.73.250), so a GitHub-hosted runner cannot reach it: the Jenkins call fails with no route to the host and the run goes red before any attempt is claimed. Pass the `runnerScaleSetName` of a GitHub ARC scale set in `runs-on`. Those are defined per repository under `apps/github-arc/` in [`hmcts/cnp-flux-config`](https://github.com/hmcts/cnp-flux-config), so a repository without one needs one adding there first. On `ubuntu-latest` Jenkins mode cannot work. The runner also still needs egress for Bedrock, the GitHub API and whatever the fix's toolchain installs.

**Jenkins credentials**, as the `JENKINS_USERNAME` and `JENKINS_API_TOKEN` secrets. The token is a Jenkins API token from the user's own configuration page, not a password, and the user needs Read on the job. Both are optional at `workflow_call` validation time so `secrets: inherit` keeps working on repositories that do not use Jenkins mode; the eligibility gate declines when the mode is selected without them.

**Jenkins reporting to GitHub as a commit status.** The GitHub Branch Source plugin does this by default. The context defaults to `continuous-integration/jenkins/pr-head`; check yours on a real PR with `gh api repos/OWNER/REPO/commits/SHA/statuses`.

The same `actions: read` is still needed on the App and on the caller. Nothing in Jenkins mode reads an Actions log, but a job's `permissions` block cannot vary by input, so the scope is requested in both modes.

## Example Usage

### Minimal

```yaml
name: Renovate Autofix

on:
  workflow_run:
    workflows: [Preview]
    types: [completed]

permissions:
  contents: write
  pull-requests: write
  issues: write
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

### Jenkins

```yaml
name: Renovate Autofix

on:
  status:

permissions:
  contents: write
  pull-requests: write
  issues: write
  actions: read
  id-token: write

jobs:
  autofix:
    # The status event fires for every commit status on every commit in the
    # repository. The called workflow declines all of them bar one, but this keeps a
    # runner from starting for a SonarCloud status or a pending build in the first
    # place. Jenkins reports a FAILURE result as 'error' and an UNSTABLE one as
    # 'failure', so both are let through.
    if: >-
      github.event.context == 'continuous-integration/jenkins/pr-head'
      && (github.event.state == 'failure' || github.event.state == 'error')
    uses: hmcts/cnp-githubactions-library/.github/workflows/renovate-autofix.yaml@main
    secrets: inherit
    with:
      ci-system: jenkins
      # build.hmcts.net is on a private address, so this has to be the name of an
      # in-network ARC scale set. Jenkins mode cannot work on ubuntu-latest.
      runs-on: my-repo-runners
      # The actor on a status event is the Jenkins App that wrote the status, not
      # Renovate, and claude-code-action refuses a bot actor it was not told about.
      # Find yours with:
      #   gh api repos/OWNER/REPO/commits/SHA/statuses --jq '.[].creator.login'
      allowed-bots: hmcts-jenkins-d-to-i
      # The preview cluster is off outside working hours, so a deploy-only failure is
      # not something a code change can fix.
      skip-when-all-failures-match: "^AKS deploy"
      extra-allowed-tools: "Bash(yarn:*)"
      prompt: |
        ...
```

To attempt a Jenkins failure by hand, dispatch with both `pr-number` and `jenkins-build-url` — the build URL off the PR's commit status, with or without the trailing `/display/redirect`.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `prompt` | Yes | - | Instructions for the agent, appended to a generated context block |
| `ci-workflow` | No | `''` | Filename of the workflow being diagnosed. Required when `ci-system` is `github-actions`, unused in `jenkins` mode |
| `ci-system` | No | `github-actions` | `github-actions` or `jenkins` — which CI the failure comes from |
| `jenkins-url` | No | `https://build.hmcts.net` | Controller root. A build is only fetched when the status's `target_url` is under it |
| `jenkins-status-context` | No | `continuous-integration/jenkins/pr-head` | Commit status context Jenkins reports the build under |
| `pr-number` | No | `''` | PR to attempt, for manual runs |
| `jenkins-build-url` | No | `''` | Jenkins build to diagnose, for manual runs in `jenkins` mode |
| `base-branch` | No | `master` | Only attempt PRs targeting this branch |
| `renovate-author` | No | `renovate[bot]` | Author login that makes a PR eligible |
| `allowed-bots` | No | `renovate` | Passed to `allowed_bots`; the bot's short name, not the author login. In `jenkins` mode it must name the Jenkins App instead |
| `attempt-label` | No | `claude:autofix-attempted` | Label that caps this at one attempt |
| `skip-when-all-failures-match` | No | `''` | Regex; skip when every failed job name — or, in `jenkins` mode, every failed stage name — matches |
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
| `JENKINS_USERNAME` | In `jenkins` mode | Jenkins user the build and its console log are read as |
| `JENKINS_API_TOKEN` | In `jenkins` mode | API token for that user, from its Jenkins user configuration page |

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

**`workflow_run` only ever runs the default-branch copy of the calling workflow.** Edits to the caller do nothing until merged, which is why the manual `workflow_dispatch` path is worth wiring up. The `status` event behaves the same way, so the same applies to Jenkins mode.

## Jenkins mode

**The mode is selected, not inferred.** `ci-system` decides it. Inferring from the event would mean a caller that triggers on both `workflow_run` and `status` changed mode by accident, and a `workflow_dispatch` run carries no event to infer from, so inference would need a second rule anyway.

**The PR comes from the commit.** A `status` payload has no `pull_requests` array — only `sha`, `state`, `context`, `target_url` and `branches`. The PR is resolved from `sha` with the commit-to-PR association, narrowed to open PRs targeting `base-branch`, since one commit can belong to several. When that comes back empty it falls back to looking for an open PR on each branch in `branches`, the same fallback the `workflow_run` path has for the same reason.

The status is also required to be *for the PR head*. The checkout, the fix and the `--force-with-lease` all work against the head, so a status for an older commit is diagnosing a build of code that is no longer there.

**Jenkins' states are not the states you would expect.** The GitHub Branch Source plugin maps a Jenkins `FAILURE` result onto the `error` state and `UNSTABLE` onto `failure`, so both count as a failed build. `ABORTED` and `NOT_BUILT` arrive as `error` too, and a build Jenkins superseded or timed out is not something a code change can fix — so the gate reads the build's real `result` from Jenkins and attempts only `FAILURE` and `UNSTABLE`.

**Nothing happens for any other status.** The `status` event fires for every commit status on every commit in the repository. A status that is not the configured context reporting a failure resolves nothing and reaches neither the GitHub API nor Jenkins; the gate then declines and logs which condition failed. Adding the same condition as an `if:` on the calling job, as in the example above, stops a runner starting at all.

**`allowed-bots` has to name the Jenkins App.** The triggering actor of a `status` event is whoever wrote the status, which is the Jenkins GitHub App — `hmcts-jenkins-d-to-i[bot]` for the `HMCTS_d_to_i` folder, and a different app for other folders. `claude-code-action` refuses a bot actor it was not told about, so leaving the default of `renovate` makes the attempt fail after the label has been claimed. Find the login with `gh api repos/OWNER/REPO/commits/SHA/statuses --jq '.[].creator.login'` and pass it without the `[bot]` suffix.

**The build URL is stripped, not followed.** `target_url` is the build URL with `/display/redirect` on the end. Where that redirect lands depends on which UI plugins the controller has, and curl's effective URL carries the credentials, so the suffix is removed textually and `<build-url>/consoleText` fetched directly. The result is only used when it sits under `jenkins-url`: anyone who can write a commit status chooses its `target_url`, and the credentials should only ever go to the configured controller.

**The credentials never reach the log or the agent.** They go to curl in a `0600` config file rather than on a command line, and the file is removed as soon as the log is down — before the agent starts, which matters because the agent runs in that workspace with `Read` in its tool list.

**An unreachable or unauthenticated Jenkins stops the run before the attempt is claimed.** The eligibility job reads the build over the Jenkins API, which proves the host is reachable and the credentials work; failing there costs no attempt and the run can be retried. The console log itself is fetched in the attempt, after the claim.

**`skip-when-all-failures-match` matches stage names.** Failed pipeline stages are the nearest thing Jenkins has to failed GitHub Actions job names, and they are what the agent is told about as well. They come from `<build-url>/wfapi/describe`, which belongs to the Pipeline: Stage View plugin — installed on `build.hmcts.net`. A controller or job type without it answers 404; the stage list is then empty, which never skips, and the run warns when a pattern was set that could not be matched.

**Manual runs need the build URL.** A dispatch carries no `status` event, so `jenkins-build-url` has to say which build to diagnose. Reading the PR's commit statuses instead would need a `statuses: read` scope, and a called workflow cannot request a scope its caller does not grant — so asking for it would end every existing caller's run in `startup_failure`.
