"use client";

import type { RunEvent } from "@clearframe/contracts";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { Panel } from "@/components/panel";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/lib/use-media-query";
import { SignInScreen } from "../auth/sign-in-screen";
import { type Session, useSession } from "../auth/use-session";
import { type ComposeInput, composeLive } from "../compose/compose-stream";
import { RequestPanel } from "../compose/request-panel";
import { ClipBin } from "../run/clip-bin";
import { ClipDetails } from "../run/clip-details";
import { type DetailsTab, DetailsPanel } from "../run/details-panel";
import { binClips } from "../run/live-run";
import { recordedResult, replay } from "../run/replay";
import { RunSummary } from "../run/run-summary";
import { SAMPLE_RECORDING } from "../run/sample";
import { Timeline } from "../run/timeline";
import { useElapsed, useLiveRun } from "../run/use-live-run";
import { TopBar } from "./top-bar";

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

type SignedIn = Extract<Session, { status: "signedIn" }>;

interface EditorProps {
  session?: SignedIn;
  /** A recorded run, opened as it ended and replayable: the local preview. */
  recording?: RunEvent[];
}

function Editor({ session, recording }: EditorProps) {
  const recorded = recording && recordedResult(recording);
  const today = recorded?.manifest.request.date ?? localToday();
  const [input, setInput] = useState<ComposeInput>(
    recorded?.manifest.request ?? { prompt: "", territory: "ES", date: today },
  );
  const { run, start } = useLiveRun(recorded);
  const elapsedMs = useElapsed(run);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailsTab>("run");
  const [sheetOpen, setSheetOpen] = useState(false);
  const selected =
    run && selectedId ? binClips(run).find((c) => c.clipId === selectedId) : undefined;

  const begin = () => {
    setSelectedId(null);
    setTab("run");
    if (recording) {
      void start(input, (onEvent) => replay(recording, onEvent));
    } else if (session) {
      void start(input, async (onEvent) =>
        composeLive(await session.getAccessToken(), input, onEvent),
      );
    }
  };

  // The Run tab shows the error too, but it may be hidden behind the Clip tab or below the fold.
  const failure = run?.status === "failed" ? run.error : null;
  const failedRun = failure ? run?.startedAt : undefined;
  useEffect(() => {
    if (failure) toast.error(failure);
  }, [failure, failedRun]);

  const select = (clipId: string) => {
    setSelectedId(clipId);
    setTab("clip");
    if (!desktop) setSheetOpen(true);
  };

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <TopBar run={run} elapsedMs={elapsedMs} account={session} />
      <main className="grid flex-1 auto-rows-min grid-cols-[minmax(0,1fr)] gap-px bg-border md:grid-cols-[17rem_minmax(0,1fr)] lg:min-h-0 lg:auto-rows-auto lg:grid-cols-[19rem_minmax(0,1fr)_22rem] lg:grid-rows-[minmax(0,1fr)_13.5rem]">
        <RequestPanel
          value={input}
          today={today}
          pending={run?.status === "running"}
          replay={Boolean(recording)}
          notice={
            recording && (
              <p className="mb-4 rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                Local preview without config.json, so sign-in is off. This run was recorded from the
                deployed agent; replay it to watch it as it happened.
              </p>
            )
          }
          onChange={setInput}
          onSubmit={begin}
        />
        <ClipBin run={run} selectedId={selectedId} onSelect={select} className="min-h-72" />
        <DetailsPanel
          run={run}
          selectedId={selectedId}
          tab={tab}
          onTabChange={setTab}
          className="hidden lg:flex"
        />
        <Timeline run={run} elapsedMs={elapsedMs} className="md:col-span-2 lg:col-span-3" />
        <Panel title="Run" className="md:col-span-2 lg:hidden">
          <RunSummary run={run} />
        </Panel>
      </main>

      <Sheet open={sheetOpen && !desktop && Boolean(selected)} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto p-0 pt-10 sm:max-w-md">
          <SheetTitle className="sr-only">Clip details</SheetTitle>
          {run && selected && <ClipDetails clip={selected} request={run.request} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-content-center justify-items-center gap-4 p-6 text-center">
      <BrandMark className="size-8" />
      {children}
    </main>
  );
}

export function Workspace() {
  const session = useSession();
  switch (session.status) {
    case "loading":
      return (
        <Centered>
          <p className="text-muted-foreground">Loading…</p>
        </Centered>
      );
    case "unavailable":
      return (
        <Centered>
          <p className="max-w-sm leading-relaxed text-muted-foreground">
            {session.message} Reload the page to retry.
          </p>
        </Centered>
      );
    case "signedOut":
      return <SignInScreen onSignIn={session.signIn} />;
    case "preview":
      return <Editor recording={SAMPLE_RECORDING} />;
    case "signedIn":
      return <Editor session={session} />;
  }
}
