"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // only register in production (dev hot-reload conflicts with SW caching)
    if (process.env.NODE_ENV !== "production") return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // First-ever install has no controller — let the SW take control so
          // offline caching and update detection work. Real updates (when a
          // controller already exists) stay waiting for the update banner.
          const activateIfFirst = () => {
            if (navigator.serviceWorker.controller) return;
            const sw = reg.waiting || reg.installing;
            if (sw && sw.state === "installed") {
              sw.postMessage({ type: "SKIP_WAITING" });
            }
          };
          if (reg.waiting) activateIfFirst();
          else {
            reg.addEventListener("updatefound", () => {
              const sw = reg.installing;
              if (!sw) return;
              sw.addEventListener("statechange", () => {
                if (sw.state === "installed") activateIfFirst();
              });
            });
          }
        })
        .catch(() => {});
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
