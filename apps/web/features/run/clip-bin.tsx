import { Film } from "lucide-react";
import { Panel } from "@/components/panel";
import { cn } from "@/lib/utils";
import { ClipFrame } from "./clip-frame";
import { formatCount, genreLabel, languageLabel, rejectionLabel } from "./format";
import { type BinClip, type LiveRun, binClips } from "./live-run";

interface ClipBinProps {
  run: LiveRun | null;
  selectedId: string | null;
  onSelect: (clipId: string) => void;
  className?: string;
}

function Counts({ clips }: { clips: BinClip[] }) {
  const cleared = clips.filter((clip) => clip.outcome === "accepted").length;
  const refused = clips.filter((clip) => clip.outcome === "refused").length;
  if (clips.length === 0) return null;
  return (
    <p className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-cleared" aria-hidden />
        {formatCount(cleared)} cleared
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-refused" aria-hidden />
        {formatCount(refused)} not cleared
      </span>
    </p>
  );
}

function EmptyState({ run }: { run: LiveRun | null }) {
  const message = !run
    ? "Clips the agent proposes appear here as it works, each marked with the rule's decision."
    : run.status === "running"
      ? "The agent is searching the catalog. Clips appear here once it proposes them."
      : "The agent proposed no clip. Its note in the run details explains why.";
  return (
    <div className="grid h-full min-h-48 place-content-center justify-items-center gap-3 p-8 text-center">
      <Film className="size-7 text-muted-foreground/60" strokeWidth={1.5} aria-hidden />
      <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}

export function ClipBin({ run, selectedId, onSelect, className }: ClipBinProps) {
  const clips = run ? binClips(run) : [];
  return (
    <Panel title="Clips" actions={<Counts clips={clips} />} className={className}>
      {clips.length === 0 ? (
        <EmptyState run={run} />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-3 gap-y-4 p-4 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
          {clips.map((clip) => (
            <li key={clip.clipId} className="motion-safe:animate-in motion-safe:fade-in">
              <button
                type="button"
                aria-pressed={clip.clipId === selectedId}
                onClick={() => onSelect(clip.clipId)}
                className="group w-full rounded-md text-left outline-none"
              >
                <ClipFrame
                  genre={clip.genre}
                  language={clip.language}
                  durationSec={clip.durationSec}
                  outcome={clip.outcome}
                  refusal={
                    run && clip.reasons[0]
                      ? rejectionLabel(clip.reasons[0], run.request)
                      : undefined
                  }
                  endsInDays={clip.entry?.expiresSoon ? clip.entry.daysUntilExpiry : null}
                  className={cn(
                    "ring-offset-2 ring-offset-card transition-shadow group-hover:ring-1 group-hover:ring-foreground/30",
                    "group-focus-visible:ring-2 group-focus-visible:ring-ring",
                    clip.clipId === selectedId && "ring-2 ring-playhead group-hover:ring-2",
                  )}
                />
                <span className="mt-2 block truncate text-[13px] font-medium">
                  {clip.title ?? "Unknown clip"}
                </span>
                <span className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {clip.genre && clip.language
                      ? `${genreLabel(clip.genre)}, ${languageLabel(clip.language)}`
                      : "Not in the catalog"}
                  </span>
                  <span className="shrink-0 font-mono text-[11px]">{clip.clipId}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
