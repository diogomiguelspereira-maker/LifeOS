"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/* ---------- Button ---------- */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg" | "icon";
}) {
  const variants: Record<ButtonVariant, string> = {
    primary: "text-white hover:opacity-90",
    secondary:
      "bg-zinc-100 text-zinc-800 border border-zinc-200/60 shadow-sm hover:bg-zinc-200 dark:bg-white/8 dark:text-zinc-100 dark:border-white/10 dark:hover:bg-white/12 dark:shadow-none",
    ghost:
      "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/6",
    outline:
      "border border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-xs dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/6 dark:shadow-none",
    danger:
      "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25",
  };
  const sizes = {
    sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
    md: "h-10 px-4 text-sm rounded-xl gap-2",
    lg: "h-12 px-6 text-base rounded-2xl gap-2",
    icon: "h-9 w-9 rounded-lg",
  };
  return (
    <button
      type="button"
      style={
        variant === "primary"
          ? {
              background: "linear-gradient(90deg, var(--app-primary, #6366f1), var(--app-secondary, #8b5cf6))",
              boxShadow: "0 10px 30px -14px var(--app-primary, #6366f1)",
            }
          : undefined
      }
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

/* ---------- Card ---------- */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-card backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-start justify-between gap-2", className)}>
      <div>
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{title}</h3>
        {subtitle && <p className="text-xs text-zinc-400 dark:text-zinc-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Inputs ---------- */
export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 placeholder:text-zinc-300 shadow-input outline-none transition focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:shadow-none",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-300 shadow-input outline-none transition focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:shadow-none",
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full appearance-none rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 shadow-input outline-none transition focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 [&>option]:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:[&>option]:bg-zinc-900 dark:shadow-none",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide dark:text-zinc-400">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

/* ---------- Badge ---------- */
export function Badge({
  children,
  color = "zinc",
  className,
}: {
  children: React.ReactNode;
  color?: "zinc" | "green" | "red" | "amber" | "blue" | "violet" | "cyan" | "pink";
  className?: string;
}) {
  const colors = {
    zinc: "bg-zinc-100 text-zinc-600 border border-zinc-200/50 dark:bg-white/8 dark:text-zinc-300 dark:border-transparent",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-200/50 dark:bg-emerald-500/12 dark:text-emerald-400 dark:border-transparent",
    red: "bg-red-50 text-red-700 border border-red-200/50 dark:bg-red-500/12 dark:text-red-400 dark:border-transparent",
    amber: "bg-amber-50 text-amber-700 border border-amber-200/50 dark:bg-amber-500/12 dark:text-amber-400 dark:border-transparent",
    blue: "bg-sky-50 text-sky-700 border border-sky-200/50 dark:bg-sky-500/12 dark:text-sky-400 dark:border-transparent",
    violet: "bg-violet-50 text-violet-700 border border-violet-200/50 dark:bg-violet-500/12 dark:text-violet-400 dark:border-transparent",
    cyan: "bg-cyan-50 text-cyan-700 border border-cyan-200/50 dark:bg-cyan-500/12 dark:text-cyan-400 dark:border-transparent",
    pink: "bg-pink-50 text-pink-700 border border-pink-200/50 dark:bg-pink-500/12 dark:text-pink-400 dark:border-transparent",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        colors[color],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Progress ---------- */
export function Progress({
  value,
  color = "bg-gradient-to-r from-indigo-500 to-violet-500",
  className,
}: {
  value: number;
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/8", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* ---------- Switch ---------- */
export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-gradient-to-r from-indigo-500 to-violet-500" : "bg-zinc-200 dark:bg-white/12"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
          checked ? "left-[22px]" : "left-0.5"
        )}
      />
    </button>
  );
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex max-w-full flex-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-white/10 dark:bg-white/5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
            value === o.value
              ? "bg-white text-zinc-800 shadow-xs dark:bg-white/12 dark:text-zinc-100 dark:shadow-none"
              : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  // render at body level so no parent layout (transform, overflow, stacking)
  // can ever hide or break the dialog
  const panel = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-md p-4 animate-fade-in dark:bg-black/60"
      style={{ bottom: "var(--keyboard-inset, 0px)" }}
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-modal animate-scale-in dark:border-white/10 dark:bg-zinc-950 dark:shadow-none",
          maxWidth
        )}
        style={{ maxHeight: "calc(100dvh - 2rem - var(--keyboard-inset, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">{title}</h3>
          <button
            onClick={onClose}              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/8 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(panel, document.body) : panel;
}

/* ---------- Empty state ---------- */
export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-3xl dark:bg-white/[0.04]">{icon}</div>
      <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{title}</p>
      {subtitle && <p className="max-w-xs text-xs text-zinc-500">{subtitle}</p>}
    </div>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}
