# Slack Notify Action

A composite GitHub Action that posts a message to Slack, via either a bot token (`chat.postMessage`) or an incoming webhook. Supports Block Kit, threading, and resolving GitHub logins to Slack mentions through [`hmcts/github-slack-user-mappings`](https://github.com/hmcts/github-slack-user-mappings).

HMCTS Jenkins pipelines get Slack notification for free from `cnp-jenkins-library` (`sendSlackMessage`, `notifyBuildFailure`), which reads the team's channel from `cnp-jenkins-config/team-config.yml`. GitHub Actions has no equivalent, so repos have been hand-rolling `curl` calls. This action is that missing piece.

> `team-config.yml` is read by the Jenkins shared library at pipeline runtime and is not consulted here. Pass the channel explicitly, or keep it in your own repo's config.

## Features

- Bot token or incoming webhook, with the token taking precedence when both are present
- Block Kit support, with `text` used as the notification fallback
- Threading via `thread-ts` in and `ts` out, so a follow-up can reply to the original alert
- Resolves GitHub logins to Slack mentions, falling back to a plain `@login` when a user is unmapped
- Payloads are assembled with `jq`, so quotes, newlines and braces in a message cannot break the JSON
- Treats Slack's `ok: false` response as a failure — it comes back with HTTP 200, so checking the status code alone would report success
- Does not fail the job by default: a notification usually reports on something more important than itself

## Credentials

GitHub does not expose the `secrets` context to composite actions, so credentials have to arrive as an environment variable on the job or as an explicit input. The ambient variable is preferred, matching `publish-openapi-spec`:

| Credential | Env var | Input |
|---|---|---|
| Bot token | `SLACK_BOT_TOKEN` | `bot-token` |
| Webhook | `SLACK_WEBHOOK_URL` | `webhook-url` |

The action masks whichever it uses, but mask it at the point you fetch it too, so it is never exposed even if this action is not reached.

## Usage

### Bot token from a job env var

```yaml
jobs:
  notify:
    runs-on: ubuntu-latest
    env:
      SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
    steps:
      - uses: hmcts/cnp-githubactions-library/slack-notify@main
        with:
          channel: C0123456789
          text: ":white_check_mark: Deploy to AAT finished."
```

### Bot token from Azure Key Vault

The pattern most HMCTS repos will want: no new GitHub secret, reusing the OIDC session the workflow already has.

```yaml
jobs:
  notify:
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
          channel: "#my-team-builds"
          text: "Nightly tests failed."
```

### Webhook

```yaml
      - uses: hmcts/cnp-githubactions-library/slack-notify@main
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
          text: "Something happened."
```

### Block Kit, with a threaded follow-up

```yaml
      - name: Post the alert
        id: alert
        uses: hmcts/cnp-githubactions-library/slack-notify@main
        with:
          channel: C0123456789
          text: "5xx rate breached"   # fallback for notifications
          blocks: |
            [
              {
                "type": "header",
                "text": { "type": "plain_text", "text": "5xx rate breached" }
              },
              {
                "type": "section",
                "fields": [
                  { "type": "mrkdwn", "text": "*Observed:*\n4.2%" },
                  { "type": "mrkdwn", "text": "*Threshold:*\n2%" }
                ]
              }
            ]

      - name: Reply in thread
        uses: hmcts/cnp-githubactions-library/slack-notify@main
        with:
          channel: C0123456789
          thread-ts: ${{ steps.alert.outputs.ts }}
          text: "Recovered."
```

### Mentioning reviewers

```yaml
      - uses: hmcts/cnp-githubactions-library/slack-notify@main
        with:
          channel: C0123456789
          text: "please take a look at #${{ github.event.pull_request.number }}"
          mention-github-users: ${{ github.event.pull_request.user.login }}
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `channel` | when using a bot token | `''` | Channel ID (`C0123456789`) or name (`#my-channel`). Ignored by webhooks. |
| `text` | one of `text`/`blocks` | `''` | Message text in Slack mrkdwn. Also the notification fallback when `blocks` is set. |
| `blocks` | one of `text`/`blocks` | `''` | Block Kit blocks as a JSON array. |
| `bot-token` | no | `''` | Falls back to `SLACK_BOT_TOKEN`. |
| `webhook-url` | no | `''` | Falls back to `SLACK_WEBHOOK_URL`. |
| `thread-ts` | no | `''` | Parent message timestamp to reply to. Bot token only. |
| `mention-github-users` | no | `''` | Space or comma separated GitHub logins to mention. |
| `username` | no | `''` | Override the posting bot's display name. |
| `icon-emoji` | no | `''` | Override the bot icon, e.g. `:warning:`. |
| `fail-on-error` | no | `false` | Fail the step when Slack cannot be reached or rejects the message. |

## Outputs

| Output | Description |
|---|---|
| `delivered` | `true` when Slack accepted the message, `false` otherwise. |
| `ts` | Timestamp of the posted message, for threading. Empty for webhooks, which do not return one. |

## Notes

- **Channel IDs are more robust than names.** A renamed channel breaks a name; the ID survives. Find it under *View channel details* in Slack.
- **Invite the bot.** `chat.postMessage` returns `not_in_channel` for a channel the bot has not been added to. The action surfaces that error verbatim.
- **Webhooks cannot thread**, and post only to the channel they were created for. `thread-ts` is ignored with a warning, and `ts` comes back empty.
- **`fail-on-error: false` is the default deliberately.** If you gate something on delivery, read the `delivered` output rather than relying on the step's exit status.
