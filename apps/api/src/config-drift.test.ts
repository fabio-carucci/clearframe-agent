import { readFileSync } from "node:fs";
import { EMBEDDING_MODEL_ID } from "@clearframe/core/retrieval/embeddings";
import { describe, expect, it } from "vitest";
import { RUNS_BY_USER_INDEX, RUN_TTL_DAYS } from "./run-record";

/**
 * Some values live in both TypeScript and Terraform: the embedding model the Lambda may invoke,
 * and how long run data is kept. If one side changes alone, IAM denies the call at runtime or
 * DynamoDB and S3 disagree on retention, and nothing else would notice.
 */
const terraform = (path: string) =>
  readFileSync(new URL(`../../../infra/${path}`, import.meta.url), "utf8");

const defaultOf = (hcl: string, variable: string) =>
  hcl.match(new RegExp(`variable "${variable}" \\{[^}]*?default\\s*=\\s*"?([^"\\n]+)"?`))?.[1];

describe("configuration shared with Terraform", () => {
  it.each(["modules/api/variables.tf", "github/variables.tf"])(
    "%s allows the embedding model the code calls",
    (path) => {
      expect(defaultOf(terraform(path), "embedding_model_id")).toBe(EMBEDDING_MODEL_ID);
    },
  );

  it("keeps run records for as long as Terraform keeps manifests", () => {
    expect(Number(defaultOf(terraform("modules/api/variables.tf"), "run_retention_days"))).toBe(
      RUN_TTL_DAYS,
    );
  });

  it("invokes the notary infra/github deploys, which env/dev can only name", () => {
    const notary = defaultOf(terraform("github/variables.tf"), "notary_name");
    expect(notary).toBe("clearframe-notary");
    expect(terraform("env/dev/main.tf")).toContain(`:function:${notary}"`);
  });

  it("queries the index Terraform creates and grants", () => {
    const storage = terraform("modules/api/storage.tf");
    expect(storage.match(/global_secondary_index \{\s*name\s*=\s*"([^"]+)"/)?.[1]).toBe(
      RUNS_BY_USER_INDEX,
    );
    expect(terraform("modules/api/iam.tf")).toContain(`/index/${RUNS_BY_USER_INDEX}`);
  });
});
