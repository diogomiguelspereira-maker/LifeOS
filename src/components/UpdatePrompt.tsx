"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";

/**
 * Shows "nova versão disponível" whenever a new deploy is detected: the
 * per-build service worker (see src/app/sw.js/route.ts) installs itself and
 * waits; this banner lets the user apply it. On approval the new SW takes
 * control and the page reloads onto the new version.
 */
export function UpdatePrompt() {
  const [updateReady, setUpdateReady] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const approvedRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // The prompt is Android-only: the installed app (TWA/PWA) can't hard-
    // refresh, so it needs the banner. Desktop browsers just reload normally.
    const ua = navigator.userAgent;
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? "";
    if (!/android/i.test(ua) && !/android/i.test(platform)) return;

    let disposed = false;

    // When the user approves, the new SW activates and claims the page — only
    // then reload. First-install activation (no approval) never reloads.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (disposed || !approvedRef.current) return;
      window.location.reload();
    });

    navigator.serviceWorker.ready
      .then((reg) => {
        if (disposed) return;
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            // Only prompt when an older version already controls the page,
            // i.e. this is a real update, not a first install.
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(sw);
              setUpdateReady(true);
            }
          });
        });
      })
      .catch(() => {});

    return () => {
      disposed = true;
    };
  }, []);

  function apply() {
    approvedRef.current = true;
    if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });
    // The reload is handled by the controllerchange listener.
  }

  if (!updateReady) return null;

  return (
    <div className="fixed inset-x-4 top-4 z-50 sm:inset-x-auto sm:right-6 sm:top-6 sm:w-[380px]">
      <div
        role="status"
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-modal animate-slide-up"
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
          style={{
            background:
              "linear-gradient(135deg, var(--app-primary, #0d9488), var(--app-secondary, #2dd4bf))",
          }}
        >
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Nova versão disponível
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Atualiza para veres as novidades.
          </p>
        </div>
        <button
          onClick={apply}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-white shadow-sm transition hover:opacity-90 active:scale-[0.97]"
          style={{ background: "var(--app-primary, #0d9488)" }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </button>
        <button
          onClick={() => setUpdateReady(false)}
          aria-label="Fechar"
          className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/8 dark:hover:text-zinc-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
