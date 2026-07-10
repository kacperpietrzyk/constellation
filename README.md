# Constellation

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-0b7285.svg)](LICENSE)
[![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-c2410c.svg)](#project-status)

Constellation is an open-source, cross-platform work system built around a
typed graph of projects, tasks, notes, meetings, people, organizations, and
time.

It is designed for two equal operators: a person using a calm desktop
interface and external agents using documented, deterministic APIs. Both must
see and change the same underlying model without hidden fields or a reduced
automation surface.

## Why Constellation

Most productivity tools optimize either for presenting knowledge or for
operating structured work. Constellation aims to make those two sides part of
one system:

- rich documents remain connected to typed entities;
- relationships are queryable data, not decorative links;
- agent actions are auditable, reversible, and subject to the same rules as UI
  actions;
- integrations preserve source identity and can be retried safely;
- macOS and Windows share one product instead of drifting into separate apps.

## Product boundaries

Constellation deliberately does not rebuild capabilities that mature products
already solve well:

- Jamie remains responsible for meeting capture, transcription, and meeting
  intelligence; Constellation imports the result.
- System calendars remain the calendar source of truth; Constellation reads a
  normalized projection through platform adapters.
- AI models and chat interfaces stay outside the product; agents operate
  through the API and, where useful, MCP.
- The project will not maintain independent native feature stacks for every
  operating system.

## Design principles

1. One graph, multiple surfaces.
2. Interface and API capabilities stay in parity.
3. Every external import is idempotent and observable.
4. Every mutation has an actor, history, and a recovery path.
5. Native code exists only at a narrow operating-system boundary.
6. Product complexity must earn its maintenance cost.

## Project status

Constellation is in **pre-alpha foundation work**. There is no installable
release yet, and no API should be considered stable. The repository is public
early so architecture, implementation, and community practices can develop in
the open.

Questions and early product discussion belong in
[GitHub Discussions](https://github.com/kacperpietrzyk/constellation/discussions).
Actionable bugs and scoped proposals belong in
[GitHub Issues](https://github.com/kacperpietrzyk/constellation/issues).

## Contributing

Thoughtful contributions are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and follow our
[Code of Conduct](CODE_OF_CONDUCT.md).

If you find a security issue, do not open a public issue. Follow
[SECURITY.md](SECURITY.md) instead.

## License

Constellation is licensed under the [Apache License 2.0](LICENSE).
