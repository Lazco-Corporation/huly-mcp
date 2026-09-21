# Security Policy

## Supported versions

This project tracks the `main` branch. Fixes land there, and only the latest
release is supported. There are no backport branches.

| Version | Supported |
|---|---|
| `main` / latest release | yes |
| anything older | no |

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately through either channel:

- Email **security@lazco.tw**
- GitHub [private vulnerability reporting](https://github.com/Lazco-Corporation/huly-mcp/security/advisories/new)

Preferred languages: English, 繁體中文.

Please include:

- What the issue is and how it can be triggered
- Affected version or commit
- Your Huly and Node versions, if relevant
- A proof of concept, if you have one

**Never include a real Huly token, password, or workspace data in a report.**
Redact them. If you believe a credential has already been exposed, rotate it
first and say so.

### What to expect

- Acknowledgement within 3 business days
- An initial assessment, including whether we consider it in scope, within
  7 business days
- Coordinated disclosure once a fix ships, crediting you unless you prefer
  otherwise

Lazco's general security contact and policy are published at
<https://www.lazco.tw/abuse>.

## Scope

In scope: anything in this repository — the MCP server, the connection layer,
the diagnostic script, and its configuration handling.

Out of scope, please report upstream instead:

- Huly itself and `@hcengineering/*` packages → [Huly Labs](https://github.com/hcengineering/platform)
- The Model Context Protocol SDK → [modelcontextprotocol](https://github.com/modelcontextprotocol)
- Your MCP client (Claude Desktop, Claude Code, and others) → its vendor
- Your own Huly deployment, reverse proxy, or TLS configuration

## Operator notes

These are properties of the design, not vulnerabilities. Understand them before
deploying.

**Credentials live in your MCP client config.** `HULY_TOKEN`, `HULY_EMAIL`, and
`HULY_PASSWORD` are passed as environment variables, typically from
`claude_desktop_config.json`, which is plain text on disk with no encryption.
Protect that file with filesystem permissions and never commit it. The bundled
`.gitignore` already excludes it.

**Prefer a token over a password.** A token is scoped and expires. A password is
not, and Huly locks accounts after repeated failed attempts, so a leaked or
mistyped password is also an availability problem.

**The server acts with your full account permissions.** It does not add an
authorisation layer of its own. Anything your Huly account can read or write in
the configured workspace, a model driving this server can read or write —
including `huly_delete_document`. Use a dedicated account with least privilege
rather than an admin account.

**Deletion is guarded but real.** `huly_delete_document` requires `confirm=true`
and refuses to delete a document that still has children, but it is not
reversible and there is no trash. Huly has no undo for this path.

**Content updates replace the whole document.** `huly_update_document` overwrites
the entire body. A model that reads, edits, and writes back will lose any
concurrent edit made by a human in the meantime.

**Tool output is untrusted input.** Document and issue content comes from your
Huly workspace and is returned verbatim to the model. Anyone who can write to
that workspace can attempt prompt injection through it. Treat workspace write
access as equivalent to influence over the model.
