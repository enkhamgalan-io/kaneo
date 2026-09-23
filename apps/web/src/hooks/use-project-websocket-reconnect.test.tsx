import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@kaneo/libs", () => ({
  windowId: "test-window-id",
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "user-1" } } }),
  },
}));

import {
  PROJECT_ACCESS_REVOKED_CLOSE_CODE,
  useProjectWebSocket,
} from "./use-project-websocket";

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send() {}
  close() {}
}

function renderSocket(queryClient: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useProjectWebSocket("project-1"), { wrapper });
}

describe("useProjectWebSocket reconnects", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_API_URL", "http://localhost:1337");
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("after an ordinary drop", () => {
    renderSocket(new QueryClient());
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0]?.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(1_000);

    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("not after the server revokes the user's access, and refetches projects", () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    renderSocket(queryClient);

    FakeWebSocket.instances[0]?.onclose?.({
      code: PROJECT_ACCESS_REVOKED_CLOSE_CODE,
    });
    vi.advanceTimersByTime(60_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects"] });
  });
});
