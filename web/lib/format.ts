import type { Manifest } from "./api";

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

const TOOLS: Record<string, string> = {
  searchClips: "Searched the catalog",
  getRights: "Checked licenses",
  addToManifest: "Proposed clips",
};

export const genreLabel = (genre: string) => GENRES[genre] ?? genre;
export const languageLabel = (language: string) => LANGUAGES[language] ?? language;
export const toolLabel = (tool: string) => TOOLS[tool] ?? tool;

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
export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
export const formatCount = (n: number) => n.toLocaleString("en-US");
