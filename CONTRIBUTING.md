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

The project is pre-alpha and does not yet have a runnable application scaffold.
Environment setup, test commands, and platform prerequisites will be documented
here as soon as they exist. A contribution should not introduce a second build
system or framework merely to get ahead of that decision.

## Product and architecture guardrails

Contributions should preserve these boundaries:

- Jamie owns recording and transcription; Constellation imports meetings.
- Calendar access is adapter-based and read-only until a separate product
  decision changes that scope.
- Agents use public application commands and queries; the product does not
  embed a chat UI or local model runtime.
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
