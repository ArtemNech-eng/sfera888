import { cn } from "@/utils/cn";
import type { ReactNode } from "react";

interface GradientButtonProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function GradientButton({
  children,
  onClick,
  className = "",
  type = "button",
  disabled = false,
  size = "md",
}: GradientButtonProps) {
  const sizeClasses = {
    sm: "px-5 py-2.5 text-sm",
    md: "px-7 py-3.5 text-base",
    lg: "px-8 py-4 text-lg",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "gradient-bg text-white font-semibold rounded-2xl transition-all duration-300",
        "hover:scale-[1.02] hover:shadow-lg hover:shadow-emerald-500/30",
        "active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed",
        "glow-green",
        sizeClasses[size],
        className
      )}
    >
      {children}
    </button>
  );
}
