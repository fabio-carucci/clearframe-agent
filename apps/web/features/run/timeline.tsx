import { Panel } from "@/components/panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount, formatSeconds } from "./format";
import type { LiveRun } from "./live-run";
import { type BlockKind, kindLabel, rulerTicks, timelineBlocks } from "./timeline-model";
import { useElapsed } from "./use-live-run";
import styles from "./timeline.module.css";

/** Ten seconds of empty ruler before a run, and room to grow while one is live. */
const MIN_SPAN_MS = 10_000;
const LEGEND: BlockKind[] = ["search", "rights", "propose", "answer"];

const percent = (ms: number, spanMs: number) => `${(ms / spanMs) * 100}%`;
const rulerLabel = (ms: number) =>
  `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const compact = (tokens: number) =>
  tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);

function Legend() {
  return (
    <ul className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
      {LEGEND.map((kind) => (
        <li key={kind} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-[2px]"
            style={{ background: `var(--tool-${kind})` }}
            aria-hidden
          />
          {kindLabel(kind)}
        </li>
      ))}
    </ul>
  );
}

interface TimelineProps {
  run: LiveRun | null;
  className?: string;
}

export function Timeline({ run, className }: TimelineProps) {
  const elapsedMs = useElapsed(run);
  const steps = run?.steps ?? [];
  const blocks = timelineBlocks(steps, run?.activity ?? null, elapsedMs);
  const endMs = blocks.reduce((end, block) => Math.max(end, block.startMs + block.durationMs), 0);
  const playheadMs = run?.status === "running" ? elapsedMs : endMs;
  const spanMs = Math.max(MIN_SPAN_MS, playheadMs * 1.08);
  const maxInput = Math.max(1, ...steps.map((step) => step.inputTokens));
  const totalTokens = steps.reduce((sum, step) => sum + step.inputTokens + step.outputTokens, 0);

  return (
    <Panel title="Timeline" actions={<Legend />} className={className}>
      <div className={styles.timeline}>
        <div className={styles.header} aria-hidden />
        <div className={styles.header}>Agent</div>
        <div className={styles.header}>
          Tokens
          {totalTokens > 0 && <span className={styles.headerValue}>{compact(totalTokens)}</span>}
        </div>

        <div className={styles.lanes}>
          <div className={styles.ruler} aria-hidden>
            {rulerTicks(spanMs).map((at) => (
              <span key={at} className={styles.tick} style={{ left: percent(at, spanMs) }}>
                <span className={styles.tickLabel}>{rulerLabel(at)}</span>
              </span>
            ))}
          </div>

          <ol className={styles.lane} aria-label="Agent steps">
            {blocks.map((block, index) => (
              <li key={block.key}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={styles.block}
                      data-kind={block.kind}
                      data-open={block.step ? undefined : ""}
                      style={{
                        left: percent(block.startMs, spanMs),
                        width: `calc(${percent(block.durationMs, spanMs)} - 2px)`,
                      }}
                    >
                      <span className="truncate">{block.label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {block.step ? (
                      <span className="tabular-nums">
                        Step {index + 1}, {block.label}: {formatCount(block.step.inputTokens)} in,{" "}
                        {formatCount(block.step.outputTokens)} out,{" "}
                        {formatSeconds(block.step.durationMs)}
                      </span>
                    ) : (
                      <span>{block.label}</span>
                    )}
                  </TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ol>

          <div className={styles.lane} aria-hidden>
            {blocks.flatMap((block) =>
              block.step
                ? [
                    <span
                      key={block.key}
                      className={styles.level}
                      style={{
                        left: percent(block.startMs, spanMs),
                        width: `calc(${percent(block.durationMs, spanMs)} - 2px)`,
                        height: `${Math.max(8, (block.step.inputTokens / maxInput) * 80)}%`,
                      }}
                    />,
                  ]
                : [],
            )}
          </div>

          {run && <div className={styles.playhead} style={{ left: percent(playheadMs, spanMs) }} />}
        </div>
      </div>
    </Panel>
  );
}
