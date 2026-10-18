import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  title: string;
  /** Right side of the header: counts, a legend, tabs. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** One pane of the editor: a titled header over a body that scrolls on its own. */
export function Panel({ title, actions, children, className, bodyClassName }: PanelProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn("flex min-h-0 min-w-0 flex-col bg-card", className)}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4">
        <h2 id={titleId} className="font-title text-[13px] text-foreground">
          {title}
        </h2>
        {actions}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-auto", bodyClassName)}>{children}</div>
    </section>
  );
}
