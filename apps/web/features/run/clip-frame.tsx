import type { ClipDecision, Genre, Language } from "@clearframe/contracts";
import {
  Briefcase,
  Building2,
  Check,
  ChefHat,
  CircleX,
  Clock,
  Dumbbell,
  Film,
  type LucideIcon,
  Mic,
  Mountain,
  Music,
  Trees,
} from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./clip-frame.module.css";
import { formatClipDuration, outcomeLabel } from "./format";

const GENRE_ICONS: Record<Genre, LucideIcon> = {
  nature_wildlife: Trees,
  sports_outdoor: Mountain,
  sports_indoor: Dumbbell,
  cooking: ChefHat,
  street_urban: Building2,
  interview: Mic,
  music_performance: Music,
  workplace: Briefcase,
};

interface ClipFrameProps {
  genre: Genre | null;
  language: Language | null;
  durationSec: number | null;
  outcome: ClipDecision["outcome"];
  /** Why the rule refused the clip, shown on its offline frame. */
  refusal?: string;
  /** Days until the license ends, when that is soon after the usage date. */
  endsInDays?: number | null;
  large?: boolean;
  className?: string;
}

export function ClipFrame({
  genre,
  language,
  durationSec,
  outcome,
  refusal,
  endsInDays,
  large,
  className,
}: ClipFrameProps) {
  const Icon = genre ? GENRE_ICONS[genre] : Film;
  const refused = outcome === "refused";

  return (
    <div
      className={cn(styles.frame, large && styles.large, className)}
      data-genre={genre ?? undefined}
      data-outcome={outcome}
    >
      {refused ? (
        <div className={styles.offline}>
          <span className={styles.offlineTitle}>
            <CircleX className="size-3.5" aria-hidden />
            Not cleared
          </span>
          {refusal && <span className={styles.offlineReason}>{refusal}</span>}
        </div>
      ) : (
        <>
          <Icon className={styles.icon} aria-hidden />
          <span className={cn(styles.corner, styles.status)}>
            {outcome === "accepted" && <Check className="size-3" aria-hidden />}
            {outcomeLabel(outcome)}
          </span>
        </>
      )}
      {language && !refused && (
        <span className={cn(styles.corner, styles.language)}>{language.toUpperCase()}</span>
      )}
      {endsInDays != null && !refused && (
        <span className={cn(styles.corner, styles.expiry)}>
          <Clock className="size-3" aria-hidden />
          Ends in {endsInDays} {endsInDays === 1 ? "day" : "days"}
        </span>
      )}
      {durationSec != null && (
        <span className={cn(styles.corner, styles.duration)}>
          {formatClipDuration(durationSec)}
        </span>
      )}
    </div>
  );
}
