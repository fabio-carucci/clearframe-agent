# AGENTS.md

Guidance for coding agents working in this repository. People start at [README.md](README.md).

Clearframe is a TypeScript agent that assembles rights-cleared video datasets for AI training. A
model proposes clips through tools; a deterministic rule decides whether each clip may enter the
manifest. It runs locally as a CLI and on AWS as a Lambda behind a function URL.

## Commands

| Task                                    | Command                                                 |
| --------------------------------------- | ------------------------------------------------------- |
| Install                                 | `pnpm install`                                          |
| Typecheck, unit tests, formatting       | `pnpm typecheck`, `pnpm test`, `pnpm format:check`      |
| Run the agent once                      | `pnpm agent --territory ES "10 Spanish cooking clips"`  |
| Eval suite (with the rule)              | `pnpm eval [--repeat N] [--cases id,id] [--label name]` |
| Eval suite without the rule (ablation)  | `pnpm eval:no-rule [...]`                               |
| Regenerate catalog, then its embeddings | `pnpm catalog:generate && pnpm catalog:embed`           |
| Lambda bundle                           | `pnpm build:lambda`                                     |

`pnpm agent`, `pnpm eval` and `pnpm catalog:embed` call Anthropic and Amazon Bedrock and cost real
money (an eval run is about $0.05). They read `.env` (see `.env.example`) and an AWS profile. Ask
before running them.

Vitest does not typecheck. Run `pnpm typecheck` and `pnpm test`; CI runs both.

Never run `terraform apply`. `infra/bootstrap` and `infra/github` are applied by an administrator;
`infra/env/dev` is applied by CI on merge to `main`.

## Layout

| Path             | Contents                                                                    |
| ---------------- | --------------------------------------------------------------------------- |
| `src/rights/`    | `checkTrainingRights`, the pure rule                                        |
| `src/agent/`     | Agent loop, tools, `ManifestDraft`, run orchestration, cost, error mapping  |
| `src/catalog/`   | Zod schemas, deterministic generator, local and S3 loaders                  |
| `src/retrieval/` | Titan embeddings, filtered cosine ranking                                   |
| `src/tracing/`   | Run records, DynamoDB/S3 store, JSON logs                                   |
| `src/lambda/`    | Function URL handler and request validation                                 |
| `evals/`         | Cases, metrics, no-rule ablation draft, runner, committed reports           |
| `infra/`         | `bootstrap` (state bucket), `github` (OIDC roles), `modules/api`, `env/dev` |
| `scripts/`       | CLIs for generation, embedding, local runs and the Lambda build             |
| `data/`          | Generated catalog and its embedding index, both committed                   |

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
6. Code under `src/` never imports from `evals/`. The rule-free draft exists only there.
7. Raw provider error messages never reach API callers; callers get `RunError.code`.
8. Secrets never pass through Terraform. SSM parameters are created with the AWS CLI.
9. Every IAM permission names a specific resource. The CI deploy role can create roles only with
   the workload permissions boundary attached.
10. After changing `data/catalog.json`, rerun `pnpm catalog:embed`; a fingerprint test fails
    otherwise.
11. Changing `MODEL_ID` needs a matching `PRICING` entry; the typecheck fails otherwise.

## Conventions

- TypeScript strict, ESM, Zod schemas as the single source of types (`z.infer`).
- Tests sit next to the code as `*.test.ts`.
- Prettier with a 100-column width.
- Comments state what the code cannot: a non-obvious constraint and what breaks if it is removed.
  No comments that restate the code.
- Small conventional commits.
- After changing agent behaviour (instructions, tools, model, effort), run `pnpm eval` and paste
  the summary table into the pull request.
