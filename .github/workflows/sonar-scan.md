# Sonar Code Quality Scan Workflow

Run a Sonar analysis and block on the quality gate, as a whole job. Supports the
standalone SonarScanner CLI, the `org.sonarqube` Gradle plugin and
`sonar-maven-plugin`, against either SonarQube Cloud or the self-hosted HMCTS
SonarQube Server.

**Workflow file:** `.github/workflows/sonar-scan.yaml`

This is the GitHub Actions equivalent of the Sonar stage `cnp-jenkins-library` gives
Jenkins repos for free — `withSonarQubeEnv`, `builder.sonarScan()` and
`waitForQualityGate()` inside a 30-minute timeout. The
[composite action](../../sonar-scan/README.md) holds the logic; this workflow is a
single job that calls it, adds the checkout, and takes the token through `secrets`.

> **💡 This workflow cannot run your tests.** Sonar reads a coverage report off disk;
> it does not produce one. Either upload the report from your test job and name it in
> `coverage-artifact`, or use the [composite action](../../sonar-scan/README.md)
> inside your own test job. A scan with no coverage report succeeds and records zero
> coverage, which your quality gate may well pass.

## Features

- `fetch-depth: 0` on the checkout, so Sonar can blame issues and detect new code —
  the caller cannot get this wrong, unlike with the composite action
- Optional coverage-artifact download, which is the tests-in-one-job,
  scan-in-another shape `hmcts/cath-service` and `hmcts/ccd-case-ui-toolkit` already use
- Optional JDK setup for `scanner: gradle` and `scanner: maven`
- Blocks on the quality gate via the scanner-native `sonar.qualitygate.wait`
- `secrets: inherit` picks up `SONAR_TOKEN` without the caller naming it
- Forwards `dashboard-url` so a downstream job can link the analysed project

## When to use

**Use this reusable workflow when:**

- Your tests run in a separate job and publish coverage as an artifact
- The scan can live in its own job
- You want the full-history checkout handled for you
- You want minimal boilerplate and `secrets: inherit`

**Use the [composite action](../../sonar-scan/README.md) when:**

- The scan must share a job with your tests, because coverage is produced there and
  you would rather not round-trip it through an artifact
- You need setup steps the workflow has no inputs for — a Node toolchain, a database,
  a Docker service, `yarn install`
- One job scans several projects, or you want a matrix
- You need the `dashboard-url` output mid-job

## Example Usage

### Node repo, tests and coverage in a separate job

The common shape. `lcov.info` has to land where your
`sonar.javascript.lcov.reportPaths` says it will.

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: yarn install --immutable
      - run: yarn test --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: lcov.info

  sonar:
    needs: test
    uses: hmcts/cnp-githubactions-library/.github/workflows/sonar-scan.yaml@main
    with:
      coverage-artifact: coverage-report
    secrets: inherit
```

### Gradle repo on the self-hosted HMCTS server

Gradle keeps its analysis properties in `build.gradle`, so there is nothing to point
at a properties file. The JDK is this workflow's job, the coverage report is your
build's.

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: '21'
      - run: ./gradlew build jacocoTestReport
      - uses: actions/upload-artifact@v4
        with:
          name: jacoco
          path: build/reports/jacoco/

  sonar:
    needs: build
    uses: hmcts/cnp-githubactions-library/.github/workflows/sonar-scan.yaml@main
    with:
      scanner: gradle
      sonar-host-url: https://sonar.reform.hmcts.net/
      java-version: '21'
      coverage-artifact: jacoco
      coverage-path: build/reports/jacoco/
    secrets: inherit
```

Note the Gradle scan re-runs the build on the scan runner, because the `sonar` task
needs the compiled classes. If that is wasteful for your repo, put the composite
action at the end of your build job instead.

### Skipping the scan on fork pull requests

A fork PR gets no secrets, `secrets: inherit` included, so the job fails by design
rather than scanning nothing. Guard it:

```yaml
jobs:
  sonar:
    if: github.event.pull_request.head.repo.fork == false
    uses: hmcts/cnp-githubactions-library/.github/workflows/sonar-scan.yaml@main
    secrets: inherit
```

The Jenkins `only_deploy` label has the same shape — there is no input for it,
because on Actions it is a condition on the job you own:

```yaml
    if: ${{ !contains(github.event.pull_request.labels.*.name, 'only_deploy') }}
```

### Creating the project on the default branch

```yaml
jobs:
  sonar:
    uses: hmcts/cnp-githubactions-library/.github/workflows/sonar-scan.yaml@main
    with:
      create-project: ${{ github.ref == 'refs/heads/master' }}
      visibility: private        # a private repo should say so
    secrets: inherit
```

### Reading the dashboard URL downstream

```yaml
jobs:
  sonar:
    uses: hmcts/cnp-githubactions-library/.github/workflows/sonar-scan.yaml@main
    secrets: inherit

  notify:
    needs: sonar
    if: always()
    runs-on: ubuntu-latest
    steps:
      - run: echo "Analysed at ${{ needs.sonar.outputs.dashboard-url }}"
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `scanner` | `cli`, `gradle` or `maven`. Must match the build — the CLI scanner cannot analyse Gradle or Maven projects. | No | `cli` |
| `sonar-host-url` | Sonar server to analyse against | No | `https://sonarcloud.io` |
| `working-directory` | Directory the scan runs from, and the CLI scanner's project base directory | No | `.` |
| `quality-gate` | Wait for the gate and fail the job when it does not pass | No | `true` |
| `quality-gate-timeout` | Seconds to wait for the gate. Matches the Jenkins 30-minute timeout. | No | `'1800'` |
| `args` | Extra analysis properties, one `-Dkey=value` per line | No | (empty) |
| `gradle-task` | Gradle task to run | No | `sonar` |
| `maven-goals` | Maven goals to run | No | `sonar:sonar` |
| `create-project` | Create the project over the API if it does not exist | No | `false` |
| `properties-file` | Where `create-project` falls back to for the key, name and organization | No | `sonar-project.properties` |
| `project-key` | Takes precedence over `sonar.projectKey` | No | (empty) |
| `project-name` | Takes precedence over `sonar.projectName` | No | (empty) |
| `organization` | Takes precedence over `sonar.organization`. Required by `create-project` on SonarQube Cloud only. | No | (empty) |
| `visibility` | Visibility of a created project: `public` or `private` | No | `public` |
| `coverage-artifact` | Artifact holding the coverage report, downloaded before the scan. Empty to skip. | No | (empty) |
| `coverage-path` | Directory the coverage artifact is extracted into | No | `.` |
| `java-version` | Java version to set up. Empty skips JDK setup. | No | (empty) |
| `java-distribution` | Java distribution, when `java-version` is given | No | `temurin` |
| `runner` | GitHub runner to use | No | `ubuntu-latest` |

Every input above is passed straight through to the composite action with the same
default, except the last five, which are this workflow's own. The two forms therefore
cannot drift.

`quality-gate` and `create-project` are real booleans here, where the action takes
strings; GitHub renders them as the lowercase `true`/`false` the action's validation
requires. `quality-gate-timeout` is deliberately a string, so the value reaching the
scanner is exactly what you wrote.

## Secrets

| Secret | Description | Required |
|--------|-------------|----------|
| `SONAR_TOKEN` | Sonar analysis token | Yes |

`SONAR_TOKEN` appears to be available at the `hmcts` org level — both
`hmcts/cath-service` and `hmcts/ccd-case-ui-toolkit` consume it without declaring it
at repository level — which would make `secrets: inherit` sufficient. Confirm it is
visible to your repository before relying on that.

`create-project` needs a token permitted to create projects, which is a separate
permission from the Execute Analysis a scan needs. The org-level token may not carry
it; see the [action's README](../../sonar-scan/README.md#create-project-needs-more-than-an-analysis-token).

`create-project` will also refuse to give a repository a *second* Sonar project. If
the declared key does not exist but `<organization>_<repo-name>` does — the key
SonarQube Cloud's Automatic Analysis invents for any repo with the SonarCloud GitHub
App installed — the job fails and tells you to point `sonar.projectKey` at the
existing project, or to have Automatic Analysis disabled for the repository. Two
projects for one repo is how you end up with PR decoration bound to a source-only
scan reporting 0% coverage. Detail, and the limits of the check, are in the
[action's README](../../sonar-scan/README.md#create-project-refuses-to-give-a-repository-a-second-project).

The workflow passes the token to the underlying action as an input, because GitHub
does not expose the `secrets` context to composite actions. Callers pass no token of
any kind beyond `secrets: inherit`.

## Outputs

| Output | Description |
|--------|-------------|
| `dashboard-url` | URL of the analysed project on Sonar. Empty when the scanner produced no report. |

## Notes

- **A fork pull request gets no secrets**, so `SONAR_TOKEN` arrives empty and the job
  fails with an error annotation rather than appearing to scan. That is deliberate;
  guard the job with an `if:` as shown above.
- **Coverage must already exist.** This workflow runs no tests. If the downloaded
  artifact lands somewhere other than the path your analysis properties name, the
  scan passes and reports zero coverage.
- **A `sonar.host.url` hardcoded in `build.gradle` or `sonar-project.properties`
  overrides `sonar-host-url`.** Delete it from the repo and let the input decide.
- **Gradle builds that wire coverage onto the deprecated `sonarqube` task** — for
  example `tasks.named('sonarqube') { dependsOn jacocoTestReport }` — need
  `gradle-task: sonarqube`, or the `dependsOn` moved onto `sonar`.
- **No `report-task.txt` means nothing is confirmed.** The job summary then reports
  the quality gate as never evaluated rather than reading a zero exit status as a
  pass, and warns. Treat it as a scan that did not happen.

All of these are explained at length in the
[composite action's README](../../sonar-scan/README.md), which is the reference for
the scan behaviour itself.
