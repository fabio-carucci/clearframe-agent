"use client";

import type { RunSummary } from "@clearframe/contracts";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount, formatUsd } from "../run/format";
import { fetchRuns } from "./history-client";

export const RUNS_QUERY_KEY = ["runs"] as const;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function Outcome({ run }: { run: RunSummary }) {
  if (run.stopReason === "completed") return <span className="text-cleared">Composed</span>;
  if (run.stopReason === "error") return <span className="text-refused">Stopped by an error</span>;
  return <span className="text-warning">Partial</span>;
}

interface RunHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getAccessToken: () => Promise<string>;
  onOpen: (runId: string) => void;
  /** The run being loaded, if any. */
  opening: string | null;
}

export function RunHistory({
  open,
  onOpenChange,
  getAccessToken,
  onOpen,
  opening,
}: RunHistoryProps) {
  const runs = useQuery({
    queryKey: RUNS_QUERY_KEY,
    queryFn: async () => fetchRuns(await getAccessToken()),
    enabled: open,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle className="font-title">Your runs</SheetTitle>
          <SheetDescription>
            The last 20, newest first. A run opens with its manifest read back from S3.
          </SheetDescription>
        </SheetHeader>

        {runs.isPending && (
          <ul className="space-y-3 p-4" aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => (
              <li key={index} className="space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </li>
            ))}
          </ul>
        )}
        {runs.isError && <p className="p-4 text-[13px] text-destructive">{runs.error.message}</p>}
        {runs.data?.length === 0 && (
          <p className="p-4 text-[13px] text-muted-foreground">
            No runs yet. Compose a dataset and it appears here.
          </p>
        )}

        <ul className="divide-y divide-border/60">
          {runs.data?.map((run) => (
            <li key={run.runId}>
              <button
                type="button"
                disabled={opening !== null}
                onClick={() => onOpen(run.runId)}
                className="w-full px-4 py-3 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:opacity-60"
              >
                <span className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground tabular-nums">{when(run.createdAt)}</span>
                  {opening === run.runId ? (
                    <LoaderCircle className="size-3.5 animate-spin" aria-label="Opening" />
                  ) : (
                    <Outcome run={run} />
                  )}
                </span>
                <span className="mt-1 line-clamp-2 block text-[13px] leading-snug">
                  {run.prompt}
                </span>
                <span className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono text-foreground/80">{run.territory}</span>
                  <span>
                    {formatCount(run.clipCount)} cleared, {formatCount(run.rejectedCount)} not
                  </span>
                  <span className="ml-auto font-mono">{formatUsd(run.costUsd)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
