import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    resolveCalls: 0,
    authorizeCalls: [] as {
      userId: string;
      projectId: string;
      apiKeyId?: string;
      apiKeyPermissions?: Record<string, string[]> | null;
      notFoundMessage?: string;
    }[],
    caller: "anonymous" as
      | "anonymous"
      | "member"
      | "outsider"
      | "hidden"
      | "apiKey",
  },
}));

vi.mock("../../../apps/api/src/utils/authenticate-api-request", () => ({
  // Mirrors the real helper: every unauthenticated path throws, so it never
  // returns a falsy userId.
  resolveAssetBearerOrCookie: async () => {
    state.resolveCalls += 1;
    if (state.caller === "anonymous") {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    if (state.caller === "apiKey") {
      return {
        userId: "user-member",
        apiKeyId: "key-1",
        apiKeyPermissions: { task: ["read"] },
      };
    }
    return { userId: `user-${state.caller}` };
  },
}));

// Mirrors authorizeProjectAccess: 403 outside the workspace, 404 for a project
// in the workspace the caller cannot reach.
vi.mock("../../../apps/api/src/utils/project-access", () => ({
  authorizeProjectAccess: async (input: (typeof state.authorizeCalls)[0]) => {
    state.authorizeCalls.push(input);
    if (input.userId === "user-outsider") {
      throw new HTTPException(403, {
        message: "You don't have access to this workspace",
      });
    }
    if (input.userId === "user-hidden") {
      throw new HTTPException(404, { message: input.notFoundMessage });
    }
    return { workspaceId: "workspace-1" };
  },
}));

const { authorizeAssetAccess } = await import(
  "../../../apps/api/src/utils/authorize-asset-access"
);

const context = {} as Context;

async function statusOf(promise: Promise<void>) {
  try {
    await promise;
    return 200;
  } catch (error) {
    return error instanceof HTTPException ? error.status : 500;
  }
}

describe("authorizeAssetAccess", () => {
  beforeEach(() => {
    state.resolveCalls = 0;
    state.authorizeCalls = [];
    state.caller = "anonymous";
  });

  it("allows an anonymous caller to read an asset of a public project", async () => {
    const status = await statusOf(
      authorizeAssetAccess(context, {
        projectId: "project-1",
        isPublic: true,
      }),
    );

    expect(status).toBe(200);
    // The credential check must be skipped entirely: it throws for anonymous
    // callers, which is what made the public branch unreachable.
    expect(state.resolveCalls).toBe(0);
  });

  it("rejects an anonymous caller for a private asset", async () => {
    const status = await statusOf(
      authorizeAssetAccess(context, {
        projectId: "project-1",
        isPublic: false,
      }),
    );

    expect(status).toBe(401);
  });

  it("rejects an authenticated non-member for a private asset", async () => {
    state.caller = "outsider";

    const status = await statusOf(
      authorizeAssetAccess(context, {
        projectId: "project-1",
        isPublic: null,
      }),
    );

    expect(status).toBe(403);
  });

  it("allows a workspace member to read a private asset", async () => {
    state.caller = "member";

    const status = await statusOf(
      authorizeAssetAccess(context, {
        projectId: "project-1",
        isPublic: false,
      }),
    );

    expect(status).toBe(200);
    expect(state.authorizeCalls).toEqual([
      {
        userId: "user-member",
        projectId: "project-1",
        apiKeyId: undefined,
        apiKeyPermissions: undefined,
        notFoundMessage: "Asset not found",
      },
    ]);
  });

  it("hides a private asset of a project the member cannot reach", async () => {
    state.caller = "hidden";

    const status = await statusOf(
      authorizeAssetAccess(context, {
        projectId: "project-1",
        isPublic: false,
      }),
    );

    expect(status).toBe(404);
  });

  it("passes an API key's scopes to the project check", async () => {
    state.caller = "apiKey";

    await authorizeAssetAccess(context, {
      projectId: "project-1",
      isPublic: false,
    });

    expect(state.authorizeCalls).toEqual([
      {
        userId: "user-member",
        projectId: "project-1",
        apiKeyId: "key-1",
        apiKeyPermissions: { task: ["read"] },
        notFoundMessage: "Asset not found",
      },
    ]);
  });
});
