import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(async () => {
  await resetTestDatabase();
});

async function seedTask(projectId: string, number: number, status: string) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({ projectId, title: `Task ${number}`, status, number })
    .returning();
  return task;
}

async function statusOf(taskId: string) {
  const task = await db.query.taskTable.findFirst({
    where: eq(schema.taskTable.id, taskId),
  });
  return task?.status;
}

// A member's views let one bulk selection span projects, which is where a
// status can exist in one project and not another.
describe("bulk status changes across projects", () => {
  it("moves nothing when any selected project lacks the status", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(user);
    const { app } = createApp();

    // The server walks projects in the order their tasks come back from the
    // database, not the request's. Seeding both insertion orders makes one
    // run meet the project that has the status first, which is the case that
    // used to leave its tasks moved before the other project's 400.
    for (const hasStatusFirst of [true, false]) {
      const withQa = await createProjectFixture({ workspaceId: workspace.id });
      const withoutQa = await createProjectFixture({
        workspaceId: workspace.id,
      });
      await db.insert(schema.columnTable).values({
        projectId: withQa.project.id,
        name: "QA",
        slug: "qa",
        position: 4,
        isFinal: false,
      });

      const [first, second] = hasStatusFirst
        ? [withQa, withoutQa]
        : [withoutQa, withQa];
      const firstTask = await seedTask(first.project.id, 1, "to-do");
      const secondTask = await seedTask(second.project.id, 1, "to-do");

      const response = await app.request("/api/task/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskIds: [firstTask.id, secondTask.id],
          operation: "updateStatus",
          value: "qa",
        }),
      });

      expect(response.status).toBe(400);
      expect(await statusOf(firstTask.id)).toBe("to-do");
      expect(await statusOf(secondTask.id)).toBe("to-do");
    }
  });

  it("moves every task when all selected projects have the status", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const alpha = await createProjectFixture({ workspaceId: workspace.id });
    const beta = await createProjectFixture({ workspaceId: workspace.id });

    const alphaTask = await seedTask(alpha.project.id, 1, "to-do");
    const betaTask = await seedTask(beta.project.id, 1, "to-do");

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request("/api/task/bulk", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskIds: [alphaTask.id, betaTask.id],
        operation: "updateStatus",
        value: "in-progress",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ updatedCount: 2 });
    expect(await statusOf(alphaTask.id)).toBe("in-progress");
    expect(await statusOf(betaTask.id)).toBe("in-progress");

    // Each task is linked to its own project's column, not a shared one.
    const alphaRow = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, alphaTask.id),
    });
    const betaRow = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, betaTask.id),
    });
    expect(alphaRow?.columnId).toBe(alpha.columns.inProgress.id);
    expect(betaRow?.columnId).toBe(beta.columns.inProgress.id);
  });
});
