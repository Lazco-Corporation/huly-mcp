# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-27

First public release.

### Added

- Published to npm as `@lazco/huly-mcp`, signed with npm provenance.
  The unscoped name `huly-mcp` belongs to an unrelated project.
- MCP server exposing 12 tools over stdio.
- Documents: list teamspaces, list, read, search, create, update, and delete.
- Issues: list projects, list issues, read an issue with comments, and comment.
- Token and email/password authentication.
- `npm run doctor` connection diagnostic covering configuration, server config, login, data reads, and collaborative content reads.
- `npm run check` for a network-free syntax check of every source file.
- Community and packaging files: `LICENSE` (AGPL-3.0-or-later), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue and pull request templates, and a syntax-check CI workflow.
- Tag-driven npm release through `scripts/release.sh` and `release-npm.yml`.
  The workflow refuses a release tag whose commit `main` does not hold.

### Changed

- Translated the entire project to English, including tool titles, descriptions, argument hints, error messages, code comments, diagnostic output, and the README.
  Contributors outside Taiwan can now read and extend it.
- Generalised the README away from a single private instance to any self-hosted Huly deployment.
  The README now documents Claude Code setup alongside Claude Desktop.

### Fixed

- Document content updates silently doing nothing.
  api-client's `uploadMarkup` calls the collaborator's `createContent`, which the server discards when a document already has collaborative state.
  The call returned success while the content stayed unchanged.
  Updates now route through the collaborator's `updateMarkup` when content already exists.

[Unreleased]: https://github.com/Lazco-Corporation/huly-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Lazco-Corporation/huly-mcp/releases/tag/v1.0.0
