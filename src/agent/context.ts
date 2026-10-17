import type { CatalogData } from "../catalog/load";
import type { ManifestWriter } from "./manifest";

/** Everything one agent run shares between its tools. Created per request, never reused. */
export interface RunContext {
  data: CatalogData;
  draft: ManifestWriter;
  embedQuery: (text: string) => Promise<{ embedding: number[]; tokens: number }>;
  stats: { embeddingTokens: number };
}
