"use client";

import {
  PUBLISHED_SIGNING_KEYS,
  type SigningKey,
  type Verification,
  verifySignedManifest,
} from "@clearframe/contracts/certificate";
import { FileQuestion, ShieldCheck, ShieldX, Upload } from "lucide-react";
import Link from "next/link";
import { type DragEvent, type ReactNode, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const REPOSITORY_URL = "https://github.com/fabio-carucci/clearframe-agent";

const issuedOn = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });

const short = (id: string, length = 8) => `${id.slice(0, length)}…`;

function Verdict({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "valid" | "invalid" | "neutral";
  icon: typeof ShieldCheck;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-live="polite"
      className={cn(
        "rounded-lg p-5",
        tone === "valid" && "bg-cleared/12",
        tone === "invalid" && "bg-refused/12",
        tone === "neutral" && "bg-muted",
      )}
    >
      <h2
        className={cn(
          "flex items-center gap-2 font-title text-lg",
          tone === "valid" && "text-cleared",
          tone === "invalid" && "text-refused",
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden />
        {title}
      </h2>
      <div className="mt-3 space-y-1.5 text-[13px] leading-relaxed">{children}</div>
    </section>
  );
}

/** What a verification found, in plain words. */
export function VerificationReport({ result }: { result: Verification }) {
  switch (result.status) {
    case "valid": {
      const { certificate, manifest } = result;
      return (
        <Verdict tone="valid" icon={ShieldCheck} title="Signed by Clearframe, unchanged since">
          <p>
            Signed on {issuedOn(certificate.issuedAt)} with key{" "}
            <span className="font-mono">{short(certificate.keyId)}</span>.
          </p>
          <p>
            Catalog <span className="font-mono">{short(manifest.catalogVersion, 12)}</span>,{" "}
            {manifest.clips.length} {manifest.clips.length === 1 ? "clip" : "clips"} intact.
          </p>
          <p className="text-muted-foreground">
            For {manifest.request.territory} on {manifest.request.date}. The request, as the user
            typed it: “{manifest.request.prompt}”
          </p>
        </Verdict>
      );
    }
    case "content_changed": {
      const { changes } = result;
      return (
        <Verdict tone="invalid" icon={ShieldX} title="Changed after signing">
          <ul className="list-inside list-disc space-y-1">
            {changes.manifest && (
              <li>The request or other fields outside the clips were edited.</li>
            )}
            {changes.clipCount && (
              <li>
                Clips were{" "}
                {changes.clipCount.received > changes.clipCount.signed ? "added" : "removed"}:{" "}
                {changes.clipCount.signed} signed, {changes.clipCount.received} in this file.
              </li>
            )}
            {changes.clips.map(({ index, clipId }) => (
              <li key={index}>
                Clip {index + 1}
                {clipId && (
                  <>
                    {" "}
                    (<span className="font-mono">{clipId}</span>)
                  </>
                )}{" "}
                was modified after signing.
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            The signature is genuine, but this file is not the manifest it signed.
          </p>
        </Verdict>
      );
    }
    case "signature_invalid":
      return (
        <Verdict tone="invalid" icon={ShieldX} title="The signature is not valid">
          <p>The certificate was altered or forged. Nothing in this file can be trusted.</p>
        </Verdict>
      );
    case "unknown_key":
      return (
        <Verdict
          tone="neutral"
          icon={FileQuestion}
          title="Signed with a key this site does not publish"
        >
          <p>
            Key <span className="font-mono">{result.certificate.keyId}</span>. This page trusts only
            the keys Clearframe publishes, so it cannot check this signature.
          </p>
        </Verdict>
      );
    case "unsigned":
      return (
        <Verdict tone="neutral" icon={FileQuestion} title="Not signed">
          <p>
            This manifest has no certificate, so nothing here shows it is what Clearframe issued.
            Manifests issued before signing was introduced look like this.
          </p>
        </Verdict>
      );
    case "malformed":
      return (
        <Verdict tone="neutral" icon={FileQuestion} title="Not a manifest this page can check">
          <p>{result.reason}</p>
        </Verdict>
      );
  }
}

function WhatItProves() {
  return (
    <aside className="self-start rounded-lg bg-card p-5 text-[13px] leading-relaxed">
      <h2 className="font-title text-[15px]">What a valid signature proves</h2>
      <p className="mt-2">
        That Clearframe&apos;s notary signed this manifest at that time, after checking every
        clip&apos;s license and details against that catalog version and the rights rule, and that
        it has not changed since.
      </p>
      <h2 className="mt-5 font-title text-[15px]">What it does not prove</h2>
      <ul className="mt-2 list-inside list-disc space-y-1.5 text-muted-foreground">
        <li>That the licenses in the catalog are legally sound.</li>
        <li>
          Anything said in words: the request is what the user typed, and the reasons and summary
          are the model&apos;s. They are signed, so unchanged, but nobody checked them.
        </li>
        <li>
          That Clearframe runs the notary honestly: a certificate is worth as much as your trust in
          whoever holds the key.
        </li>
      </ul>
      <h2 className="mt-5 font-title text-[15px]">Checking without this site</h2>
      <p className="mt-2 text-muted-foreground">
        This page checks against the keys committed to Clearframe&apos;s{" "}
        <a href={REPOSITORY_URL} className="text-foreground underline underline-offset-2">
          repository
        </a>
        , but the site itself could be changed. To check without trusting it, run{" "}
        <code className="font-mono text-foreground">pnpm verify-manifest file.json</code> from a
        checkout of the repository.
      </p>
    </aside>
  );
}

/** Reads a manifest file from a drop, a file picker or pasted text, and verifies it here. */
export function Verifier({ keys = PUBLISHED_SIGNING_KEYS }: { keys?: readonly SigningKey[] }) {
  const [result, setResult] = useState<Verification | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const check = async (text: string, name: string | null) => {
    setFileName(name);
    try {
      setResult(await verifySignedManifest(text, keys));
    } catch {
      setResult({
        status: "malformed",
        reason: "A published signing key could not be read, so nothing can be checked.",
      });
    }
  };
  const checkFile = async (file: File | undefined) => {
    if (file) await check(await file.text(), file.name);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void checkFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-5">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "grid justify-items-center gap-3 rounded-lg border border-dashed border-input bg-muted/40 p-8 text-center transition-colors",
          dragging && "border-ring bg-accent",
        )}
      >
        <Upload className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-[13px] text-muted-foreground">
          Drop a manifest file here. It is checked in this browser and never uploaded.
        </p>
        <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
          Choose a file
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Manifest file"
          onChange={(event) => void checkFile(event.target.files?.[0])}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="pasted" className="text-xs font-medium text-muted-foreground">
          Or paste its JSON
        </label>
        <Textarea
          id="pasted"
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          className="min-h-24 font-mono text-xs"
        />
        <Button size="sm" disabled={!pasted.trim()} onClick={() => void check(pasted, null)}>
          Verify pasted JSON
        </Button>
      </div>

      {result && (
        <div className="space-y-2">
          {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
          <VerificationReport result={result} />
        </div>
      )}
    </div>
  );
}

/** Public: anyone holding a manifest can check it, without an account or a call to the API. */
export function VerifyScreen() {
  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark className="size-6" />
          <span className="font-title text-[15px]">Clearframe</span>
        </Link>
        <Button asChild variant="ghost" size="sm">
          <Link href="/">Open Clearframe</Link>
        </Button>
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <h1 className="font-title text-2xl sm:text-3xl">Verify a manifest</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Check that a manifest is the one Clearframe signed, and see which clip changed if it is
            not.
          </p>
          <div className="mt-8">
            <Verifier />
          </div>
        </div>
        <WhatItProves />
      </main>
    </div>
  );
}
