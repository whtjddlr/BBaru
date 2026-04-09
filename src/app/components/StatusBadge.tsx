import { ReactNode } from "react";

interface StatusBadgeProps {
  variant: "early" | "ontime" | "late" | "optimal";
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

export function StatusBadge({ variant, children, size = "md" }: StatusBadgeProps) {
  const variants = {
    early: "bg-blue-50 text-blue-700 border-blue-200",
    ontime: "bg-emerald-50 text-emerald-700 border-emerald-200",
    late: "bg-red-50 text-red-700 border-red-200",
    optimal: "bg-purple-50 text-purple-700 border-purple-200",
  };

  const sizes = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
    lg: "px-4 py-1.5 text-base",
  };

  return (
    <span className={`inline-flex items-center border rounded-full ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
}
