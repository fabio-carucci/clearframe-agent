"use client";

import type { RunEvent } from "@clearframe/contracts";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { Panel } from "@/components/panel";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ApiError } from "@/lib/api-error";
import { useMediaQuery } from "@/lib/use-media-query";
import { SignInScreen } from "../auth/sign-in-screen";
import { type Session, useSession } from "../auth/use-session";
import { type ComposeInput, composeLive } from "../compose/compose-stream";
import { fetchRun } from "../history/history-client";
import { RUNS_QUERY_KEY, RunHistory } from "../history/run-history";
import { RequestPanel } from "../compose/request-panel";
import { ClipBin } from "../run/clip-bin";
import { ClipDetails } from "../run/clip-details";
import { type DetailsTab, DetailsPanel } from "../run/details-panel";
import { binClips } from "../run/live-run";
import { recordedResult, replay } from "../run/replay";
import { RunSummary } from "../run/run-summary";
import { SAMPLE_RECORDING } from "../run/sample";
import { Timeline } from "../run/timeline";
import { useLiveRun } from "../run/use-live-run";
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
  const { run, start, show } = useLiveRun(recorded);
  const queryClient = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailsTab>("run");
  const [sheetOpen, setSheetOpen] = useState(false);
  const clips = useMemo(() => (run ? binClips(run) : []), [run]);
  const selected = clips.find((clip) => clip.clipId === selectedId);

  const begin = () => {
    setSelectedId(null);
    setTab("run");
    if (recording) {
      void start(input, (onEvent, signal) => replay(recording, onEvent, signal));
    } else if (session) {
      void start(input, async (onEvent, signal) => {
        try {
          return await composeLive(await session.getAccessToken(), input, onEvent, signal);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) session.expire(error.message);
          throw error;
        }
      });
    }
  };

  // The Run tab shows the error too, but it may be hidden behind the Clip tab or below the fold.
  const failure = run?.status === "failed" ? run.error : null;
  const failedRun = failure ? run?.startedAt : undefined;
  useEffect(() => {
    if (failure) toast.error(failure);
  }, [failure, failedRun]);

  // A run recorded on this page belongs at the top of the history.
  const recordedHere = run?.status === "completed" && !run.audit ? run.runId : null;
  useEffect(() => {
    if (recordedHere) void queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY });
  }, [recordedHere, queryClient]);

  const openRun = async (runId: string) => {
    if (!session) return;
    setOpening(runId);
    try {
      const detail = await fetchRun(await session.getAccessToken(), runId);
      show(detail);
      // Today, not the run's date: a past usage date would revive licenses since expired.
      setInput({ ...detail.manifest.request, date: today });
      setSelectedId(null);
      setTab("run");
      setHistoryOpen(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) session.expire(error.message);
      else toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setOpening(null);
    }
  };

  const select = (clipId: string) => {
    setSelectedId(clipId);
    setTab("clip");
    if (!desktop) setSheetOpen(true);
  };

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <TopBar
        run={run}
        account={session}
        onOpenRuns={session ? () => setHistoryOpen(true) : undefined}
      />
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
        <ClipBin
          run={run}
          clips={clips}
          selectedId={selectedId}
          onSelect={select}
          className="min-h-72"
        />
        <DetailsPanel
          run={run}
          clip={selected}
          tab={tab}
          onTabChange={setTab}
          className="hidden lg:flex"
        />
        <Timeline run={run} className="md:col-span-2 lg:col-span-3" />
        <Panel title="Run" className="md:col-span-2 lg:hidden">
          <RunSummary run={run} />
        </Panel>
      </main>

      {session && (
        <RunHistory
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          getAccessToken={session.getAccessToken}
          onOpen={(runId) => void openRun(runId)}
          opening={opening}
        />
      )}

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
      return <SignInScreen onSignIn={session.signIn} notice={session.notice} />;
    case "preview":
      return <Editor recording={SAMPLE_RECORDING} />;
    case "signedIn":
      return <Editor session={session} />;
  }
}
