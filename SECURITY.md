# Security

## Sensitive values

This project needs only one secret:

- `DISCORD_WEBHOOK_URL`

Store it as the `discord-production` GitHub Environment secret. Never place it
in source files, README files, Issues, Actions variables, screenshots, or logs.

This project does not use a Discord Bot Token. Discord server IDs, channel IDs,
and application IDs are identifiers, not passwords.

If the webhook URL is exposed, delete that webhook in Discord immediately,
create a new one, and replace the GitHub Environment secret.

## GitHub account

- Use a private repository unless the code itself needs to be public.
- Enable two-factor authentication on the GitHub account.
- Do not add collaborators unless they need access.
- Keep the `discord-production` environment limited to the default branch.
- Do not add `pull_request_target`, `workflow_run`, or manual dispatch triggers
  to the secret-bearing workflow.

## Reporting

Do not open a public Issue containing a secret. Rotate the secret first.
