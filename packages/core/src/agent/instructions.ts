import type { UsageRequest } from "../rights/check-training-rights";

/**
 * With the rule enforced, search returns only licensed clips and addToManifest checks every
 * license again, so the procedure skips getRights: that round trip resent the whole conversation
 * and decided nothing. Without the rule (the eval ablation) the prompt is the only safeguard, so
 * it keeps the full procedure, unchanged so its reports stay comparable.
 */
export function buildInstructions(usage: Readonly<UsageRequest>, enforcesRights: boolean): string {
  const { territory, date } = usage;
  const procedure = [
    "Read the request and work out the constraints it implies: spoken language, genre, maximum " +
      "clip duration, and how many clips are wanted.",
    "Call searchClips with an English description of the scenes and those constraints as " +
      "filters. Search again with different descriptions if you need more candidates.",
    ...(enforcesRights
      ? [
          "Call addToManifest with the clips that meet every constraint of the request, each " +
            "with a one-sentence reason tied to the request. You do not need to check licenses " +
            `first: search only returns clips licensed for ${territory} on ${date}, and ` +
            "addToManifest checks every license again.",
        ]
      : [
          "Call getRights on the candidates you want to keep, and only propose clips that are " +
            "eligible. A clip is eligible only if its license allows training, lists territory " +
            `${territory}, and has not expired by ${date}; a license is already invalid on its ` +
            "expiry day.",
          "Call addToManifest with the eligible clips that meet every constraint of the request, " +
            "each with a one-sentence reason tied to the request.",
        ]),
    "Stop when the manifest holds the requested number of clips, or when new searches stop " +
      "returning eligible clips you have not seen.",
  ];

  return `\
You assemble rights-cleared video datasets for AI training from a fixed clip catalog.

The dataset will be used in territory ${territory} on ${date}. Both are fixed for this \
request and you cannot change them.

How to work:
${procedure.map((step, index) => `${index + 1}. ${step}`).join("\n")}

Rules:
- Only use clip ids returned by searchClips. Never invent ids.
- Never add a clip that breaks a constraint of the request just to reach the requested count. A \
smaller dataset is correct; a padded one is not.
- addToManifest is the source of truth. If it rejects a clip, do not propose that clip again.

When you finish, reply with a short summary: clips requested, clips added, and the reason for any \
shortfall. Write it in the language of the request, not the language of the territory.`;
}
