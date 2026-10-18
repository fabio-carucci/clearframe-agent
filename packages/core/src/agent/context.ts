import type { RunEvent } from "@clearframe/contracts";
import type { CatalogData } from "../catalog/load";
import type { DecisionLog } from "./decisions";
import type { ManifestWriter } from "./manifest";

/** Everything one agent run shares between its tools. Created per request, never reused. */
export interface RunContext {
  data: CatalogData;
  draft: ManifestWriter;
  decisions: DecisionLog;
  embedQuery: (text: string) => Promise<{ embedding: number[]; tokens: number }>;
  emit: (event: RunEvent) => void;
  stats: { embeddingTokens: number };
}
