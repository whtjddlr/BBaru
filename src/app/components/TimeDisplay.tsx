interface TimeDisplayProps {
  label: string;
  time: string;
  subtext?: string;
  variant?: "default" | "large";
}

export function TimeDisplay({ label, time, subtext, variant = "default" }: TimeDisplayProps) {
  if (variant === "large") {
    return (
      <div className="text-center">
        <div className="text-sm text-neutral-500 mb-1">{label}</div>
        <div className="text-4xl text-neutral-900 mb-1 tabular-nums tracking-tight font-bold">
          {time}
        </div>
        {subtext && <div className="text-sm text-neutral-600">{subtext}</div>}
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-neutral-500 mb-0.5">{label}</div>
      <div className="text-2xl text-neutral-900 tabular-nums font-semibold">
        {time}
      </div>
      {subtext && <div className="text-xs text-neutral-600 mt-0.5">{subtext}</div>}
    </div>
  );
}
