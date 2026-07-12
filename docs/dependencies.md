# Dependency inventory

Constellation pins direct dependencies and commits the npm lockfile. CI installs
with `npm ci --ignore-scripts` and runs `npm audit` as part of lockfile review.

## Runtime

| Dependency  | Purpose                                                                                       | License | Boundary         |
| ----------- | --------------------------------------------------------------------------------------------- | ------- | ---------------- |
| `zod` 4.4.3 | Strict runtime command, query, context, and outcome validation with inferred TypeScript types | MIT     | `contracts` only |

Zod replaces hand-written boundary parsing; it does not execute product logic,
access storage, or receive secrets outside the values being validated. Validation
errors are converted to content-safe code/path pairs and never echo input values.

## Development

| Dependency                               | Purpose                                   | License    |
| ---------------------------------------- | ----------------------------------------- | ---------- |
| TypeScript 6.0.3                         | Strict compilation and project references | Apache-2.0 |
| ESLint 10.7.0 + typescript-eslint 8.63.0 | TypeScript static checks                  | MIT        |
| Prettier 3.9.5                           | Deterministic formatting                  | MIT        |
| markdownlint-cli2 0.23.0                 | Public Markdown checks                    | MIT        |
| `@types/node` 24.13.3                    | Node.js 24 compile-time declarations      | MIT        |

The product currently has no runtime native module, telemetry SDK, network
client, model-provider client, or post-install build step. Native SQLCipher and
Electron work remains outside this reference-kernel dependency graph until its
separate cross-platform gates pass.
