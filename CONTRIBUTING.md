# Contributing to Constellation

Thank you for considering a contribution. Constellation is being built in the
open from its earliest stage, so clear problem statements and careful design
feedback are as useful as code.

## Start with context

Before doing substantial work:

1. Search existing issues and discussions.
2. Open a discussion for an architectural change, a new domain concept, or a
   feature whose product behavior is not yet agreed.
3. Open or claim an issue before investing in an implementation.

This prevents two people from solving different versions of the same problem.
Small documentation fixes do not need advance discussion.

## Current development status

The project is pre-alpha. Signed desktop releases are published, and the
desktop application also runs locally from source — see Development shell
below. It has a storage-neutral TypeScript reference kernel and
conformance suite.
Use the Node.js version in `.nvmrc`, then run:

```sh
npm ci --ignore-scripts
npm run check
```

The gate must pass on Linux, macOS, and Windows. A contribution should not
introduce a second build system or framework merely to get ahead of a capability
that is not present yet.

## Development shell

macOS contributors with a running local Alpha install can exercise the desktop
application unpackaged, against a disposable copy of their own workspace:

```sh
npm run dev:snapshot   # quit Constellation Local Alpha first
npm run dev:desktop
```

`dev:snapshot` copies the installed application's state into a separate
`Constellation Dev` directory, rewriting each copied grant descriptor to point
at that copy's own socket before printing an MCP server entry you can
register alongside your existing one. From the moment the snapshot is taken,
the installed application's own MCP server is never touched. `dev:desktop`
builds the main process and renderer in watch mode and launches Electron
against that copy.

For UI work that does not need the real workspace, `npm run dev:preview` runs
the renderer against an in-memory kernel instead.

To inspect the development shell's MCP surface — read tool schemas and raw
refusal payloads — run `npm run dev:mcp-inspector` while `dev:desktop` is
running. It fetches the
[MCP Inspector](https://github.com/modelcontextprotocol/inspector) on demand
via `npx` rather than adding it as a dependency.

This shell has two limits worth knowing before relying on it:

- Packaging-only defects are invisible here. Anything that only breaks in a
  signed, packaged build — ASAR path resolution, code signing, entitlements —
  can look healthy in the development shell and fail once packaged.
- The copy is one-way. Nothing done in the development shell flows back to
  the installed application's own workspace.

## Product and architecture guardrails

Contributions should preserve these boundaries:

- Jamie owns recording and transcription; Constellation imports meetings.
- Calendar access stays behind a platform-neutral adapter. Reads are supported;
  every concrete write or previewed batch of Constellation-owned work blocks
  requires explicit consent.
- Agents use MCP over the same application commands and queries as the desktop;
  the product does not embed a chat UI, model runtime, or alternate agent API.
- Business rules belong behind one command/query contract shared by the UI,
  integrations, and agents.
- Platform-specific code must stay behind a narrow, capability-driven adapter.
- External identifiers, idempotency, auditability, and safe retry behavior are
  part of feature correctness.

## Pull requests

Keep pull requests focused and easy to review. A good pull request:

- explains the user problem and the chosen behavior;
- links the relevant issue or discussion;
- includes tests proportional to the change;
- updates public documentation when observable behavior changes;
- includes screenshots or a short recording for visible UI changes;
- calls out macOS- or Windows-specific behavior explicitly;
- contains no credentials, private work data, transcripts, or personal data.

Draft pull requests are welcome for early technical feedback.

## Commits

Use concise [Conventional Commits](https://www.conventionalcommits.org/) where
practical, for example:

```text
feat(calendar): add normalized event reader
fix(import): preserve Jamie external identifiers
docs: clarify contributor setup
```

Prefer a small number of coherent commits over a transcript of every edit.

## AI-assisted contributions

AI assistance is welcome, but the contributor remains responsible for every
line submitted. Generated code must be understood, tested, reviewed for license
compatibility, and checked for invented APIs or copied private data.

## Licensing

By submitting a contribution, you agree that it is licensed under the same
[Apache License 2.0](LICENSE) as the project.
