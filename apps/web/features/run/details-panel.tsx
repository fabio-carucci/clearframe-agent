import { MousePointerClick } from "lucide-react";
import { Panel } from "@/components/panel";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipDetails } from "./clip-details";
import { type LiveRun, binClips } from "./live-run";
import { RunSummary } from "./run-summary";

export type DetailsTab = "clip" | "run";

interface DetailsPanelProps {
  run: LiveRun | null;
  selectedId: string | null;
  tab: DetailsTab;
  onTabChange: (tab: DetailsTab) => void;
  className?: string;
}

export function DetailsPanel({ run, selectedId, tab, onTabChange, className }: DetailsPanelProps) {
  const clip = run && selectedId ? binClips(run).find((c) => c.clipId === selectedId) : undefined;
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as DetailsTab)}
      className={cn("min-h-0 min-w-0 gap-0", className)}
    >
      <Panel
        title="Details"
        className="flex-1"
        actions={
          <TabsList className="h-7">
            <TabsTrigger value="clip" className="px-2.5 text-xs">
              Clip
            </TabsTrigger>
            <TabsTrigger value="run" className="px-2.5 text-xs">
              Run
            </TabsTrigger>
          </TabsList>
        }
      >
        <TabsContent value="clip">
          {run && clip ? (
            <ClipDetails clip={clip} request={run.request} />
          ) : (
            <div className="grid min-h-48 place-content-center justify-items-center gap-3 p-8 text-center">
              <MousePointerClick
                className="size-6 text-muted-foreground/60"
                strokeWidth={1.5}
                aria-hidden
              />
              <p className="max-w-56 text-[13px] leading-relaxed text-muted-foreground">
                Select a clip to see the license the rule decided on.
              </p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="run">
          <RunSummary run={run} />
        </TabsContent>
      </Panel>
    </Tabs>
  );
}
