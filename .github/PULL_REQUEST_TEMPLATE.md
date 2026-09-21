# Summary

<!-- What changes, and why. Link the issue if there is one. -->

Closes #

## Verification

CI only syntax-checks this project — there is no unit test suite, because the
dependency surface is almost entirely remote Huly state. Verification against a
real instance is the review signal, so please fill this in.

- [ ] `npm run check` passes
- [ ] `npm run doctor` passes against a real Huly instance
- [ ] Exercised the affected tools through a real MCP client

**Huly version tested against:**
**Node version:**

## Content read/write changes

<!-- Delete this section if you did not touch content paths. -->

- [ ] Tested against a document that **already had** collaborative content, not
      only a newly created one

api-client's `uploadMarkup` calls the collaborator's `createContent`, which the
server discards when a document already has collaborative state — the API
returns success while nothing changes. A test that only creates and writes will
pass while the bug is live.

## Compatibility

- [ ] No tool was renamed or removed
- [ ] No input schema changed in a breaking way
- [ ] `@hcengineering/api-client` was not bumped

<!-- If any box above is unchecked, explain why and how callers should migrate. -->

## Checklist

- [ ] English only, in code, comments, and commit messages
- [ ] Conventional Commits subject (`feat:`, `fix:`, `docs:`, `chore:`, ...)
- [ ] No `console.log` in `src/` — stdout carries the JSON-RPC stream
- [ ] No credentials, tokens, internal hostnames, or workspace content added
- [ ] `CHANGELOG.md` updated under Unreleased, for user-visible changes
