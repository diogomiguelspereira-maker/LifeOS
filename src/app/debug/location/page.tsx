"use client";

import { useEffect, useState } from "react";

type Row = { k: string; v: string };

function guessInstallType(ua: string, standalone: boolean): string {
  const isAndroid = /android/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const webview = /wv|okhttp|webview/i.test(ua) || (isIOS && !/safari/i.test(ua) && /applewebkit/i.test(ua));
  let type = ua;
  if (isAndroid && webview) type = "Android WebView / TWA (user agent contains wv)";
  else if (isAndroid) type = "Android Chrome (browser or installed PWA)";
  else if (isIOS && standalone) type = "iOS standalone (home-screen app)";
  if (standalone) type += " — display-mode: standalone (installed app/PWA)";
  else type += " — display-mode: browser (normal tab)";
  return type;
}

export default function DebugLocationPage() {
  const [rows, setRows] = useState<Row[]>([{ k: "A carregar…", v: "" }]);

  useEffect(() => {
    let cancelled = false;
    const out: Row[] = [];
    const flush = () => {
      if (!cancelled) setRows([...out]);
    };

    const ua = navigator.userAgent;
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    out.push({ k: "Instalação", v: guessInstallType(ua, standalone) });
    out.push({ k: "User agent", v: ua });
    out.push({ k: "Geolocation API", v: "geolocation" in navigator ? "✅ disponível" : "❌ INDISPONÍVEL" });

    const checkPermission = () => {
      if (!navigator.permissions?.query) {
        out.push({ k: "Permissão (navigator.permissions)", v: "não suportado" });
        return;
      }
      navigator.permissions
        .query({ name: "geolocation" })
        .then((s) => {
          out.push({ k: "Estado da permissão", v: s.state });
          flush();
        })
        .catch((e) => {
          out.push({ k: "Permissão (erro)", v: String(e) });
          flush();
        });
    };

    const tryFix = () => {
      out.push({ k: "A pedir localização…", v: "aguarda (até 15s)" });
      flush();
      navigator.geolocation.getCurrentPosition(
        (p) => {
          out.push({
            k: "Resultado",
            v: `✅ OK — lat ${p.coords.latitude.toFixed(5)}, lon ${p.coords.longitude.toFixed(5)}, ±${Math.round(p.coords.accuracy)} m`,
          });
          flush();
        },
        (e) => {
          const codes = ["", "PERMISSION_DENIED", "POSITION_UNAVAILABLE", "TIMEOUT"];
          out.push({
            k: "Resultado",
            v: `❌ ERRO código ${e.code} (${codes[e.code] ?? "?"}) — ${e.message}`,
          });
          flush();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    };

    checkPermission();
    if ("geolocation" in navigator) tryFix();
    else flush();
    return () => {
      cancelled = true;
    };
  }, []);

  const text = rows.map((r) => `${r.k}: ${r.v}`).join("\n");

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 py-8">
      <h1 className="text-lg font-bold">Diagnóstico de localização</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Abre esta página na app instalada e também no Chrome, e envia o que aparecer.
      </p>
      <div className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{r.k}</p>
            <p className="mt-0.5 break-all text-sm font-mono text-zinc-800">{r.v}</p>
          </div>
        ))}
      </div>
      <button
        onClick={() => void navigator.clipboard?.writeText(text)}
        className="mt-4 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white"
      >
        Copiar resultado
      </button>
    </main>
  );
}
