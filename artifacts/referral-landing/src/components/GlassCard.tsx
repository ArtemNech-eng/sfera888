import { cn } from "@/utils/cn";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  dark?: boolean;
}

export default function GlassCard({ children, className = "", hover = true, dark = false }: GlassCardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -6, transition: { duration: 0.25 } } : undefined}
      className={cn(
        "rounded-3xl p-6 transition-shadow duration-300",
        dark ? "glass-dark text-white" : "glass shadow-float hover:shadow-premium",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
