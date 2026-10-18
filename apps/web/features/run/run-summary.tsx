import type { Manifest } from "@clearframe/contracts";
import { Download, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCount, formatRunTime, formatUsd, stopReasonLabel } from "./format";
import type { LiveRun } from "./live-run";

function downloadManifest(manifest: Manifest) {
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `manifest-${manifest.runId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-[15px] tabular-nums">{value}</dd>
    </div>
  );
}

export function RunSummary({ run }: { run: LiveRun | null }) {
  if (!run) {
    return (
      <p className="p-4 text-[13px] leading-relaxed text-muted-foreground">
        Compose a dataset to see what it cost, how long it took and the agent's own note.
      </p>
    );
  }
  const manifest = run.result?.manifest;
  const headline =
    run.status === "running"
      ? "Composing"
      : manifest
        ? stopReasonLabel(manifest.stopReason)
        : "Not composed";

  return (
    <div className="space-y-5 p-4 text-[13px]">
      <div>
        <h3 className="font-title text-base">{headline}</h3>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          “{run.request.prompt}”, for {run.request.territory} on {run.request.date}
        </p>
      </div>

      {run.error && (
        <p className="flex items-start gap-2 rounded-md bg-destructive/12 p-3 leading-relaxed text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {run.error}
        </p>
      )}

      {manifest && (
        <>
          <dl className="grid grid-cols-2 gap-2">
            <Figure label="Cleared" value={formatCount(manifest.clips.length)} />
            <Figure label="Not cleared" value={formatCount(manifest.rejected.length)} />
            <Figure label="Cost" value={formatUsd(manifest.costUsd)} />
            <Figure
              label="Model tokens"
              value={formatCount(manifest.usage.inputTokens + manifest.usage.outputTokens)}
            />
            <Figure label="Steps" value={formatCount(manifest.usage.steps)} />
            <Figure label="Run time" value={formatRunTime(manifest.durationMs)} />
          </dl>

          <section aria-labelledby="note-heading">
            <h4 id="note-heading" className="font-medium">
              The agent's note
            </h4>
            <p className="mt-1 whitespace-pre-line leading-relaxed">
              {manifest.summary.replaceAll("**", "")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Written by the model. The clips and verdicts come from the rule, not from this text.
            </p>
          </section>
        </>
      )}

      {run.runId && (
        <section aria-labelledby="audit-heading" className="space-y-1">
          <h4 id="audit-heading" className="font-medium">
            Audit
          </h4>
          <p className="text-muted-foreground">
            Run <span className="font-mono text-foreground">{run.runId}</span>
          </p>
          {manifest ? (
            <>
              <p className="text-muted-foreground" title={manifest.catalogVersion}>
                Catalog{" "}
                <span className="font-mono text-foreground">
                  {manifest.catalogVersion.slice(0, 12)}
                </span>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => downloadManifest(manifest)}
              >
                <Download aria-hidden />
                Download manifest
              </Button>
            </>
          ) : (
            run.status === "failed" && (
              <p className="text-muted-foreground">
                Quote this id to look the run up: it may have been recorded after the page lost it.
              </p>
            )
          )}
        </section>
      )}
    </div>
  );
}
