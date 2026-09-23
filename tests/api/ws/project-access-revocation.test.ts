import { afterEach, describe, expect, it, vi } from "vitest";

// Prevents side effects from the top-level subscribeToEvent calls in
// ws/index.ts.
vi.mock("../../../apps/api/src/events", () => ({
  subscribeToEvent: vi.fn(),
  publishEvent: vi.fn(),
}));

const { reachable, authorizeCalls } = vi.hoisted(() => ({
  reachable: new Set<string>(),
  authorizeCalls: [] as Array<{
    userId: string;
    projectId: string;
    apiKeyId?: string;
    apiKeyPermissions?: Record<string, string[]> | null;
  }>,
}));

// Mirrors authorizeProjectAccess: resolves when the user (with the key, if
// any) can reach the project, otherwise 404.
vi.mock("../../../apps/api/src/utils/project-access", async () => {
  const { HTTPException } = await import("hono/http-exception");
  return {
    taskProjectIds: async () => new Map(),
    authorizeProjectAccess: async (input: (typeof authorizeCalls)[number]) => {
      authorizeCalls.push(input);
      if (!reachable.has(`${input.userId}:${input.projectId}`)) {
        throw new HTTPException(404, { message: "Project not found" });
      }
      return { workspaceId: "workspace-1" };
    },
  };
});

import {
  addConnection,
  broadcastToUser,
  PROJECT_ACCESS_CHANGED,
  PROJECT_ACCESS_REVOKED_CLOSE_CODE,
  projectAccessEpoch,
  removeConnection,
} from "../../../apps/api/src/ws/index";

function makeFakeWs() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1,
    raw: undefined,
    url: null,
    protocol: null,
  } as unknown as Parameters<typeof addConnection>[1] & {
    close: ReturnType<typeof vi.fn>;
  };
}

const tracked: Array<{
  projectId: string;
  conn: ReturnType<typeof addConnection>;
}> = [];

function connect(
  projectId: string,
  userId: string,
  access?: Parameters<typeof addConnection>[4],
) {
  const ws = makeFakeWs();
  const conn = addConnection(projectId, ws, userId, userId, access);
  tracked.push({ projectId, conn });
  return ws;
}

afterEach(() => {
  for (const { projectId, conn } of tracked) {
    removeConnection(projectId, conn);
  }
  tracked.length = 0;
  reachable.clear();
  authorizeCalls.length = 0;
});

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("project access revocation", () => {
  it("closes only the sockets of projects the user can no longer reach", async () => {
    reachable.add("user-a:project-kept");
    reachable.add("user-b:project-lost");
    const kept = connect("project-kept", "user-a");
    const lost = connect("project-lost", "user-a");
    const colleague = connect("project-lost", "user-b");

    broadcastToUser("user-a", { type: PROJECT_ACCESS_CHANGED });
    await settle();

    expect(lost.close).toHaveBeenCalledWith(
      PROJECT_ACCESS_REVOKED_CLOSE_CODE,
      "Project access revoked",
    );
    expect(kept.close).not.toHaveBeenCalled();
    expect(colleague.close).not.toHaveBeenCalled();
  });

  it("rechecks with the API key the socket was opened with", async () => {
    reachable.add("user-a:project-1");
    connect("project-1", "user-a", {
      apiKeyId: "key-1",
      apiKeyPermissions: { task: ["read"] },
    });

    broadcastToUser("user-a", { type: PROJECT_ACCESS_CHANGED });
    await settle();

    expect(authorizeCalls).toEqual([
      {
        userId: "user-a",
        projectId: "project-1",
        apiKeyId: "key-1",
        apiKeyPermissions: { task: ["read"] },
      },
    ]);
  });

  it("rechecks a socket authorized before an access change it opened after", async () => {
    // Authorized during the upgrade, while the user could still reach it...
    const authorizedAt = projectAccessEpoch("user-a");
    // ...then removed from the project before the socket opened.
    broadcastToUser("user-a", { type: PROJECT_ACCESS_CHANGED });
    const socket = connect("project-1", "user-a", { epoch: authorizedAt });
    await settle();

    expect(socket.close).toHaveBeenCalledWith(
      PROJECT_ACCESS_REVOKED_CLOSE_CODE,
      "Project access revoked",
    );
  });

  it("does not recheck a socket opened with no access change since", async () => {
    const socket = connect("project-1", "user-a", {
      epoch: projectAccessEpoch("user-a"),
    });
    await settle();

    expect(authorizeCalls).toEqual([]);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it("leaves project sockets alone for other user messages", async () => {
    const socket = connect("project-lost", "user-a");

    broadcastToUser("user-a", { type: "NOTIFICATION_CREATED" });
    await settle();

    expect(socket.close).not.toHaveBeenCalled();
  });
});
