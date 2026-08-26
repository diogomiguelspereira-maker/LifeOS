import { cn } from "@/lib/cn";

/**
 * Brand mark: a hexagonal "life cell" with an orbit around a nucleus —
 * the self at the centre of its own system. Stroked with currentColor so it
 * adapts to any surface (tile, inline, favicon).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={className}>
      <path
        d="M24 2.5 42.5 13.25v21.5L24 45.5 5.5 34.75v-21.5Z"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <ellipse
        cx="24"
        cy="24"
        rx="13.2"
        ry="5.4"
        stroke="currentColor"
        strokeWidth="2.6"
        transform="rotate(-22 24 24)"
      />
      <circle cx="24" cy="24" r="4.2" fill="currentColor" />
    </svg>
  );
}

export function Logo({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "h-8 w-8 rounded-lg", md: "h-10 w-10 rounded-xl", lg: "h-14 w-14 rounded-2xl" };
  const markSizes = { sm: "h-[18px] w-[18px]", md: "h-[22px] w-[22px]", lg: "h-8 w-8" };
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center text-white shadow-sm ring-1 ring-white/10 ring-inset",
        sizes[size],
        className
      )}
      style={{
        background:
          "linear-gradient(135deg, var(--app-primary, #0d9488), var(--app-secondary, #2dd4bf))",
      }}
    >
      <LogoMark className={cn("text-white", markSizes[size])} />
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo />
      <span className="font-display text-lg font-bold tracking-tight text-ink">
        Life
        <span className="text-indigo-500">OS</span>
      </span>
    </div>
  );
}
