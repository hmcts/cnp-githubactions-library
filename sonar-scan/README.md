# Sonar Code Quality Scan Action

A composite GitHub Action that runs a Sonar analysis and fails the build when the
quality gate does not pass. Supports the standalone SonarScanner CLI, the
`org.sonarqube` Gradle plugin and `sonar-maven-plugin`, against either SonarQube
Cloud or the self-hosted HMCTS SonarQube Server.

HMCTS repos that build on Jenkins get a Sonar scan for free from
`cnp-jenkins-library`. Its `sectionBuildAndTest.groovy` wraps the build in
`withSonarQubeEnv("SonarQube")` to inject the host and token from Jenkins' global
configuration, calls `builder.sonarScan()` — `gradle --info <props> sonarqube` for
Gradle repos, `sonar-scanner <props>` for Yarn ones — and then blocks on
`waitForQualityGate()` inside a 30-minute timeout, failing the build when the gate
is not `OK`. GitHub Actions has no equivalent, so repos have been assembling the
pieces by hand. This action is that stage.

The [reusable workflow](../.github/workflows/sonar-scan.md) wraps this action as a
whole job and is the easier entrypoint for most repos: it takes the token through
`secrets`, so callers need only `secrets: inherit`, does the full-history checkout
for you, and can download a coverage artifact from an earlier job. Use this action
directly when the scan has to share a job with your tests, needs setup steps, or runs
in a matrix.

One part of the Jenkins behaviour deliberately has no counterpart here.
`SonarProperties.groovy` injects `sonar.pullrequest.key`, `.base`, `.branch` and
`.provider=github` from Jenkins' `CHANGE_*` variables, because Jenkins has no
GitHub context of its own. On GitHub Actions the scanner reads pull-request context
straight out of the `GITHUB_*` environment, so there is nothing to set — but see
[`fetch-depth`](#fetch-depth-0-is-the-callers-job) below, because that detection
only works properly from a full-history checkout.

## Features

- One input picks the scanner, so a Gradle or Maven repo does not end up on the CLI
  scanner, which cannot analyse those builds
- Blocks on the quality gate through the scanner-native `sonar.qualitygate.wait`
  property, in one step and with identical behaviour across all three scanners
- Defaults to SonarQube Cloud, with `sonar-host-url` for the self-hosted HMCTS server
- Warns when the checkout is shallow, which otherwise degrades blame, new-code
  detection and pull-request decoration without failing anything
- Optionally creates the Sonar project over the API, idempotently — an existing
  project, a lookup the token may not browse, and two runs racing to create the same
  project all end green
- Writes a run summary naming the scanner, host, project and gate decision, with a
  dashboard link, so a red run can be diagnosed from the Actions tab
- Never reports a gate it did not see: when a gate was requested and the scanner left
  no report — or only a stale one from an earlier analysis — the step fails rather
  than reading a zero exit status as a pass

## Usage

### A Node repo scanning on SonarQube Cloud

Tests and the scan in one job, which is the simplest shape when coverage is
produced by the same job that scans.

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - run: yarn install --immutable
      - run: yarn test --coverage

      - uses: hmcts/cnp-githubactions-library/sonar-scan@main
        if: github.event.pull_request.head.repo.fork == false
        with:
          sonar-token: ${{ secrets.SONAR_TOKEN }}
```

### A Gradle repo

```yaml
      - uses: hmcts/cnp-githubactions-library/sonar-scan@main
        with:
          sonar-token: ${{ secrets.SONAR_TOKEN }}
          scanner: gradle
```

The build still owns its analysis properties — `sonarqube { properties { ... } }` in
`build.gradle` — and its coverage wiring. This action only runs the task and holds
the gate.

### The self-hosted HMCTS SonarQube Server

Civil, SSCS, Probate and parts of Payment analyse against the internal server
rather than SonarQube Cloud. `SONAR_HOST_URL` is only needed for SonarQube Server;
SonarQube Cloud is the default and needs no host at all.

```yaml
      - uses: hmcts/cnp-githubactions-library/sonar-scan@main
        with:
          sonar-token: ${{ secrets.SONAR_TOKEN }}
          scanner: gradle
          sonar-host-url: https://sonar.reform.hmcts.net/
```

### Scanning in a separate job, with coverage as an artifact

The scan needs the coverage report to already exist on disk. When tests run in a
different job — a matrix, or a monorepo fanning out per package — upload the report
and download it in the scan job. `hmcts/ccd-case-ui-toolkit` does exactly this in
`.github/workflows/npmpublish.yml`, and `hmcts/cath-service` does the monorepo
variant in `.github/workflows/job.test.yml`, merging per-package `lcov.info` files
with `lcov-result-merger` before scanning.

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: yarn install --immutable
      - run: npx turbo test -- --coverage
      - run: npx lcov-result-merger '**/coverage/lcov.info' lcov.info --prepend-source-files
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: lcov.info

  sonar:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/download-artifact@v4
        with:
          name: coverage-report
      - uses: hmcts/cnp-githubactions-library/sonar-scan@main
        with:
          sonar-token: ${{ secrets.SONAR_TOKEN }}
```

The path the artifact lands at has to match whatever
`sonar.javascript.lcov.reportPaths` (or the TypeScript, Python or Go equivalent) in
`sonar-project.properties` says. If they disagree the scan succeeds and reports zero
coverage, which the quality gate may well pass.

### Creating the project first

For a repo whose Sonar project does not exist yet. Inputs win; anything left empty
falls back to `sonar-project.properties` if there is one. The organization is
required on SonarQube Cloud and ignored on SonarQube Server.

```yaml
      - uses: hmcts/cnp-githubactions-library/sonar-scan@main
        with:
          sonar-token: ${{ secrets.SONAR_TOKEN }}
          create-project: ${{ github.ref == 'refs/heads/master' }}
```

A private repository should say so, or the project is created public and its source
becomes world-readable on Sonar:

```yaml
      - uses: hmcts/cnp-githubactions-library/sonar-scan@main
        with:
          sonar-token: ${{ secrets.SONAR_TOKEN }}
          create-project: true
          visibility: private
```

A Gradle repo on the self-hosted server needs no properties file at all, since
Gradle keeps its analysis properties in `build.gradle`:

```yaml
      - uses: hmcts/cnp-githubactions-library/sonar-scan@main
        with:
          sonar-token: ${{ secrets.SONAR_TOKEN }}
          scanner: gradle
          sonar-host-url: https://sonar.reform.hmcts.net/
          create-project: true
          project-key: uk.gov.hmcts.reform:my-api
          project-name: 'Reform :: my-api'
```

### Reading the dashboard URL

```yaml
      - id: sonar
        uses: hmcts/cnp-githubactions-library/sonar-scan@main
        with:
          sonar-token: ${{ secrets.SONAR_TOKEN }}

      - if: always()
        run: echo "Analysed at ${{ steps.sonar.outputs.dashboard-url }}"
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `sonar-token` | yes | | Sonar analysis token. Composite actions cannot read the `secrets` context, so it has to be passed explicitly. |
| `scanner` | no | `cli` | `cli`, `gradle` or `maven`. Must match the build. |
| `sonar-host-url` | no | `https://sonarcloud.io` | Sonar server to analyse against. |
| `working-directory` | no | `.` | Directory the scan runs from, and the CLI scanner's project base directory. |
| `quality-gate` | no | `true` | Wait for the gate and fail the step when it does not pass. Must be `true` or `false`. |
| `quality-gate-timeout` | no | `1800` | Seconds to wait for the gate. Matches the Jenkins 30-minute timeout. |
| `args` | no | `''` | Extra analysis properties, one `-Dkey=value` per line. Quote values containing spaces — see [below](#args-splits-differently-per-scanner). |
| `gradle-task` | no | `sonar` | Gradle task to run. |
| `maven-goals` | no | `sonar:sonar` | Maven goals to run. |
| `create-project` | no | `false` | Create the project over the API if it does not exist. Must be `true` or `false`. |
| `properties-file` | no | `sonar-project.properties` | Where `create-project` falls back to for the key, name and organization. Relative to `working-directory`. Not needed if the inputs below cover what is required. |
| `project-key` | no | `''` | Takes precedence over `sonar.projectKey` in `properties-file`. Required by `create-project`. |
| `project-name` | no | `''` | Takes precedence over `sonar.projectName` in `properties-file`. Required by `create-project`. |
| `organization` | no | `''` | Takes precedence over `sonar.organization` in `properties-file`. Required by `create-project` on SonarQube Cloud only; SonarQube Server has no organizations. |
| `visibility` | no | `public` | Visibility of a project created by `create-project`: `public` or `private`. |

## Outputs

| Output | Description |
|---|---|
| `dashboard-url` | URL of the analysed project, read from the scanner's `report-task.txt`. Empty when no report was written. |

## Prerequisites

- **A checkout.** `actions/checkout` must have run, with `fetch-depth: 0`.
- **A Sonar token**, as `sonar-token`. Both `hmcts/cath-service` and
  `hmcts/ccd-case-ui-toolkit` read `secrets.SONAR_TOKEN` without declaring it at
  repository level, which appears to be an organisation-level secret — confirm it is
  available to your repository before relying on it.
- **An existing Sonar project**, unless you set `create-project`.
- **Analysis properties**, either in `sonar-project.properties` (CLI scanner) or in
  the build file (Gradle and Maven). This action does not invent them; it passes
  through the quality-gate properties and whatever you give it in `args`.
- **Coverage already generated.** Run the tests before this step.

The CLI scanner needs no extra setup — `SonarSource/sonarqube-scan-action` brings
its own. Gradle and Maven modes need the build's own plugin (`org.sonarqube` or
`sonar-maven-plugin`) and a JDK already set up in the job.

## Coming from Jenkins

| `cnp-jenkins-library` | Here |
|---|---|
| `withSonarQubeEnv("SonarQube")` | `sonar-token` and `sonar-host-url` inputs |
| `SonarProperties.groovy` pull-request properties from `CHANGE_*` | Nothing to set — the scanner reads GitHub's own context, given a full-history checkout |
| `builder.sonarScan()` dispatching on the build tool | `scanner` input |
| `waitForQualityGate()` in a 30-minute timeout | `quality-gate` and `quality-gate-timeout` |
| `only_deploy` label skipping the stage | A caller-side `if:` on the label, not an input |

## Notes

### Fork pull requests get no secrets

GitHub withholds secrets from workflows triggered by a pull request from a fork, so
`secrets.SONAR_TOKEN` arrives empty and this action fails with an error annotation.
That is deliberate — a scan that silently did not happen is worse than a red step —
but it means a repo that takes external contributions should skip the step rather
than fail on every such PR:

```yaml
      - uses: hmcts/cnp-githubactions-library/sonar-scan@main
        if: github.event.pull_request.head.repo.fork == false
        with:
          sonar-token: ${{ secrets.SONAR_TOKEN }}
```

### `fetch-depth: 0` is the caller's job

The action warns about a shallow checkout but cannot fix it, because the checkout
happens before it runs. Without the full history Sonar cannot blame an issue to a
commit or author, and cannot work out which code is new — so the "new code"
conditions that most quality gates are built from behave unpredictably. Set
`fetch-depth: 0` on `actions/checkout`.

### Coverage has to exist before the scan

Sonar does not run your tests; it reads a coverage report off disk at the path your
analysis properties name. If the report is missing the scan still succeeds and
records zero coverage. Run the tests in the same job, or upload and download the
report as an artifact as shown
[above](#scanning-in-a-separate-job-with-coverage-as-an-artifact).

### Gradle builds that wire coverage onto `sonarqube`

`org.sonarqube` renamed its task from `sonarqube` to `sonar`, keeping the old name as
a deprecated alias. A build that hangs its coverage dependency off the old name — for
example `tasks.named('sonarqube') { dependsOn jacocoTestReport }`, which is what
`pcs-api` does — will not run `jacocoTestReport` when this action invokes the default
`sonar` task, and the scan uploads without coverage. Either set `gradle-task:
sonarqube`, or move the `dependsOn` onto `sonar` in the build file. The second is
better: the alias will eventually go.

### A hardcoded `sonar.host.url` in the repo wins

`sonar-host-url` reaches the scanner as `SONAR_HOST_URL`, which an explicit
`sonar.host.url` in `build.gradle` or `sonar-project.properties` overrides —
`hmcts/ccd-case-ui-toolkit` has one. The input then appears to do nothing, which
looks like a bug in this action. Delete the property from the repo and let the input
decide; that is the whole point of having the input.

### `create-project` needs more than an analysis token

Creating a project is a separate permission from Execute Analysis, which is all a
scan needs. A token that scans happily will fail project creation with `Insufficient
privileges`; the action reports the HTTP code, the response body and that hint.

Existence is probed with `api/components/show`, which needs only Browse on the
project. The more obvious `api/projects/search` needs Administer System on SonarQube
Server, so a token holding Execute Analysis and Provision Projects is refused by it —
which would turn every build after the first into a failure. If even the Browse
lookup is refused, the action warns that it cannot tell, attempts the create anyway,
and treats an `already exists` response as success. The same handling covers two
concurrent runs on one push, or two matrix legs, both deciding to create: whoever
loses the race still ends green, because the project exists either way.

`visibility` defaults to `public`, which matches the HMCTS SonarQube Cloud
organisation. On a **private** repository that default would publish your source,
issues and measures to anyone who can reach the Sonar host, so the action **refuses to
proceed**: set `visibility` explicitly, to `private` to match the repository or to
`public` if publishing a private repository's analysis really is intended. It applies
only to projects this action creates; an existing project's visibility is never
changed.

This is the one place the action fails over a *default* rather than something you got
wrong, and it is deliberate: the publication cannot be undone. Re-running with
`visibility: private` does not retract source, issues and measures that have already
been world-readable on sonarcloud.io, so a warning you might scroll past is not
enough.

The action also tries to set a newly created project's main branch to the
repository's default branch, because a project created over the API otherwise takes
the server's default name and analyses of your default branch get filed as a side
branch; that call is best effort and only warns if it fails.

Gate `create-project` on the default branch, as in the example above. Running it on
every pull request is wasted API calls against a project that will already exist.

### `create-project` refuses to give a repository a second project

Any repo with the SonarCloud GitHub App installed also gets **Automatic Analysis**, a
scan SonarQube Cloud runs by itself. It auto-creates its own project, keyed
`<organization>_<repo-name>`, and takes no notice of your `sonar.projectKey`. The
pipeline, meanwhile, publishes to whatever that key says. When the two disagree, one
repository ends up with two Sonar projects — and the DevOps Platform binding that
drives pull-request decoration usually sits on the Automatic Analysis one, which is
source-only and so reports 0% coverage, leaving the pipeline-fed project with all the
real data and no binding. Symptoms are a `SonarCloud Code Analysis` check failing on
files your pipeline never scans, or no PR comment at all even though your own scan and
quality gate passed.

Most HMCTS repos do not match the convention and so are exposed to this:
`cath-service` declares `hmcts.cath` where Automatic Analysis would make
`hmcts_cath-service`; `pcs-api` declares `uk.gov.hmcts.reform:pcs-api-2`;
`pt-frontend` declares `pt-frontend`. Of the repos in the workspace only
`ccd-case-ui-toolkit` happens to line up.

So before creating anything, `create-project` checks both keys:

1. The declared key. If that project exists, there is nothing to do and the step
   succeeds, as always.
2. If — and only if — that came back a definite `404`, the convention key,
   `<organization>_<repo-name>`. If a project exists there and it is not the declared
   key, the step **fails** rather than creating a second one, and tells you to point
   `sonar.projectKey` at the project that already exists — or to have an org admin
   disable Automatic Analysis for the repository, so there is only one project to
   satisfy.
3. Neither exists: the declared key is created, with no commentary.

The check is skipped, with a line in the log saying why, when the host is not
SonarQube Cloud (Automatic Analysis is a SonarQube Cloud feature, so the convention
key means nothing on the self-hosted server), when no organization has been resolved,
or when the event payload carries no repository name — it will not guess at the key.

It is also skipped when the first lookup was refused or errored rather than
answering `404`. `api/components/show` returns `404` for a component that does not
exist, so a `403` on the declared key means it most likely *does* exist and the token
simply cannot browse it. There is then nothing to create, and failing would hand you
the wrong instruction: abandon a project that exists — probably the one your pipeline
has been feeding coverage to — in favour of the autoscan twin. The step falls through
to the create attempt instead, gets `already exists` back, and ends green, which is
what it did before this check existed. A refused probe on the *convention* key is
likewise only a warning.

**What this does not catch.** It probes by key, so it only finds an autoscan-shaped
twin. A project someone created by hand years ago under a third, unrelated key is
invisible to it, and you can still end up with two. The complete answer is to ask
which project holds the DevOps Platform binding for this repository, rather than
guessing at keys — but that lookup is unverified on SonarQube Cloud and most likely
needs project-admin permission, well beyond the analysis token this action is given,
so it is deliberately not attempted.

Full write-up of the underlying problem: *SonarCloud "Automatic Analysis" creates a
second, separate project* in `docs/how-to/troubleshooting.md` in
[`hmcts/cft-workspace`](https://github.com/hmcts/cft-workspace).

### The `only_deploy` label

The Jenkins pipeline skips the Sonar stage when a PR carries `only_deploy`. There is
no input for that here — on Actions it is a condition on the step you own:

```yaml
        if: ${{ !contains(github.event.pull_request.labels.*.name, 'only_deploy') }}
```

### Why `sonar.qualitygate.wait` rather than the quality gate action

`SonarSource/sonarqube-quality-gate-action` would do the job too. It polls the Sonar
API — with its own `pollingTimeoutSec`, 300 seconds by default — and it works with
Gradle and Maven as well as the CLI, provided you point its `scanMetadataReportFile`
input at the right receipt: `build/sonar/report-task.txt` for Gradle,
`target/sonar/report-task.txt` for Maven. That input can only be omitted when the
step directly follows `sonarqube-scan-action`.

`sonar.qualitygate.wait`, which is what `quality-gate: true` sets, is preferred here
for narrower reasons: it is one step rather than two, there is no report path to keep
in sync with the build's output directory, and it behaves identically across all
three `scanner` modes without any per-mode wiring. Reach for the separate action if
you want the gate checked somewhere other than immediately after the scan — a later
job, say — or want to read the gate status without the scan step going red.

Worth separating from this: it is Jenkins' `waitForQualityGate()` that depends on a
server-side webhook pointing back at the Jenkins instance. Neither option here does,
and a repo moving off Jenkins has one less piece of server configuration to care
about.

No HMCTS repository sets `sonar.qualitygate.wait` today. A repo moving off Jenkins
therefore loses the blocking gate it used to get from `waitForQualityGate()` unless
something supplies it, which is why `quality-gate` defaults to `true` here.

### The CLI scanner is not for Gradle or Maven

`SonarSource/sonarqube-scan-action` is the standalone scanner, and its own
documentation says to use SonarScanner for Gradle or Maven on those projects
instead. Pointed at a JVM build it analyses source files without the compiled
classes, dependencies or the build's resolved properties, and reports a thin,
misleading result rather than failing. Set `scanner` to match the build.

### `args` splits differently per scanner

One `-Dkey=value` per line, and quote any value containing spaces:

```yaml
          args: |
            -Dsonar.projectName="My Project"
            -Dsonar.exclusions=**/generated/**
```

The quoting matters because the two paths do not split alike. The `gradle` and
`maven` modes read the lines with `mapfile`, so a line is one argument however many
spaces it contains. The `cli` mode hands the block to
`SonarSource/sonarqube-scan-action`, which parses it with `string-argv` and therefore
re-splits on whitespace — so an unquoted `-Dsonar.projectName=My Project` is one
property under `gradle` and two arguments under `cli`, the second of which the
scanner rejects or misreads. Quoting makes both behave the same.

(Earlier versions of the upstream action refused shell metacharacters here. v8.3.0
does not — it tokenises rather than shelling out — so the only rule left is the
splitting one.)

### No `report-task.txt` fails the step when a gate was requested

The summary step looks for the scanner's receipt in `.scannerwork/`, `build/sonar/`
and `target/sonar/`. If there is none, nothing was analysed — the usual causes are a
Gradle or Maven task that resolved to a no-op (up to date, or disabled with
`sonar.skip=true`), a task or goal name that does not match what the build defines,
or a scanner that never started.

With `quality-gate: true` that is a **failure**, not a warning: the quality gate row
reads *Never evaluated*, an error annotation lists those causes, and the step exits
non-zero even though the scan command itself exited zero. On Jenkins
`waitForQualityGate()` would have errored in the same situation, and a green build
with no gate is the one thing a repo moving off Jenkins must not silently inherit. If
a non-blocking scan is genuinely what you want, say so with `quality-gate: false` —
then a missing report is reported in the summary and left green.

The gate verdict is otherwise inferred from the scan step's exit status, so this is
also what stops a task that never contacted the server from being printed as
"Passed".

**Receipts have to be this run's.** Before scanning, the action writes a marker file
under `$RUNNER_TEMP`, and the summary ignores any `report-task.txt` older than it.
Without that check a receipt left by an earlier scan in the same job, a
`coverage-artifact` that happened to include `build/`, or an unclean self-hosted
runner would be read as a passing gate and linked as this run's dashboard. A stale
receipt is announced in a warning and then treated as no report at all — which, with
`quality-gate: true`, fails the step.
