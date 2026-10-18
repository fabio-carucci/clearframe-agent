# AGENTS.md

Guidance for coding agents working in this repository. People start at [README.md](README.md).

Clearframe is a TypeScript agent that assembles rights-cleared video datasets for AI training. A
model proposes clips through tools; a deterministic rule decides whether each clip may enter the
manifest. It runs locally as a CLI and on AWS as a Lambda behind CloudFront, with a static Next.js
page and Cognito sign-in.

## Commands

| Task                                    | Command                                                 |
| --------------------------------------- | ------------------------------------------------------- |
| Install                                 | `pnpm install`                                          |
| Typecheck every package, tests, format  | `pnpm typecheck`, `pnpm test`, `pnpm format:check`      |
| Run the agent once                      | `pnpm agent --territory ES "10 Spanish cooking clips"`  |
| Eval suite (with the rule)              | `pnpm eval [--repeat N] [--cases id,id] [--label name]` |
| Eval suite with the CI quality gate     | `pnpm eval --min-recall 0.9 --min-precision 0.95`       |
| Eval suite without the rule (ablation)  | `pnpm eval:no-rule [...]`                               |
| Regenerate catalog, then its embeddings | `pnpm catalog:generate && pnpm catalog:embed`           |
| Lambda bundle (`apps/api/dist`)         | `pnpm build:lambda`                                     |
| Web app: dev server, static export      | `pnpm web:dev`, `pnpm web:build`                        |

`pnpm agent`, `pnpm eval` and `pnpm catalog:embed` call Anthropic and Amazon Bedrock and cost real
money (an eval run is about $0.05). They read `.env` (see `.env.example`) and an AWS profile. Ask
before running them.

Vitest does not typecheck. Run `pnpm typecheck` and `pnpm test`; CI runs both.

Never run `terraform apply`. `infra/bootstrap` and `infra/github` are applied by an administrator;
`infra/env/dev` is applied by CI on merge to `main`.

## Layout

A pnpm workspace. These are the only allowed dependencies between packages:

```
apps/web            -> packages/contracts
apps/api            -> packages/core, packages/contracts
evals               -> packages/core, packages/contracts
packages/core       -> packages/contracts
packages/contracts  -> zod only
```

| Path                  | Contents                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `packages/contracts/` | Zod schemas of the HTTP API: request, manifest, steps, response. Depends only on Zod.     |
| `packages/core/`      | Catalog, rights rule, retrieval, agent loop, cost; scripts for the catalog and local runs |
| `apps/api/`           | Lambda handler, Cognito token check, request validation, DynamoDB and S3 adapters, bundle |
| `apps/web/`           | Static Next.js page: sign-in, compose form, result view                                   |
| `evals/`              | Cases, metrics, no-rule ablation draft, runner, committed reports                         |
| `infra/`              | `bootstrap`, `github` (OIDC roles), modules `api`, `web`, `auth`, `env/dev`               |
| `data/`               | Generated catalog and its embedding index, both committed                                 |

Workspace packages export TypeScript source (`@clearframe/core/agent/run` maps to
`packages/core/src/agent/run.ts`). esbuild, Next.js (`transpilePackages`), tsx and Vitest compile it
where it is used, so there is no build step between packages.

## Invariants

Each of these is load-bearing; most are pinned by a test.

1. A clip enters a manifest only through `ManifestDraft.propose`, which runs the rights rule. Do
   not add another write path.
2. The model never chooses the territory or date the rule checks. They are fixed when the draft is
   created; tool input schemas must not contain them.
3. The manifest is built from the draft, never parsed from model text.
4. `checkTrainingRights` stays pure (no clock, no I/O) and fails closed: a license is invalid on
   its expiry day, and a malformed date throws.
5. The API rejects usage dates in the past, which would revive expired licenses.
6. Nothing under `apps/` or `packages/` imports from `evals/`. The rule-free draft exists only
   there.
7. Raw provider error messages never reach API callers; callers get `RunError.code`.
8. Secrets never pass through Terraform: the Anthropic key parameter and Cognito users are created
   with the AWS CLI. Non-secret runtime settings, such as the Cognito ids, may.
9. Every IAM permission names a specific resource, except actions AWS cannot scope to one. The CI
   deploy role can change only the agent role, only with the workload permissions boundary
   attached, and can never change who may assume a role.
10. After changing `data/catalog.json`, rerun `pnpm catalog:embed`; a fingerprint test fails
    otherwise. Then fix the handwritten `clipIds` in `evals/cases.ts` by reading the catalog;
    never fill them in by running the rule, or the eval grades the rule with itself.
11. Changing `MODEL_ID` needs a matching `PRICING` entry; the typecheck fails otherwise.
12. The function URL stays `AWS_IAM`, invocable only by the CloudFront distribution through origin
    access control. Never grant it to `*`.
13. User access tokens travel in `x-clearframe-access-token`; `Authorization` carries CloudFront's
    signature. POSTs through CloudFront must send `x-amz-content-sha256` with the body's SHA-256.
14. Per-environment settings (Cognito ids) reach the Lambda through SSM and the page through
    `config.json` at runtime. Baking them into a build would bring back the dependency cycle between
    the `api`, `web` and `auth` modules.
15. `packages/contracts` depends only on Zod, because it ships to the browser. `packages/core` holds
    no storage or HTTP adapters; those live in `apps/api`.
16. Run events are emitted by the tools through `RunContext.emit`, and `emit` never throws into the
    run: a client that disconnects must not stop a run from finishing and being recorded.
17. A run is counted against the user's daily quota after the request is validated and before
    anything is loaded, and a quota that cannot be read refuses the run.
18. The CloudFront gate (`infra/modules/web/api-gate.js`) only filters early. The Lambda keeps every
    check the gate makes, and verifies the token signature, which the gate cannot.
19. In the deploy workflow, only the `deploy` job may request `id-token: write`, and it runs no
    package code: no install, no npm scripts. The eval workflow reads only the CI Anthropic key.

## Conventions

- TypeScript strict, ESM, Zod schemas as the single source of types (`z.infer`).
- Tests sit next to the code as `*.test.ts`.
- Prettier with a 100-column width.
- Comments state what the code cannot: a non-obvious constraint and what breaks if it is removed.
  No comments that restate the code.
- Small conventional commits.
- After changing agent behaviour (instructions, tools, model, effort), run `pnpm eval` and paste
  the summary table into the pull request.
