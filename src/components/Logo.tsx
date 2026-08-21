import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

export function Logo({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "h-8 w-8 rounded-lg", md: "h-10 w-10 rounded-xl", lg: "h-14 w-14 rounded-2xl" };
  const iconSizes = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" };
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center", sizes[size], className)}
      style={{
        background: "linear-gradient(135deg, var(--app-primary, #6366f1), var(--app-secondary, #8b5cf6))",
        boxShadow: "0 8px 24px -10px var(--app-primary, #6366f1)",
      }}
    >
      <Sparkles className={cn("text-white", iconSizes[size])} />
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo />
      <span className="text-lg font-bold tracking-tight text-zinc-100 dark:text-zinc-100">
        Life
        <span
          style={{
            backgroundImage: "linear-gradient(90deg, var(--app-primary, #818cf8), var(--app-secondary, #a78bfa))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          OS
        </span>
      </span>
    </div>
  );
}
