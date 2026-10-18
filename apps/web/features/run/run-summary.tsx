import type { ClearanceCertificate, Manifest } from "@clearframe/contracts";
import {
  PUBLISHED_SIGNING_KEYS,
  type SigningKey,
  type Verification,
} from "@clearframe/contracts/certificate";
import { BadgeCheck, Download, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatCount, formatRunTime, formatUsd, stopReasonLabel } from "./format";
import type { LiveRun } from "./live-run";
import { useSignatureCheck } from "./use-signature-check";

/** The signed envelope /verify reads: the manifest with its certificate, when it has one. */
function downloadManifest(manifest: Manifest, certificate: ClearanceCertificate | undefined) {
  const envelope = { manifest, certificate };
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `manifest-${manifest.runId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

const signedOn = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const whyNotValid = (result: Verification) => {
  switch (result.status) {
    case "signature_invalid":
      return "its signature does not match";
    case "unknown_key":
      return "it names a key Clearframe does not publish";
    case "content_changed":
      return "the manifest differs from what was signed";
    case "malformed":
      return result.reason;
    default:
      return result.status;
  }
};

function SignatureStatus({ check }: { check: Verification | null }) {
  if (!check) {
    return <p className="text-muted-foreground">Checking the signature in this browser…</p>;
  }
  if (check.status === "valid") {
    const { certificate } = check;
    return (
      <p className="flex items-start gap-2 text-cleared">
        <BadgeCheck className="mt-px size-4 shrink-0" aria-hidden />
        <span>
          Signed with key <span className="font-mono">{certificate.keyId.slice(0, 8)}…</span> on{" "}
          {signedOn(certificate.issuedAt)}, and verified in this browser. Anyone with the file can{" "}
          <Link href="/verify" className="underline underline-offset-2">
            verify it
          </Link>
          .
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 text-destructive">
      <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
      <span>
        The certificate does not verify: {whyNotValid(check)}. Do not rely on this manifest; quote
        the run id.
      </span>
    </p>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-[15px] tabular-nums">{value}</dd>
    </div>
  );
}

interface RunSummaryProps {
  run: LiveRun | null;
  /** The keys a certificate must verify with; the repository's published keys by default. */
  signingKeys?: readonly SigningKey[];
}

export function RunSummary({ run, signingKeys = PUBLISHED_SIGNING_KEYS }: RunSummaryProps) {
  const check = useSignatureCheck(run?.result?.manifest, run?.result?.certificate, signingKeys);
  if (!run) {
    return (
      <p className="p-4 text-[13px] leading-relaxed text-muted-foreground">
        Compose a dataset to see what it cost, how long it took and the agent's own note.
      </p>
    );
  }
  const manifest = run.result?.manifest;
  const certificate = run.result?.certificate;
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
          {run.audit && (
            <p
              className={
                run.audit.verified ? "flex items-start gap-2 text-cleared" : "text-muted-foreground"
              }
            >
              {run.audit.verified && <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden />}
              {run.audit.verified
                ? `Read back from S3: the locked version ${run.audit.manifestVersionId?.slice(0, 10)}… matches the SHA-256 recorded with the run.`
                : "Recorded before manifests carried a version and checksum, so this copy cannot be verified."}
            </p>
          )}
          {manifest ? (
            <>
              {certificate ? (
                <SignatureStatus check={check} />
              ) : (
                <p className="text-muted-foreground">
                  Not signed: issued before manifests were signed.
                </p>
              )}
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
                onClick={() => downloadManifest(manifest, certificate)}
              >
                <Download aria-hidden />
                {certificate ? "Download signed manifest" : "Download manifest"}
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
