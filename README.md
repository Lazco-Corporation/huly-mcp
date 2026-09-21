# huly-mcp

[![CI](https://github.com/Lazco-Corporation/huly-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Lazco-Corporation/huly-mcp/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

**MCP server for [Huly](https://huly.io) — read and write Huly documents and issues from Claude Desktop, Claude Code, or any MCP client.**

Huly does not ship an official MCP server, but it does publish an official SDK,
[`@hcengineering/api-client`](https://www.npmjs.com/package/@hcengineering/api-client),
installable from the public npm registry with no GitHub token required.
This project is a thin [Model Context Protocol](https://modelcontextprotocol.io) layer on top of that SDK.

Works with self-hosted Huly. Huly Cloud (`huly.app`) uses the same API surface and should work,
but has not been verified — see [Verification](#verification).

- **12 tools** — full document CRUD plus issue reading and commenting
- **Zero build step** — plain CommonJS, no TypeScript, no bundler
- **Actually writes document content** — including the collaborative-editor workaround most
  naive implementations get silently wrong (see [Implementation notes](#implementation-notes))

---

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Configuration](#configuration)
- [Verify before connecting](#verify-before-connecting)
- [Authentication: password vs token](#authentication-password-vs-token)
- [Tools](#tools)
- [Implementation notes](#implementation-notes)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Requirements

- Node.js 20 or newer (verified on v24.12.0)
- A Huly instance — self-hosted, or Huly Cloud
- A Huly account with access to the workspace you want to expose

## Install

```bash
git clone https://github.com/Lazco-Corporation/huly-mcp.git
cd huly-mcp
npm install
```

The package is published as `@lazco/huly-mcp`. The unscoped name `huly-mcp` on
npm belongs to an unrelated project.

## Configuration

The server is configured entirely through environment variables.

| Variable | Required | Description |
|---|---|---|
| `HULY_URL` | yes | Base URL of your Huly instance, e.g. `https://huly.example.com` |
| `HULY_WORKSPACE` | yes | Workspace **URL slug** (see below) |
| `HULY_TOKEN` | one of | Auth token (recommended) |
| `HULY_EMAIL` | one of | Account email — requires `HULY_PASSWORD` |
| `HULY_PASSWORD` | one of | Account password |
| `HULY_TIMEOUT_MS` | no | Connection timeout in ms (default `30000`) |

### Finding your workspace slug

Log in to Huly and read the URL:

```
https://huly.example.com/workbench/my-workspace-slug
                                   ^^^^^^^^^^^^^^^^^ this part
```

Use the slug from the URL, **not** the name shown in the sidebar. They are frequently different,
and this is the single most common setup mistake.

### Claude Desktop

Edit your Claude Desktop config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "huly": {
      "command": "node",
      "args": ["/absolute/path/to/huly-mcp/src/index.js"],
      "env": {
        "HULY_URL": "https://huly.example.com",
        "HULY_WORKSPACE": "my-workspace-slug",
        "HULY_TOKEN": "your-token-here"
      }
    }
  }
}
```

If `node` is not on the PATH Claude Desktop sees (common with `nvm`, `fnm`, or `asdf`),
use the absolute path to the Node binary instead, e.g. `/Users/you/.local/share/fnm/node-versions/v24.12.0/installation/bin/node`.

A copy of this snippet lives in [`claude_desktop_config.example.json`](./claude_desktop_config.example.json).

### Claude Code

```bash
claude mcp add huly \
  --env HULY_URL=https://huly.example.com \
  --env HULY_WORKSPACE=my-workspace-slug \
  --env HULY_TOKEN=your-token-here \
  -- node /absolute/path/to/huly-mcp/src/index.js
```

## Verify before connecting

Run the bundled diagnostic before restarting your MCP client:

```bash
HULY_URL=https://huly.example.com \
HULY_WORKSPACE=my-workspace-slug \
HULY_TOKEN=your-token-here \
npm run doctor
```

It checks, in order: environment variables → server `config.json` → login →
data reads → collaborative content reads. Only restart your client once everything passes.

## Authentication: password vs token

Both are supported. **A token is recommended**, because Huly locks accounts after
repeated failed password attempts.

To get a token, log in through the browser and read it from
DevTools → Application → Local Storage.

Tokens expire. Once one does, every tool reports an authentication failure —
fetch a new token and restart the server.

## Tools

### Documents

| Tool | Purpose |
|---|---|
| `huly_whoami` | Connection check — run this first |
| `huly_list_teamspaces` | List teamspaces |
| `huly_list_documents` | List documents, filtered by space or parent |
| `huly_get_document` | Read document content (markdown / html / markup) |
| `huly_search_documents` | Search titles, optionally including content |
| `huly_create_document` | Create a document, optionally as a child |
| `huly_update_document` | Update title or content |
| `huly_delete_document` | Delete a document (requires `confirm=true`) |

### Issues

| Tool | Purpose |
|---|---|
| `huly_list_projects` | List Tracker projects |
| `huly_list_issues` | List issues |
| `huly_get_issue` | Read an issue, including description and comments |
| `huly_comment_issue` | Comment on an issue |

## Implementation notes

These are the non-obvious parts. If you are extending the server, read this section first.

**Document content is not an ordinary field.** Huly's `Document.content` is a reference to a
collaborative-editing blob (`MarkupBlobRef`), so you cannot write a string to it with
`updateDoc`. You must go through `fetchMarkup` / `uploadMarkup`, which talk to
`COLLABORATOR_URL`. Creating a document *with* content is therefore two steps: create the
document to get an id, then upload the markup and write the reference back.

**Node needs an explicit WebSocket implementation.** `connect()` runs over WebSocket and Node
has no global `WebSocket`, so `NodeWebSocketFactory` must be passed in (already handled). If
you front Huly with a reverse proxy, it must forward `Upgrade` / `Connection` headers.

**Updating content must go through the collaborator — a trap worth knowing.** api-client's
`uploadMarkup` actually calls the collaborator's `createContent`, which means *create a new
blob*. Used against a document that already has collaborative state, the server keeps its
existing YDoc and silently discards the new blob — **the API reports success and the content
does not change.** The correct call is the collaborator's `updateContent` (`updateMarkup`),
which api-client does not expose, so `src/huly.js` builds its own collaborator client.

As a result `huly_update_document` branches: `uploadMarkup` when the document has no content
yet, `updateMarkup` when it does. This bug is fixed and covered by end-to-end testing.

**Content updates replace the whole body.** The `content` argument to `huly_update_document`
replaces the entire document. To append, read with `huly_get_document`, merge, then write back.

**Markdown tables become HTML tables.** Write a table and read it back and you get `<table>`
markup rather than the original `|---|` syntax. The content is correct and renders correctly in
the Huly UI, but the round trip is not byte-symmetrical.

**CommonJS, not TypeScript.** `@hcengineering/api-client@0.7.423` declares `types/index.d.ts`
in its `package.json`, but that directory is not actually published with the package, so a
TypeScript build fails immediately. Hence plain JavaScript.

## Verification

End-to-end tested against a self-hosted Huly instance — 18 checks, all passing:
create / read / update / second update / child documents / listing by `parentId` /
delete guard / refusing to delete a parent with children / search / issue reads /
JSON-RPC stream integrity. All test fixtures were cleaned up afterwards.

Verified against: Huly 0.7.426, api-client 0.7.423, MCP SDK 1.30.0, Node v24.12.0.

When your Huly instance updates, and especially if `api-client` takes a major version bump,
update this project's dependencies alongside it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Workspace not found | `HULY_WORKSPACE` is set to the display name; use the URL slug instead |
| Authentication failed | Expired token or wrong credentials (repeated password failures lock the account) |
| Connection timeout | Reverse proxy is not forwarding WebSocket upgrades |
| Tools not visible in the client | Fully quit and reopen Claude Desktop — closing the window is not enough |
| Content reads fail | Check that `COLLABORATOR_URL` in the server's `config.json` is not empty |

Claude Desktop MCP log:

```bash
# macOS
tail -f ~/Library/Logs/Claude/mcp-server-huly.log
```

Lines like `no document found, failed to apply model transaction, skipping` come from the Huly
server's model sync and are harmless noise — they do not indicate a failed tool call.

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) —
it covers the development setup, how to verify a change without a test suite, and the
two conventions that silently break things when violated.

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md).

The short version:

- Run `npm run doctor` against your own Huly instance before and after your change.
- Keep the code plain CommonJS — see [Implementation notes](#implementation-notes) for why.
- Never write to stdout from `src/`; it carries the JSON-RPC stream.
- If you touch content read/write paths, test against a document that **already has**
  collaborative content, not just a fresh one. That is where the silent-failure trap lives.

## Security

Do not report security issues in a public issue. See [SECURITY.md](SECURITY.md) for
private reporting, and for operator notes worth reading before you deploy — in
particular that this server acts with your full Huly account permissions and adds no
authorisation layer of its own.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).

Copyright (C) 2026 Lazco Corporation.

The AGPL's network clause applies: if you modify this server and let others use it over
a network, you must offer them the modified source. Running it unmodified, or using it
privately, carries no such obligation.
