import { loadCatalogData } from "@clearframe/core/catalog/load";
import { describe, expect, it } from "vitest";
import { EVAL_CASES } from "./cases";
import { derivedEligibleIds } from "./metrics";

const { clips } = await loadCatalogData();
const handwritten = EVAL_CASES.flatMap((evalCase) =>
  evalCase.expected.clipIds ? [[evalCase.id, evalCase, evalCase.expected.clipIds] as const] : [],
);

describe("eval cases with a handwritten eligible set", () => {
  it.each(handwritten)(
    "%s: the rule and the filters select exactly the clips read off the catalog",
    (_id, evalCase, clipIds) => {
      expect([...derivedEligibleIds(evalCase, clips)].sort()).toEqual([...clipIds].sort());
    },
  );
});
