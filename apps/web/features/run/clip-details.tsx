import type { Manifest } from "@clearframe/contracts";
import { CircleX, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ClipFrame } from "./clip-frame";
import { formatClipDuration, genreLabel, languageLabel, rejectionLabel } from "./format";
import type { BinClip } from "./live-run";

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Verdict({ clip, request }: { clip: BinClip; request: Manifest["request"] }) {
  switch (clip.outcome) {
    case "accepted":
      if (clip.standing === "unrecorded") {
        return (
          <p className="text-muted-foreground">
            The rule accepted this clip, but the run was not recorded, so no manifest includes it.
          </p>
        );
      }
      if (clip.standing === "recording") {
        return (
          <p className="text-muted-foreground">
            The rule accepted this clip for {request.territory} on {longDate(request.date)}. It is
            cleared once the run is recorded.
          </p>
        );
      }
      return (
        <p className="flex items-start gap-2 text-cleared">
          <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden />
          Cleared for training in {request.territory} on {longDate(request.date)}.
        </p>
      );
    case "refused":
      return (
        <div className="flex items-start gap-2 text-refused">
          <CircleX className="mt-px size-4 shrink-0" aria-hidden />
          <ul>
            {clip.reasons.map((reason) => (
              <li key={reason}>{rejectionLabel(reason, request)}</li>
            ))}
          </ul>
        </div>
      );
    case "not_proposed":
      return (
        <p className="text-muted-foreground">
          The agent checked this clip's license and left it out
          {clip.reasons.length > 0
            ? `: ${clip.reasons.map((reason) => rejectionLabel(reason, request)).join(", ")}.`
            : "."}
        </p>
      );
    case "checked":
      return <p className="text-muted-foreground">License checked. Waiting for the agent.</p>;
  }
}

function License({ clip, request }: { clip: BinClip; request: Manifest["request"] }) {
  const entry = clip.entry;
  if (!entry) {
    if (clip.outcome !== "accepted") return null;
    return (
      <p className="text-muted-foreground">
        {clip.standing === "unrecorded"
          ? "No license snapshot: the run was not recorded."
          : "The license snapshot arrives when the run is recorded."}
      </p>
    );
  }
  const { license, daysUntilExpiry, expiresSoon } = entry;
  return (
    <>
      <dl className="divide-y divide-border/60">
        <Row label="Training">{license.trainingAllowed ? "Allowed" : "Not allowed"}</Row>
        <Row label="Territories">
          <ul className="flex flex-wrap gap-1">
            {license.territories.map((territory) => (
              <li
                key={territory}
                className={cn(
                  "rounded-sm px-1.5 font-mono text-xs",
                  territory === request.territory
                    ? "bg-cleared text-[#08201a]"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {territory}
              </li>
            ))}
          </ul>
        </Row>
        <Row label="Expires">
          {license.expiresAt === null
            ? "Never"
            : `${longDate(license.expiresAt)}, ${daysUntilExpiry} days after use`}
        </Row>
      </dl>
      {expiresSoon && (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-warning/12 p-3 text-[13px] leading-relaxed text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          The license ends soon after the usage date. Check it covers the whole training run.
        </p>
      )}
    </>
  );
}

export function ClipDetails({ clip, request }: { clip: BinClip; request: Manifest["request"] }) {
  return (
    <div className="space-y-5 p-4">
      <ClipFrame
        large
        genre={clip.genre}
        language={clip.language}
        durationSec={clip.durationSec}
        outcome={clip.outcome}
        standing={clip.standing}
        refusal={clip.reasons[0] && rejectionLabel(clip.reasons[0], request)}
        endsInDays={clip.entry?.expiresSoon ? clip.entry.daysUntilExpiry : null}
      />
      <div>
        <h3 className="font-title text-base leading-snug">{clip.title ?? clip.clipId}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-mono">{clip.clipId}</span>
          {clip.genre && `, ${genreLabel(clip.genre)}`}
          {clip.language && `, ${languageLabel(clip.language)}`}
          {clip.durationSec != null && `, ${formatClipDuration(clip.durationSec)}`}
        </p>
      </div>
      <section aria-label="The rule's decision" className="text-[13px] leading-relaxed">
        <Verdict clip={clip} request={request} />
      </section>
      <section aria-labelledby="license-heading" className="text-[13px]">
        <h4 id="license-heading" className="mb-1 font-medium">
          License used for the decision
        </h4>
        <License clip={clip} request={request} />
        {!clip.entry && clip.outcome !== "accepted" && (
          <p className="text-muted-foreground">
            Only cleared clips carry a license snapshot in the manifest.
          </p>
        )}
      </section>
      {clip.entry && (
        <section aria-labelledby="reason-heading" className="text-[13px]">
          <h4 id="reason-heading" className="font-medium">
            Why the agent chose it
          </h4>
          <p className="mt-1 leading-relaxed">{clip.entry.reason}</p>
          <p className="mt-1 text-xs text-muted-foreground">Written by the model.</p>
        </section>
      )}
    </div>
  );
}
