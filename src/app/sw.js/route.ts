import { readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

/**
 * A unique id per deploy — the browser compares /sw.js bytes on every
 * navigation, so injecting this makes each deploy detectable client-side
 * ("new version available" prompt). BUILD_ID is written by `next build`;
 * Vercel's commit SHA is the fallback.
 */
function buildId(): string {
  try {
    const id = readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
    if (id) return id;
  } catch {}
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 12);
  return "dev";
}

/** The template is copied into .next/ by scripts/postbuild.mjs at build time. */
function template(): string {
  try {
    return readFileSync(join(process.cwd(), ".next", "sw-template.js"), "utf8");
  } catch {
    // dev without postbuild — read the source directly
    return readFileSync(join(process.cwd(), "sw.template.js"), "utf8");
  }
}

export async function GET() {
  const body = template().replaceAll("__BUILD_ID__", buildId());
  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
