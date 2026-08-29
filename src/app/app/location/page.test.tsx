import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";

const { rpcMock, clientObj } = vi.hoisted(() => {
  const rpc = vi.fn(); // loose mock — configured per test
  const client = {
    rpc,
    channel: vi.fn(() => ({
      subscribe: vi.fn(() => Promise.resolve(undefined)),
      send: vi.fn(),
      removeChannel: vi.fn(),
    })),
    removeChannel: vi.fn(),
  };
  return { rpcMock: rpc, clientObj: client };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => clientObj,
}));

vi.mock("@/lib/app-context", () => ({
  useApp: () => ({ t: en, profile: null }),
  useSupabase: () => clientObj,
}));

import { en } from "@/lib/i18n";
import LocationPage from "./page";

beforeEach(() => {
  rpcMock.mockReset();
  // jsdom has no geolocation; the page needs it to start sharing.
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn(() => 42),
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
    },
  });
  rpcMock.mockImplementation((fn: string) => {
    if (fn === "create_location_share") return Promise.resolve({ data: "tok123" });
    if (fn === "get_share_viewer_count") return Promise.resolve({ data: 2 });
    return Promise.resolve({ data: null, error: null });
  });
});

describe("sharer live viewer count", () => {
  it("polls get_share_viewer_count and shows it in the share panel while sharing", async () => {
    render(<LocationPage />);
    const user = userEvent.setup();

    // No count before sharing starts.
    expect(screen.queryByText("2 watching now")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: en.location.start }));
    expect(await screen.findByText("2 watching now")).toBeInTheDocument();

    // The count comes from the RPC poll.
    const countCall = rpcMock.mock.calls.find((c) => c[0] === "get_share_viewer_count");
    expect(countCall).toBeDefined();
    expect(countCall![1]).toEqual({ p_token: "tok123" });
  });

  it("hides the count when sharing stops", async () => {
    render(<LocationPage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: en.location.start }));
    expect(await screen.findByText("2 watching now")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: en.location.stop }));
    await act(async () => {});
    expect(screen.queryByText("2 watching now")).not.toBeInTheDocument();
    // Stopping tells the backend to end the share.
    const stopCall = rpcMock.mock.calls.find((c) => c[0] === "stop_location_share");
    expect(stopCall).toBeDefined();
    expect(stopCall![1]).toEqual({ p_token: "tok123" });
  });

  it("toggles the QR code for the share link", async () => {
    const { container } = render(<LocationPage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: en.location.start }));
    await screen.findByText("2 watching now");
    const svgsBefore = container.querySelectorAll("svg").length;

    // Hidden by default.
    expect(container.querySelectorAll("svg").length).toBe(svgsBefore);

    await user.click(screen.getByRole("button", { name: "QR code" }));
    // qrcode.react renders an <svg>, so the count grows once the QR is shown.
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(svgsBefore);

    // Toggling again hides it.
    await user.click(screen.getByRole("button", { name: "QR code" }));
    expect(container.querySelectorAll("svg").length).toBe(svgsBefore);
  });  it("copies the share link to the clipboard", async () => {
    render(<LocationPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: en.location.start }));
    await screen.findByText("2 watching now");

    // Stub clipboard after mounting — something in the render/hydration path
    // replaces it, so an earlier assign is wiped before the handler runs.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await user.click(screen.getByRole("button", { name: en.location.copy }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/share/location/tok123`);
  });

  it("shows the live expiry countdown once sharing starts", async () => {
    render(<LocationPage />);
    const user = userEvent.setup();
    expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: en.location.start }));
    expect(await screen.findByText(/Expires in/)).toBeInTheDocument();
  });
});