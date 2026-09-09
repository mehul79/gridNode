import { cn } from "@/lib/utils";

export type IsolationMode = "gvisor" | "runc";

const config: Record<IsolationMode, { color: string; textColor: string; label: string; title: string }> = {
  gvisor: {
    color: "bg-primary",
    textColor: "text-primary",
    label: "GVISOR",
    title: "Jobs run under gVisor, which intercepts syscalls in userspace.",
  },
  runc: {
    color: "bg-warning",
    textColor: "text-warning",
    label: "RUNC",
    title:
      "Jobs run under Docker's standard runtime, which shares this machine's kernel. " +
      "Install gVisor (runsc install) for stronger isolation.",
  },
};

interface IsolationBadgeProps {
  mode: IsolationMode | null;
  className?: string;
}

/**
 * How the machine sandboxes other people's code. Deliberately visible next to
 * the machine's status: a fallback to runc is a real reduction in isolation and
 * should not be discoverable only from the agent's logs.
 */
export default function IsolationBadge({ mode, className }: IsolationBadgeProps) {
  if (!mode) return null;

  const c = config[mode];
  if (!c) return null;

  return (
    <div
      title={c.title}
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[11px] font-medium tracking-wider",
        className
      )}
    >
      <div className={cn("h-1.5 w-1.5 rounded-none", c.color)} />
      <span className={c.textColor}>[{c.label}]</span>
    </div>
  );
}
