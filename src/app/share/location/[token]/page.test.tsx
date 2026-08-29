import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Suspense, act } from "react";

// Single shared client so every component instance (and the effect re-runs) hits
// the same rpc mock. Built with vi.hoisted because vi.mock factories are hoisted.
const { rpcMock, clientObj } = vi.hoisted(() => {
  const rpc = vi.fn(); // loose mock — each test configures its own behavior
  const client = {
    rpc,
    channel: vi.fn(() => ({
      subscribe: vi.fn(() => Promise.resolve(undefined)),
      send: vi.fn(),
      unsubscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  };
  return { rpcMock: rpc, clientObj: client };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => clientObj,
}));

import SharedLocationPage from "./page";

type Location = {
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  updated_at: string | null;
  expires_at: string;
  owner_name: string | null;
};

function makeRow(overrides: Partial<Location> = {}): Location {
  return {
    lat: 38.7223,
    lon: -9.1393,
    accuracy: 12,
    updated_at: "2026-01-01T00:00:00Z",
    expires_at: "2026-01-01T01:00:00Z",
    owner_name: "Gil",
    ...overrides,
  };
}

const noFix = makeRow({ lat: null, lon: null, updated_at: null });

function callsFor(name: string): number {
  return rpcMock.mock.calls.filter((c) => c[0] === name).length;
}

async function renderShare() {
  const params = Promise.resolve({ token: "abc" });
  // The component suspends on `use(params)`, so the render itself must run inside
  // an awaited act; a plain synchronous render() leaves the Suspense unresolved.
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <SharedLocationPage params={params} />
      </Suspense>
    );
  });
  // Flush the resumed render and the initial poll microtask(s). With fake timers
  // on, also advance zero time so any scheduler-scheduled work (setTimeout(0)) runs.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function stubPolling(impl: (fn: string) => Promise<Record<string, unknown>>) {
  rpcMock.mockImplementation((fn: string) => impl(fn));
}

describe("share location polling loop", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  it("polls on the fast cadence (2s) while waiting for the sharer's first fix", async () => {
    vi.useFakeTimers();
    stubPolling(async (fn) => {
      if (fn === "get_shared_location") return { data: [noFix] };
      if (fn === "ping_share_viewer") return { data: true };
      return { data: null, error: null };
    });
    await renderShare();
    expect(callsFor("get_shared_location")).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(callsFor("get_shared_location")).toBe(1); // under 2s

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {});
    expect(callsFor("get_shared_location")).toBe(2); // fast cadence
  });

  it("backs off to the idle cadence (6s) once a fix is available", async () => {
    vi.useFakeTimers();
    stubPolling(async (fn) => {
      if (fn === "get_shared_location") return { data: [makeRow()] };
      if (fn === "ping_share_viewer") return { data: true };
      return { data: null, error: null };
    });
    await renderShare();
    expect(callsFor("get_shared_location")).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await act(async () => {});
    expect(callsFor("get_shared_location")).toBe(1); // > fast(2s) but < idle(6s)

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await act(async () => {});
    expect(callsFor("get_shared_location")).toBe(2); // idle cadence reached
  });

  it("immediately shows 'unavailable' and stops polling when the share is invalid", async () => {
    vi.useFakeTimers();
    stubPolling(async (fn) => {
      if (fn === "ping_share_viewer") return { data: true };
      return { data: [], error: null }; // no row → expired/stopped/invalid token
    });
    await renderShare();
    expect(screen.getByText("This location is no longer available.")).toBeInTheDocument();

    const before = callsFor("get_shared_location");
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    await act(async () => {});
    expect(callsFor("get_shared_location")).toBe(before); // no further polls
    expect(callsFor("ping_share_viewer")).toBe(0); // and no heartbeats
  });

  it("sends a heartbeat immediately and every 5s while the share is valid", async () => {
    vi.useFakeTimers();
    stubPolling(async (fn) => {
      if (fn === "get_shared_location") return { data: [makeRow()] };
      if (fn === "ping_share_viewer") return { data: true };
      return { data: null, error: null };
    });
    await renderShare();
    await act(async () => {});
    expect(callsFor("ping_share_viewer")).toBe(1); // immediate heartbeat once valid

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await act(async () => {});
    expect(callsFor("ping_share_viewer")).toBe(2);

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    await act(async () => {});
    expect(callsFor("ping_share_viewer")).toBe(4); // +1 at 5s, +2 at +10s

    // Heartbeat carries a viewer id (the per-tab presence key).
    const ping = rpcMock.mock.calls.find((c) => c[0] === "ping_share_viewer");
    const viewerId = ping?.[1]?.p_viewer_id as string | undefined;
    expect(viewerId).toBeDefined();
    expect(viewerId!.length).toBeGreaterThanOrEqual(8);
    expect(viewerId!.length).toBeLessThanOrEqual(64);
  });

  it("pauses heartbeats while the tab is hidden and resumes when visible again", async () => {
    vi.useFakeTimers();
    stubPolling(async (fn) => {
      if (fn === "get_shared_location") return { data: [makeRow()] };
      if (fn === "ping_share_viewer") return { data: true };
      return { data: null, error: null };
    });
    await renderShare();
    await act(async () => {});
    expect(callsFor("ping_share_viewer")).toBe(1);

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    await act(async () => {});
    expect(callsFor("ping_share_viewer")).toBe(1); // backgrounded → no new pings

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await act(async () => {});
    expect(callsFor("ping_share_viewer")).toBeGreaterThanOrEqual(3); // resumed
  });

  it("shows the live expiry countdown once a valid share is loaded", async () => {
    vi.useFakeTimers();
    stubPolling(async (fn) => {
      if (fn === "get_shared_location")
        return { data: [makeRow({ expires_at: "2099-01-01T00:00:00Z" })] };
      if (fn === "ping_share_viewer") return { data: true };
      return { data: null, error: null };
    });
    await renderShare();
    expect(screen.getByText(/Expires in/)).toBeInTheDocument();
  });

  it("shows the share as expired once its expires_at passes", async () => {
    vi.useFakeTimers();
    stubPolling(async (fn) => {
      if (fn === "get_shared_location")
        return { data: [makeRow({ expires_at: "2000-01-01T00:00:00Z" })] };
      if (fn === "ping_share_viewer") return { data: true };
      return { data: null, error: null };
    });
    await renderShare();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("pauses location polling while hidden and resumes immediately when visible", async () => {
    vi.useFakeTimers();
    stubPolling(async (fn) => {
      if (fn === "get_shared_location") return { data: [makeRow()] };
      if (fn === "ping_share_viewer") return { data: true };
      return { data: null, error: null };
    });
    await renderShare();
    await act(async () => {});
    const before = callsFor("get_shared_location");

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    await act(async () => {});
    expect(callsFor("get_shared_location")).toBe(before); // paused while hidden

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {});
    expect(callsFor("get_shared_location")).toBe(before + 1); // resumed immediately
  });
});