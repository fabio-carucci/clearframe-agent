import {
  type AnthropicLanguageModelOptions,
  anthropic,
} from "@ai-sdk/anthropic";
import { ToolLoopAgent, isStepCount } from "ai";
import { createAddToManifestTool } from "./add-to-manifest";
import { isTokenBudgetExceeded } from "./budget";
import type { RunContext } from "./context";
import { buildInstructions } from "./instructions";
import { createGetRightsTool, createSearchClipsTool } from "./tools";

export const MODEL_ID = "claude-haiku-5-5";
export const MAX_STEPS = 15;
export const TOKEN_BUDGET = 150_000;

export function createClipAgent(run: RunContext) {
  return new ToolLoopAgent({
    model: anthropic(MODEL_ID),
    instructions: buildInstructions(run.draft.usage),
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
