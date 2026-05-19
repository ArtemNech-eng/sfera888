import { cn } from "@/utils/cn";
import { motion } from "framer-motion";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  light?: boolean;
  className?: string;
}

export default function SectionHeader({ title, subtitle, align = "center", light = false, className = "" }: SectionHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6 }}
      className={cn(
        "mb-12",
        align === "center" ? "text-center" : "text-left",
        className
      )}
    >
      <h2 className={cn(
        "text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight",
        light ? "text-white" : "text-[#111827]"
      )}>
        {title}
      </h2>
      {subtitle && (
        <p className={cn(
          "mt-4 text-base sm:text-lg max-w-xl",
          align === "center" && "mx-auto",
          light ? "text-gray-300" : "text-[#6B7280]"
        )}>
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
