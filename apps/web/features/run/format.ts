import type { ClipDecision, Manifest } from "@clearframe/contracts";
import type { Standing } from "./live-run";

const GENRES: Record<string, string> = {
  sports_outdoor: "Outdoor sports",
  sports_indoor: "Indoor sports",
  cooking: "Cooking",
  street_urban: "Street and urban",
  nature_wildlife: "Nature and wildlife",
  interview: "Interview",
  music_performance: "Music performance",
  workplace: "Workplace",
};

const LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  it: "Italian",
  fr: "French",
  de: "German",
  pt: "Portuguese",
};

export const genreLabel = (genre: string) => GENRES[genre] ?? genre;
export const languageLabel = (language: string) => LANGUAGES[language] ?? language;

export function outcomeLabel(outcome: ClipDecision["outcome"], standing: Standing): string {
  switch (outcome) {
    case "accepted":
      return standing === "final"
        ? "Cleared"
        : standing === "recording"
          ? "Accepted"
          : "Not recorded";
    case "refused":
      return "Not cleared";
    case "checked":
      return "Checking";
    case "not_proposed":
      return "Not proposed";
  }
}

export function stopReasonLabel(stopReason: Manifest["stopReason"]): string {
  switch (stopReason) {
    case "completed":
      return "Completed";
    case "step_limit":
      return "Stopped at the step limit: the dataset is partial";
    case "token_budget":
      return "Stopped at the token budget: the dataset is partial";
    case "error":
      return "Stopped by an error: the dataset is partial";
  }
}

export function rejectionLabel(reason: string, request: Manifest["request"]): string {
  switch (reason) {
    case "TRAINING_NOT_ALLOWED":
      return "License does not allow training";
    case "TERRITORY_NOT_LICENSED":
      return `Not licensed in ${request.territory}`;
    case "LICENSE_EXPIRED":
      return `License expired by ${request.date}`;
    case "UNKNOWN_CLIP":
      return "Not in the catalog";
    case "DUPLICATE":
      return "Already in the dataset";
    default:
      return reason;
  }
}

export const formatUsd = (usd: number) => `$${usd.toFixed(4)}`;
export const formatCount = (n: number) => n.toLocaleString("en-US");
export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** A clip's length as editors show it: 0:44, 1:05. */
export function formatClipDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Run time to the tenth of a second: 0:08.4. */
export function formatRunTime(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const seconds = Math.floor(tenths / 10);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.${tenths % 10}`;
}
