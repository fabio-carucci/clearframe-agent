import { LogIn } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { ClipFrame } from "../run/clip-frame";

/** What the product does, shown before any word: cleared footage, one clip refused. */
function Filmstrip() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-hidden>
      <ClipFrame genre="nature_wildlife" language="en" durationSec={44} outcome="accepted" />
      <ClipFrame genre="music_performance" language="fr" durationSec={12} outcome="accepted" />
      <ClipFrame genre="street_urban" language="es" durationSec={28} outcome="accepted" />
      <ClipFrame
        genre="cooking"
        language="es"
        durationSec={67}
        outcome="refused"
        refusal="License expired"
        className="hidden sm:block"
      />
      <ClipFrame
        genre="sports_outdoor"
        language="pt"
        durationSec={31}
        outcome="accepted"
        endsInDays={16}
        className="hidden sm:block"
      />
    </div>
  );
}

export function SignInScreen({
  onSignIn,
  notice,
}: {
  onSignIn: () => void;
  notice: string | null;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col justify-center gap-10 px-4 py-12 sm:px-6">
      <div className="flex items-center gap-2.5">
        <BrandMark className="size-7" />
        <span className="font-title text-lg">Clearframe</span>
      </div>
      <Filmstrip />
      <div className="max-w-2xl">
        <h1 className="font-title text-3xl leading-tight sm:text-[2.5rem]">
          Compose training datasets you are licensed to use
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Describe the footage you need. An agent searches the catalog and proposes clips, and a
          license rule decides which ones enter the dataset. You watch it happen.
        </p>
        {notice && (
          <p role="status" className="mt-6 text-[15px] text-warning">
            {notice}
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button size="lg" className="h-10 px-5" onClick={onSignIn}>
            <LogIn aria-hidden />
            Sign in
          </Button>
          <span className="text-[13px] text-muted-foreground">
            Accounts are created by an administrator.
          </span>
        </div>
      </div>
    </main>
  );
}
