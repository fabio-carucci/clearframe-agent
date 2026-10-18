import type { ComposeResponse } from "@clearframe/contracts";

/** A recorded production run, shown when the page runs without config.json (local development). */
export const SAMPLE_RUN: ComposeResponse = {
  manifest: {
    runId: "b5d3b05b-527e-4b65-9107-61b33eb15cfc",
    request: { prompt: "5 clip di natura in inglese", territory: "ES", date: "2026-10-17" },
    catalogVersion: "ae337fe9b6fb3434c13d8a6de17a56298b3b6908599774d835066eac4e17f0bc",
    clips: [
      {
        clipId: "clip_0133",
        title: "On the move, snowy forest",
        genre: "nature_wildlife",
        language: "en",
        durationSec: 44,
        reason:
          "Nature/wildlife clip in English showing a wolf pack moving through a snowy forest, licensed for training in ES.",
        license: {
          trainingAllowed: true,
          territories: ["ES", "IT", "FR", "DE", "PT", "MX", "AR", "CO", "GB"],
          expiresAt: "2029-07-28",
        },
        daysUntilExpiry: 1015,
        expiresSoon: false,
      },
      {
        clipId: "clip_0020",
        title: "Resting, quiet clearing",
        genre: "nature_wildlife",
        language: "en",
        durationSec: 31,
        reason:
          "Nature/wildlife clip in English of wild horses resting at a quiet clearing at first light, licensed for ES (license expires 2026-11-02, still valid on the request date).",
        license: {
          trainingAllowed: true,
          territories: ["ES", "IT", "FR", "DE", "PT", "US", "CA", "MX", "AR", "CO"],
          expiresAt: "2026-11-02",
        },
        daysUntilExpiry: 16,
        expiresSoon: true,
      },
      {
        clipId: "clip_0247",
        title: "Feeding, misty valley",
        genre: "nature_wildlife",
        language: "en",
        durationSec: 85,
        reason:
          "Nature/wildlife clip in English of a lone fox feeding in a misty valley, licensed for training in ES.",
        license: {
          trainingAllowed: true,
          territories: ["ES", "IT", "FR", "DE", "PT", "GB"],
          expiresAt: null,
        },
        daysUntilExpiry: null,
        expiresSoon: false,
      },
      {
        clipId: "clip_0287",
        title: "River crossing, frozen lake",
        genre: "nature_wildlife",
        language: "en",
        durationSec: 50,
        reason:
          "Nature/wildlife clip in English of ibex crossing a frozen lake in heavy fog, licensed for training in ES.",
        license: {
          trainingAllowed: true,
          territories: ["ES", "IT", "FR", "DE", "PT", "US", "CA", "MX", "AR", "CO"],
          expiresAt: null,
        },
        daysUntilExpiry: null,
        expiresSoon: false,
      },
      {
        clipId: "clip_0120",
        title: "Feeding, alpine meadow",
        genre: "nature_wildlife",
        language: "en",
        durationSec: 34,
        reason:
          "Nature/wildlife clip in English of wild horses feeding in an alpine meadow, licensed for training in ES.",
        license: {
          trainingAllowed: true,
          territories: ["ES", "IT", "FR", "DE", "PT", "US", "CA", "GB"],
          expiresAt: null,
        },
        daysUntilExpiry: null,
        expiresSoon: false,
      },
    ],
    rejected: [],
    stopReason: "completed",
    summary:
      "Ho richiesto 5 clip di natura in inglese e ne ho aggiunte 5 al manifest, tutte con licenza valida per il training in ES alla data del 17/10/2026.",
    usage: { steps: 4, inputTokens: 15207, outputTokens: 1281, embeddingTokens: 15 },
    costUsd: 0.002162,
    durationMs: 8862,
  },
  steps: [
    {
      stepNumber: 0,
      toolCalls: ["searchClips", "searchClips"],
      inputTokens: 1685,
      outputTokens: 312,
      durationMs: 3344,
    },
    {
      stepNumber: 1,
      toolCalls: ["getRights"],
      inputTokens: 3749,
      outputTokens: 105,
      durationMs: 902,
    },
    {
      stepNumber: 2,
      toolCalls: ["addToManifest"],
      inputTokens: 4548,
      outputTokens: 540,
      durationMs: 2283,
    },
    { stepNumber: 3, toolCalls: [], inputTokens: 5225, outputTokens: 324, durationMs: 2331 },
  ],
  decisions: [],
};
