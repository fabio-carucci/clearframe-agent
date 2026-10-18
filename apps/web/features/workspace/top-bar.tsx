import { LogOut } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { formatCount, formatRunTime, formatUsd } from "../run/format";
import type { LiveRun } from "../run/live-run";
import { useElapsed } from "../run/use-live-run";
import { activityBlock } from "../run/timeline-model";

interface TopBarProps {
  run: LiveRun | null;
  account?: { email: string; signOut: () => void };
}

function Status({ run }: { run: LiveRun | null }) {
  if (!run) return <span className="text-muted-foreground">Ready</span>;
  if (run.status === "running") {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="relative flex size-2 shrink-0" aria-hidden>
          <span className="absolute inset-0 rounded-full bg-playhead motion-safe:animate-ping" />
          <span className="relative size-2 rounded-full bg-playhead" />
        </span>
        <span className="truncate">
          {run.activity ? activityBlock(run.activity).label : "Live"}
        </span>
      </span>
    );
  }
  if (run.status === "failed") return <span className="text-refused">Not composed</span>;
  const partial = run.result?.manifest.stopReason !== "completed";
  return (
    <span className={partial ? "text-warning" : "text-cleared"}>
      {partial ? "Partial dataset" : "Composed"}
    </span>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-[13px] tabular-nums">{value}</span>
    </span>
  );
}

export function TopBar({ run, account }: TopBarProps) {
  const elapsedMs = useElapsed(run);
  const manifest = run?.result?.manifest;
  return (
    <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border bg-card px-4">
      <div className="flex items-center gap-2.5">
        <BrandMark className="size-6" />
        <span className="font-title text-[15px]">Clearframe</span>
      </div>

      <div className="flex min-w-0 items-center gap-4 rounded-md bg-background px-3 py-1.5">
        <span
          role="timer"
          aria-label="Run time"
          className="font-mono text-xl leading-none tabular-nums"
        >
          {formatRunTime(elapsedMs)}
        </span>
        {run?.status === "running" && (
          <span className="size-2 shrink-0 rounded-full bg-playhead sm:hidden" aria-hidden />
        )}
        <span aria-live="polite" className="hidden max-w-72 min-w-0 text-[13px] sm:flex">
          <Status run={run} />
        </span>
      </div>

      <div className="flex items-center justify-end gap-5">
        {manifest && (
          <div className="hidden items-center gap-5 xl:flex">
            <Readout label="Cost" value={formatUsd(manifest.costUsd)} />
            <Readout
              label="Tokens"
              value={formatCount(manifest.usage.inputTokens + manifest.usage.outputTokens)}
            />
          </div>
        )}
        {account && (
          <div className="flex items-center gap-2">
            <span className="hidden text-[13px] text-muted-foreground md:inline">
              {account.email}
            </span>
            <Button variant="ghost" size="sm" onClick={account.signOut} aria-label="Sign out">
              <LogOut aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
