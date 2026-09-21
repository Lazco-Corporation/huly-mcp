# Contributing to huly-mcp

Thanks for considering a contribution. This project is small on purpose, so the
bar is less about process and more about not breaking the two things that are
easy to get wrong: collaborative content writes, and the MCP stdio stream.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

Open an issue first for anything that changes the tool surface — adding a tool,
renaming one, or changing an input schema. MCP clients bind to tool names and
argument shapes, so those are a compatibility contract, not an implementation
detail.

Small fixes (docs, error messages, a bug with an obvious cause) can go straight
to a pull request.

## Development setup

```bash
git clone https://github.com/Lazco-Corporation/huly-mcp.git
cd huly-mcp
npm install
```

You need a Huly instance to develop against. Self-hosting is documented at
[huly.io](https://huly.io); a throwaway workspace is enough.

```bash
export HULY_URL=https://huly.example.com
export HULY_WORKSPACE=my-workspace-slug
export HULY_TOKEN=your-token-here

npm run check     # syntax check, no network
npm run doctor    # end-to-end connection check
```

Run `npm run doctor` **before and after** your change. It exercises login,
data reads, and collaborative content reads, which is most of the surface area
a change can break.

## Testing a change

There is no unit test suite. The dependency surface is almost entirely remote
Huly state, so mocking it would test the mock. Verify against a real instance
instead:

1. `npm run doctor` passes.
2. Point a real MCP client at your working copy and exercise the tools you
   touched.
3. If you touched content read or write paths, test against a document that
   **already has** collaborative content, not only a freshly created one.

That last point is not optional. See below.

## The trap worth knowing

api-client's `uploadMarkup` calls the collaborator's `createContent`, which
means *create a new blob*. Against a document that already has collaborative
state, the server keeps its existing YDoc and discards the new blob. **The API
returns success and the content does not change.**

A test that only creates a document and writes to it will pass while the bug is
live. `huly_update_document` therefore branches on `doc.content == null`, using
`uploadMarkup` for new content and the collaborator's `updateMarkup` for
existing content. Keep that branch intact.

## Code style

- Plain CommonJS. `@hcengineering/api-client@0.7.423` declares
  `types/index.d.ts` in its `package.json` but does not ship that directory, so
  a TypeScript build fails immediately. Do not reintroduce TypeScript until
  upstream fixes that.
- Two-space indent, no semicolons, single quotes. Match the surrounding file.
- Comments explain *why*, not *what*. The non-obvious Huly behaviours are the
  reason this project has comments at all.
- Plain ASCII, sentence case, in code and docs.
- English only, in code, comments, docs, and commit messages. Contributors come
  from everywhere.

## Never write to stdout

The MCP protocol uses stdio for JSON-RPC. A stray `console.log` in the server
corrupts the stream and the client disconnects with a parse error that does not
name the cause. Use `console.error` for diagnostics; stderr is safe and lands
in the client's MCP log.

`scripts/doctor.js` is exempt — it is a CLI, not an MCP server.

## Error messages

Tool errors are read by a model and, indirectly, a user. Say what failed *and*
what to do next. `explain()` in `src/index.js` is the model: it turns
`platform:status:Unauthorized` into a sentence naming the environment variables
to check. Add a case there rather than letting a raw platform code escape.

## Commits and pull requests

- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
  `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
- Lowercase subject, imperative mood, no trailing period.
- One logical change per commit. Keep translation, formatting, and behaviour
  changes in separate commits so review can see what actually changed.

In the pull request, state which Huly version you tested against and whether
`npm run doctor` passed. Reviewers cannot reproduce your instance.

## Compatibility

Huly moves quickly and `api-client` is pinned exactly (`0.7.423`) for that
reason. If you bump it, say so explicitly in the pull request and re-run the
full verification — a major bump has broken the content API before.

## License

Contributions are licensed under AGPL-3.0-or-later, matching the project. If
you cannot accept those terms, please do not submit a pull request.
