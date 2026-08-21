import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AmbientBackground } from "@/components/AmbientBackground";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LifeOS",
  description: "O teu centro de comando pessoal — dinheiro, tarefas, hábitos e objetivos num só lugar.",
  applicationName: "LifeOS",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "LifeOS" },
};

export const viewport: Viewport = {
  themeColor: "#08080c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  // On Android the on-screen keyboard resizes the layout instead of covering
  // inputs, so the Nova composer and forms stay visible while typing.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_BOOTSTRAP_SCRIPT,
          }}
        />
      </head>
      <body className="min-h-full">
        <AmbientBackground />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

// Runs synchronously in <head> before the first paint, so the saved theme,
// accent and custom colors are applied with no flash of the default blue.
// Reads the same localStorage keys that app-context.tsx writes. Keep the
// accent map in sync with ACCENT_BY_COLOR in src/lib/app-context.tsx.
const THEME_BOOTSTRAP_SCRIPT = `(function () {
  try {
    var root = document.documentElement;
    var ACCENT = {
      "#6366f1": "indigo",
      "#8b5cf6": "violet",
      "#d946ef": "fuchsia",
      "#f43f5e": "rose",
      "#f97316": "amber",
      "#f59e0b": "amber",
      "#84cc16": "emerald",
      "#10b981": "emerald",
      "#0ea5e9": "sky",
      "#06b6d4": "teal"
    };
    var VALID = ["indigo", "violet", "sky", "emerald", "rose", "amber", "fuchsia", "teal", "graphite"];

    function readJSON(key) {
      try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    // 1) Accent (focus rings, switches, nav, aurora).
    var accent = localStorage.getItem("lifeos:accent");
    if (VALID.indexOf(accent) === -1) {
      var custom = readJSON("lifeos:theme-custom");
      var p = custom && custom.primary ? String(custom.primary).toLowerCase() : "";
      accent = ACCENT[p] || "indigo";
    }
    root.setAttribute("data-accent", accent);

    // 2) Custom theme colors (buttons, logo, background glow).
    var c = readJSON("lifeos:theme-custom");
    var primary = (c && c.primary) || "#6366f1";
    var secondary = (c && c.secondary) || "#8b5cf6";
    function rgba(hex, a) {
      var h = String(hex).replace("#", "");
      if (!/^[0-9a-fA-F]{6}$/.test(h)) return "rgba(99,102,241," + a + ")";
      var r = parseInt(h.slice(0, 2), 16);
      var g = parseInt(h.slice(2, 4), 16);
      var b = parseInt(h.slice(4, 6), 16);
      return "rgba(" + r + "," + g + "," + b + "," + a + ")";
    }
    root.style.setProperty("--app-primary", primary);
    root.style.setProperty("--app-secondary", secondary);
    root.style.setProperty("--app-glow-a", rgba(primary, 0.14));
    root.style.setProperty("--app-glow-b", rgba(secondary, 0.08));

    // 3) Dark / light / system.
    var theme = localStorage.getItem("lifeos:theme") || "dark";
    if (theme === "system") {
      theme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    root.classList.remove("dark", "light");
    root.classList.add(theme);
  } catch (e) {}
})();`;
