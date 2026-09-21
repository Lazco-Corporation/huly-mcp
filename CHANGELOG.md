# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Community and packaging files for public release: `LICENSE` (AGPL-3.0-or-later),
  `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue and pull request
  templates, and a syntax-check CI workflow.
- `npm run check` for a network-free syntax check of every source file.

### Changed

- Translated the entire project to English — tool titles, descriptions, argument
  hints, error messages, code comments, diagnostic output, and the README — so
  contributors outside Taiwan can read and extend it.
- Generalised the README away from a single private instance to any self-hosted
  Huly deployment, and documented Claude Code setup alongside Claude Desktop.
- Renamed the package to `@lazco/huly-mcp`; the unscoped name is taken on npm by
  an unrelated project.

## [1.0.0]

### Added

- MCP server exposing 12 tools over stdio.
- Documents: list teamspaces, list, read, search, create, update, and delete.
- Issues: list projects, list issues, read an issue with comments, and comment.
- `npm run doctor` connection diagnostic covering configuration, server config,
  login, data reads, and collaborative content reads.
- Token and email/password authentication.

### Fixed

- Document content updates silently doing nothing. api-client's `uploadMarkup`
  calls the collaborator's `createContent`, which the server discards when a
  document already has collaborative state — returning success while the content
  stayed unchanged. Updates now route through the collaborator's `updateMarkup`
  when content already exists.
