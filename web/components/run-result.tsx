import type { Manifest, RunResponse, Step } from "@/lib/api";
import {
  formatCount,
  formatSeconds,
  formatUsd,
  genreLabel,
  languageLabel,
  rejectionLabel,
  stopReasonLabel,
  toolLabel,
} from "@/lib/format";

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Accepted({ manifest }: { manifest: Manifest }) {
  return (
    <section
      aria-labelledby="accepted"
      className="rounded-lg border-t-4 border-cleared bg-surface p-5"
    >
      <h3 id="accepted" className="font-semibold">
        Accepted by the rule{" "}
        <span className="tabular-nums text-cleared">{manifest.clips.length}</span>
      </h3>
      {manifest.clips.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No clip met both the request and the license rule.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {manifest.clips.map((clip) => (
            <li key={clip.clipId} className="py-3">
              <p className="font-medium">{clip.title}</p>
              <p className="mt-0.5 text-[13px] text-muted tabular-nums">
                {clip.clipId}, {genreLabel(clip.genre)}, {languageLabel(clip.language)},{" "}
                {clip.durationSec} s
              </p>
              <p className="mt-1.5 text-sm leading-relaxed">{clip.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Refused({ manifest }: { manifest: Manifest }) {
  return (
    <section
      aria-labelledby="refused"
      className="rounded-lg border-t-4 border-refused bg-surface p-5"
    >
      <h3 id="refused" className="font-semibold">
        Refused by the rule{" "}
        <span className="tabular-nums text-refused">{manifest.rejected.length}</span>
      </h3>
      {manifest.rejected.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Nothing was refused: the model only proposed clips the rule accepts.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {manifest.rejected.map((rejection) => (
            <li key={rejection.clipId} className="py-3">
              <p className="font-medium tabular-nums">{rejection.clipId}</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {rejection.reasons.map((reason) => (
                  <li
                    key={reason}
                    className="rounded bg-refused-soft px-2 py-0.5 text-[13px] text-refused"
                  >
                    {rejectionLabel(reason, manifest.request)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function stepLabel(step: Step): string {
  if (step.toolCalls.length === 0) return "Wrote the summary";
  const counts = new Map<string, number>();
  for (const tool of step.toolCalls) counts.set(tool, (counts.get(tool) ?? 0) + 1);
  return [...counts]
    .map(([tool, n]) => (n > 1 ? `${toolLabel(tool)} ×${n}` : toolLabel(tool)))
    .join(", ");
}

function Steps({ steps }: { steps: Step[] }) {
  const longest = Math.max(1, ...steps.map((step) => step.durationMs));
  return (
    <section aria-labelledby="steps">
      <h3 id="steps" className="font-semibold">
        How the agent worked
      </h3>
      <p className="mt-1 text-sm text-muted">
        Each step is one call to the model; it resends the whole conversation, so input grows.
      </p>
      <ol className="mt-4 space-y-3">
        {steps.map((step) => (
          <li key={step.stepNumber} className="grid grid-cols-[1.75rem_1fr] gap-3">
            <span className="mt-0.5 grid size-7 place-items-center rounded-full bg-ink text-[13px] font-semibold text-white tabular-nums">
              {step.stepNumber + 1}
            </span>
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="font-medium">{stepLabel(step)}</span>
                <span className="text-[13px] text-muted tabular-nums">
                  {formatCount(step.inputTokens)} in, {formatCount(step.outputTokens)} out,{" "}
                  {formatSeconds(step.durationMs)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-line" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-action"
                  style={{ width: `${(step.durationMs / longest) * 100}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function downloadManifest(manifest: Manifest) {
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `manifest-${manifest.runId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function RunResult({ data }: { data: RunResponse }) {
  const { manifest, steps } = data;
  const tokens = manifest.usage.inputTokens + manifest.usage.outputTokens;

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">
          {stopReasonLabel(manifest.stopReason)}
        </h2>
        <p className="mt-1 text-[15px] text-muted">
          “{manifest.request.prompt}” for {manifest.request.territory} on {manifest.request.date}
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
          <Figure label="Accepted" value={String(manifest.clips.length)} />
          <Figure label="Refused" value={String(manifest.rejected.length)} />
          <Figure label="Cost" value={formatUsd(manifest.costUsd)} />
          <Figure label="Time" value={formatSeconds(manifest.durationMs)} />
          <Figure label="Model tokens" value={formatCount(tokens)} />
        </dl>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Accepted manifest={manifest} />
        <Refused manifest={manifest} />
      </div>

      <section aria-labelledby="note" className="border-l-2 border-line pl-4">
        <h3 id="note" className="font-semibold">
          The agent’s note
        </h3>
        <p className="mt-1 text-[13px] text-muted">
          Written by the model. The lists above come from the rule, not from this text.
        </p>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed">
          {manifest.summary.replaceAll("**", "")}
        </p>
      </section>

      <Steps steps={steps} />

      <button
        type="button"
        onClick={() => downloadManifest(manifest)}
        className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium hover:border-action hover:text-action"
      >
        Download manifest (JSON)
      </button>
    </div>
  );
}
