"use client";

import { useEffect } from "react";

/**
 * Android's on-screen keyboard overlays the page — the layout viewport does not
 * resize — so bottom-anchored bars (nav, composer) and inputs can end up hidden
 * behind it. We deliberately avoid `interactive-widget=resizes-content` in the
 * viewport meta: it made the TWA zoom into the top-left corner ~1s after load.
 * Instead, this component tracks the visual viewport and exposes the keyboard
 * height as `--keyboard-inset` (and a `.keyboard-open` class on <html>) so the
 * layout can raise bottom-anchored UI above the keyboard.
 */
export function KeyboardManager() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;
    const apply = () => {
      raf = 0;
      const inset = Math.max(0, window.innerHeight - vv.height);
      const root = document.documentElement;
      root.style.setProperty("--keyboard-inset", `${inset}px`);
      root.classList.toggle("keyboard-open", inset > 60);
      if (inset > 60) {
        const el = document.activeElement;
        if (
          el &&
          (el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement ||
            el instanceof HTMLSelectElement)
        ) {
          el.scrollIntoView({ block: "nearest" });
        }
      }
    };
    const onResize = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    apply();

    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
