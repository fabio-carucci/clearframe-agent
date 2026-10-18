import { Film, TriangleAlert } from "lucide-react";
import { Panel } from "@/components/panel";
import { Skeleton } from "@/components/ui/skeleton";
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
    : run.status === "failed"
      ? "The dataset was not composed. The run details say why."
      : "The agent proposed no clip. Its note in the run details explains why.";
  return (
    <div className="grid h-full min-h-48 place-content-center justify-items-center gap-3 p-8 text-center">
      <Film className="size-7 text-muted-foreground/60" strokeWidth={1.5} aria-hidden />
      <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}

/** Where clips will land while the agent searches: frames of the size they will have. */
function Searching() {
  return (
    <div className="p-4" aria-busy="true">
      <p className="text-[13px] text-muted-foreground">
        The agent is searching the catalog. Clips appear here once it proposes them.
      </p>
      <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="space-y-2">
            <Skeleton className="aspect-video w-full rounded-[4px]" />
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ClipBin({ run, selectedId, onSelect, className }: ClipBinProps) {
  const clips = run ? binClips(run) : [];
  return (
    <Panel title="Clips" actions={<Counts clips={clips} />} className={className}>
      {clips.length === 0 ? (
        run?.status === "running" ? (
          <Searching />
        ) : (
          <EmptyState run={run} />
        )
      ) : (
        <>
          {run?.status === "failed" && (
            <p className="mx-4 mt-4 flex items-start gap-2 rounded-md bg-destructive/12 p-3 text-[13px] leading-relaxed text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              These are the rule's decisions as the run went, but the run was not recorded, so no
              manifest was issued.
            </p>
          )}
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
        </>
      )}
    </Panel>
  );
}
