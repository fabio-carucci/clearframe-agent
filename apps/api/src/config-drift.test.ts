import { readFileSync } from "node:fs";
import { EMBEDDING_MODEL_ID } from "@clearframe/core/retrieval/embeddings";
import { describe, expect, it } from "vitest";
import { RUN_TTL_DAYS } from "./run-record";

/**
 * Some values live in two places: the embedding model the Lambda may invoke, how long run data is
 * kept, and the site's domain, which the deploy role may request a certificate for. If one side
 * changes alone, IAM denies a call at deploy or run time, or DynamoDB and S3 disagree on
 * retention, and nothing else would notice.
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

  it("lets the deploy role request a certificate for the domain the site is served on", () => {
    const siteDomain = terraform("env/dev/main.tf").match(/domain_name\s*=\s*"([^"]+)"/)?.[1];
    expect(siteDomain).toBeDefined();
    expect(defaultOf(terraform("github/variables.tf"), "site_domain")).toBe(siteDomain);
  });

  it("keeps run records for as long as Terraform keeps manifests", () => {
    expect(Number(defaultOf(terraform("modules/api/variables.tf"), "run_retention_days"))).toBe(
      RUN_TTL_DAYS,
    );
  });
});
