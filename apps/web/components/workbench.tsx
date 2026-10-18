"use client";

import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { type ComposeInput, composeDataset } from "@/lib/api";
import { SAMPLE_RUN } from "@/lib/sample";
import { RequestForm } from "./request-form";
import { RunResult } from "./run-result";
import { type Session, useSession } from "./use-session";

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function Header({ session }: { session: Session }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <p className="text-[17px] font-semibold tracking-tight">Clearframe</p>
        {session.status === "signedIn" && (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{session.email}</span>
            <button
              type="button"
              onClick={session.signOut}
              className="font-medium hover:text-action"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function Intro() {
  return (
    <div className="mb-6">
      <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
        Compose a training dataset
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Describe the footage you need. The agent proposes clips from the catalog; a license rule
        decides which ones go in.
      </p>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-2 text-[15px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}

function SignedInWorkbench({ session }: { session: Extract<Session, { status: "signedIn" }> }) {
  const today = localToday();
  const [input, setInput] = useState<ComposeInput>({ prompt: "", territory: "ES", date: today });
  const run = useMutation({
    mutationFn: async (request: ComposeInput) =>
      composeDataset(await session.getAccessToken(), request),
  });

  return (
    <Layout
      aside={
        <RequestForm
          value={input}
          today={today}
          pending={run.isPending}
          onChange={setInput}
          onSubmit={() => run.mutate(input)}
        />
      }
    >
      <div aria-live="polite">
        {run.isPending && (
          <Notice title="Composing your dataset">
            The agent is searching the catalog and checking every license. This usually takes about
            ten seconds.
          </Notice>
        )}
        {run.isError && <Notice title="The dataset was not composed">{run.error.message}</Notice>}
        {run.isSuccess && <RunResult data={run.data} />}
        {run.isIdle && (
          <Notice title="Nothing composed yet">
            Write a request or pick an example, then compose. You will see the clips the rule
            accepted, the ones it refused and why, every step the agent took, and what it cost.
          </Notice>
        )}
      </div>
    </Layout>
  );
}

function Layout({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[22rem_1fr]">
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <Intro />
        {aside}
      </aside>
      <section aria-label="Result" className="min-w-0">
        {children}
      </section>
    </main>
  );
}

function Body({ session }: { session: Session }) {
  switch (session.status) {
    case "loading":
      return <p className="mx-auto max-w-6xl px-4 py-8 text-muted sm:px-6">Loading…</p>;
    case "unavailable":
      return (
        <div className="mx-auto max-w-xl px-4 py-12">
          <Notice title="Clearframe is unavailable">
            {session.message} Reload the page to retry.
          </Notice>
        </div>
      );
    case "signedOut":
      return (
        <div className="mx-auto max-w-xl px-4 py-12">
          <Intro />
          <Notice title="Sign in to compose datasets">
            <p>Accounts are created by an administrator.</p>
            <button
              type="button"
              onClick={session.signIn}
              className="mt-4 rounded-md bg-ink px-4 py-2.5 text-[15px] font-medium text-white hover:bg-action"
            >
              Sign in
            </button>
          </Notice>
        </div>
      );
    case "preview":
      return (
        <Layout
          aside={
            <>
              <p className="mb-5 rounded-md bg-surface p-3 text-[13px] leading-snug text-muted">
                Local preview: no config.json, so sign-in and live runs are off. The result is a
                recorded run from the deployed agent.
              </p>
              <RequestForm
                value={SAMPLE_RUN.manifest.request}
                today={SAMPLE_RUN.manifest.request.date}
                pending={false}
                disabled
                onChange={() => {}}
                onSubmit={() => {}}
              />
            </>
          }
        >
          <RunResult data={SAMPLE_RUN} />
        </Layout>
      );
    case "signedIn":
      return <SignedInWorkbench session={session} />;
  }
}

export function Workbench() {
  const session = useSession();
  return (
    <>
      <Header session={session} />
      <Body session={session} />
    </>
  );
}
