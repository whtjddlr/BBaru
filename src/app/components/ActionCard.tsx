import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface ActionCardProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  variant?: "primary" | "warning" | "success" | "neutral";
  children?: ReactNode;
}

export function ActionCard({
  icon: Icon,
  title,
  description,
  variant = "primary",
  children
}: ActionCardProps) {
  const variants = {
    primary: "bg-blue-600 text-white",
    warning: "bg-amber-500 text-white",
    success: "bg-emerald-500 text-white",
    neutral: "bg-white text-neutral-900 border border-neutral-200",
  };

  const iconVariants = {
    primary: "bg-blue-500",
    warning: "bg-amber-400",
    success: "bg-emerald-400",
    neutral: "bg-neutral-100 text-neutral-700",
  };

  return (
    <div className={`rounded-2xl p-4 shadow-sm ${variants[variant]}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-xl p-2.5 ${iconVariants[variant]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold mb-1">{title}</h3>
          {description && (
            <p className={`text-sm ${variant === 'neutral' ? 'text-neutral-600' : 'opacity-90'}`}>
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
