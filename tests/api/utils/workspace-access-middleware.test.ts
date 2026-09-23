import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    lookedUpIds: [] as string[],
    checkedProjectIds: [] as string[][],
  },
}));

// Tasks and projects by id. The mocked database answers every lookup with the
// same row shape; a project lookup only reads `workspaceId`.
const RECORDS: Record<string, { workspaceId: string; projectId: string }> = {
  "task-in-my-workspace": {
    workspaceId: "workspace-mine",
    projectId: "project-mine",
  },
  "task-in-hidden-project": {
    workspaceId: "workspace-mine",
    projectId: "project-hidden",
  },
  "task-in-other-workspace": {
    workspaceId: "workspace-theirs",
    projectId: "project-theirs",
  },
  "project-mine": { workspaceId: "workspace-mine", projectId: "project-mine" },
  "project-hidden": {
    workspaceId: "workspace-mine",
    projectId: "project-hidden",
  },
  "project-theirs": {
    workspaceId: "workspace-theirs",
    projectId: "project-theirs",
  },
};

vi.mock("../../../apps/api/src/database", async () => {
  const schema = await import("../../../apps/api/src/database/schema");
  const { PgDialect } = await import("drizzle-orm/pg-core");

  // `sqlToQuery` is the dialect method drizzle's own `.toSQL()` is built on, so
  // the bound parameters come back through a supported surface rather than by
  // reaching into the condition object's internals.
  const dialect = new PgDialect();
  let boundId: string | undefined;

  const chain = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    where: (condition: Parameters<typeof dialect.sqlToQuery>[0]) => {
      // Each lookup filters on a single id; joins contribute no parameters
      // because they compare two columns.
      const [id] = dialect.sqlToQuery(condition).params;
      boundId = typeof id === "string" ? id : undefined;
      return chain;
    },
    limit: async () => {
      if (!boundId) {
        return [];
      }
      state.lookedUpIds.push(boundId);
      const record = RECORDS[boundId];
      return record ? [record] : [];
    },
  };

  return { default: chain, schema };
});

vi.mock("../../../apps/api/src/utils/validate-workspace-access", async () => {
  const { HTTPException } = await import("hono/http-exception");
  return {
    validateWorkspaceAccess: async (_userId: string, workspaceId: string) => {
      if (workspaceId !== "workspace-mine") {
        throw new HTTPException(403, {
          message: "You don't have access to this workspace",
        });
      }
    },
  };
});

// The caller is a member of project-mine only.
vi.mock("../../../apps/api/src/utils/project-access", async () => {
  const { HTTPException } = await import("hono/http-exception");
  return {
    assertProjectAccess: async (
      _c: unknown,
      projectIds: string[],
      notFoundMessage: string,
    ) => {
      state.checkedProjectIds.push(projectIds);
      if (projectIds.some((projectId) => projectId !== "project-mine")) {
        throw new HTTPException(404, { message: notFoundMessage });
      }
    },
  };
});

const { workspaceAccess } = await import(
  "../../../apps/api/src/utils/workspace-access-middleware"
);

// /comment mirrors POST /api/activity/comment: there is no `taskId` path
// param, the id travels in the JSON body, and the handler acts on that body
// value. /move mirrors PUT /api/task/move/:id, which also acts on a second
// record named in the body.
function buildApp() {
  return new Hono()
    .use("*", async (c, next) => {
      c.set("userId", "user-1");
      return next();
    })
    .post("/comment", workspaceAccess.fromTaskId(), async (c) => {
      const body = (await c.req.json()) as { taskId: string };
      return c.json({ actedOn: body.taskId });
    })
    .post(
      "/move/:id",
      workspaceAccess.fromTask("id", {
        also: [{ key: "destinationProjectId", resource: "project" }],
      }),
      async (c) => c.json({ ok: true }),
    );
}

function post(path: string, body: Record<string, unknown>) {
  return buildApp().request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("workspaceAccess lookup sources", () => {
  beforeEach(() => {
    state.lookedUpIds.length = 0;
    state.checkedProjectIds.length = 0;
  });

  it("authorizes against the body id the handler will act on", async () => {
    const res = await post("/comment", { taskId: "task-in-my-workspace" });

    expect(res.status).toBe(200);
    expect(state.lookedUpIds).toEqual(["task-in-my-workspace"]);
    expect(state.checkedProjectIds).toEqual([["project-mine"]]);
  });

  it("rejects a body id in a workspace the caller cannot access", async () => {
    const res = await post("/comment", { taskId: "task-in-other-workspace" });

    expect(res.status).toBe(403);
    expect(state.lookedUpIds).toEqual(["task-in-other-workspace"]);
  });

  it("does not let a query id override the body id the handler acts on", async () => {
    const res = await post("/comment?taskId=task-in-my-workspace", {
      taskId: "task-in-other-workspace",
    });

    expect(state.lookedUpIds).toEqual(["task-in-other-workspace"]);
    expect(res.status).toBe(403);
  });
});

describe("workspaceAccess project checks", () => {
  beforeEach(() => {
    state.lookedUpIds.length = 0;
    state.checkedProjectIds.length = 0;
  });

  it("answers a task in a project the caller cannot reach like a missing one", async () => {
    const hidden = await post("/comment", {
      taskId: "task-in-hidden-project",
    });
    const missing = await post("/comment", { taskId: "no-such-task" });

    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await hidden.text()).toBe(await missing.text());
  });

  it("never falls back to ?workspaceId= for an id that matches nothing", async () => {
    const res = await post("/comment?workspaceId=workspace-mine", {
      taskId: "no-such-task",
    });

    expect(res.status).toBe(404);
    expect(state.checkedProjectIds).toEqual([]);
  });

  it("refuses a task-scoped route with no id instead of checking the workspace", async () => {
    const res = await post("/comment?workspaceId=workspace-mine", {});

    expect(res.status).toBe(400);
    expect(state.checkedProjectIds).toEqual([]);
  });

  it("checks the second record's project along with the first", async () => {
    const allowed = await post("/move/task-in-my-workspace", {
      destinationProjectId: "project-mine",
    });
    expect(allowed.status).toBe(200);

    const hidden = await post("/move/task-in-my-workspace", {
      destinationProjectId: "project-hidden",
    });
    expect(hidden.status).toBe(404);
    // Each record is checked on its own, with its own not-found message.
    expect(state.checkedProjectIds).toEqual([
      ["project-mine"],
      ["project-mine"],
      ["project-mine"],
      ["project-hidden"],
    ]);
  });

  it("rejects a second record in another workspace", async () => {
    const res = await post("/move/task-in-my-workspace", {
      destinationProjectId: "project-theirs",
    });

    expect(res.status).toBe(400);
    expect(state.checkedProjectIds).toEqual([]);
  });

  it("requires the second record when the route acts on it", async () => {
    const res = await post("/move/task-in-my-workspace", {});

    expect(res.status).toBe(400);
  });
});
