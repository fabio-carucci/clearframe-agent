import { type AnthropicLanguageModelOptions, anthropic } from "@ai-sdk/anthropic";
import { type LanguageModel, ToolLoopAgent, isStepCount } from "ai";
import { createAddToManifestTool } from "./add-to-manifest";
import { isTokenBudgetExceeded } from "./budget";
import type { RunContext } from "./context";
import { buildInstructions } from "./instructions";
import { createGetRightsTool, createSearchClipsTool } from "./tools";

export const MODEL_ID = "claude-haiku-5-5";
export const MAX_STEPS = 15;
export const TOKEN_BUDGET = 150_000;
/**
 * Below CloudFront's 60-second origin timeout and the Lambda's own, so a slow run ends as a
 * partial manifest instead of a 504 while the Lambda keeps spending.
 */
export const RUN_TIMEOUT_MS = 45_000;

/** Defaults to the Anthropic provider, which reads ANTHROPIC_API_KEY from the environment. */
export function createClipAgent(run: RunContext, model: LanguageModel = anthropic(MODEL_ID)) {
  return new ToolLoopAgent({
    model,
    instructions: buildInstructions(run.draft.usage, run.draft.enforcesRights),
    tools: {
      searchClips: createSearchClipsTool(run),
      getRights: createGetRightsTool(run),
      addToManifest: createAddToManifestTool(run),
    },
    stopWhen: [isStepCount(MAX_STEPS), isTokenBudgetExceeded(TOKEN_BUDGET)],
    providerOptions: {
      anthropic: { effort: "medium" } satisfies AnthropicLanguageModelOptions,
    },
  });
}
