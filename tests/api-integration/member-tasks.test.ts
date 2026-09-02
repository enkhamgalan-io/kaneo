import { randomUUID } from "node:crypto";
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

const DAY = 24 * 60 * 60 * 1000;

async function addMemberToWorkspace(workspaceId: string, role = "member") {
  const userId = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name: "Assignee",
    })
    .returning();

  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role,
    joinedAt: new Date(),
  });

  return user;
}

async function seedTask(values: {
  projectId: string;
  userId?: string | null;
  title: string;
  status: string;
  number: number;
  dueDate?: Date | null;
}) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId: values.projectId,
      userId: values.userId ?? null,
      title: values.title,
      status: values.status,
      number: values.number,
      dueDate: values.dueDate ?? null,
    })
    .returning();
  return task;
}

describe("member tasks are grouped and summarized across the workspace", () => {
  it("reports every assigned task with its project and state", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const assignee = await addMemberToWorkspace(workspace.id);

    const alpha = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Alpha",
      slug: "alpha",
    });
    const beta = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Beta",
      slug: "beta",
    });

    // Beta is deliberately positioned before Alpha, so the ordering assertion
    // below fails if projects come back in creation or id order instead of the
    // workspace's own project order.
    await db
      .update(schema.projectTable)
      .set({ position: 1 })
      .where(eq(schema.projectTable.id, alpha.project.id));
    await db
      .update(schema.projectTable)
      .set({ position: 0 })
      .where(eq(schema.projectTable.id, beta.project.id));

    await seedTask({
      projectId: alpha.project.id,
      userId: assignee.id,
      title: "Alpha open",
      status: "in-progress",
      number: 1,
    });
    await seedTask({
      projectId: alpha.project.id,
      userId: assignee.id,
      title: "Alpha overdue",
      status: "to-do",
      number: 2,
      dueDate: new Date(Date.now() - DAY),
    });
    await seedTask({
      projectId: alpha.project.id,
      userId: assignee.id,
      title: "Alpha done",
      status: "done",
      number: 3,
    });
    await seedTask({
      projectId: beta.project.id,
      userId: assignee.id,
      title: "Beta backlog",
      status: "planned",
      number: 1,
    });
    await seedTask({
      projectId: beta.project.id,
      userId: assignee.id,
      title: "Beta archived",
      status: "archived",
      number: 2,
    });

    // Belongs to someone else and must not leak into the member's totals.
    await seedTask({
      projectId: beta.project.id,
      userId: owner.id,
      title: "Not theirs",
      status: "to-do",
      number: 3,
    });
    // Unassigned.
    await seedTask({
      projectId: beta.project.id,
      title: "Nobody's",
      status: "to-do",
      number: 4,
    });

    mockAuthenticatedSession(owner);
    const { app } = createApp();

    const response = await app.request(
      `/api/workspace/${workspace.id}/members/${assignee.id}/tasks`,
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.member.userId).toBe(assignee.id);
    expect(body.summary).toMatchObject({
      total: 5,
      open: 2,
      overdue: 1,
      done: 1,
      backlog: 1,
      archived: 1,
      projectCount: 2,
    });

    // The exclusive buckets must account for every task.
    const { open, done, backlog, archived, total } = body.summary;
    expect(open + done + backlog + archived).toBe(total);

    const projectNames = body.projects.map(
      (project: { name: string }) => project.name,
    );
    expect(projectNames).toEqual(["Beta", "Alpha"]);

    const alphaResult = body.projects.find(
      (project: { name: string }) => project.name === "Alpha",
    );
    expect(alphaResult.counts).toMatchObject({
      total: 3,
      open: 2,
      overdue: 1,
      done: 1,
    });
    expect(
      alphaResult.tasks.map((task: { title: string }) => task.title),
    ).toContain("Alpha overdue");

    const overdueTask = alphaResult.tasks.find(
      (task: { title: string }) => task.title === "Alpha overdue",
    );
    expect(overdueTask.isOverdue).toBe(true);
    expect(overdueTask.isCompleted).toBe(false);

    const doneTask = alphaResult.tasks.find(
      (task: { title: string }) => task.title === "Alpha done",
    );
    expect(doneTask.isCompleted).toBe(true);
    expect(doneTask.statusName).toBe("Done");

    const betaResult = body.projects.find(
      (project: { name: string }) => project.name === "Beta",
    );
    const backlogTask = betaResult.tasks.find(
      (task: { title: string }) => task.title === "Beta backlog",
    );
    // `planned` has no column row, so the name is derived from the slug.
    expect(backlogTask.statusName).toBe("Planned");
  });

  it("derives completion from the column's isFinal flag, not the slug", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const assignee = await addMemberToWorkspace(workspace.id);
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    await db.insert(schema.columnTable).values({
      projectId: project.id,
      name: "Shipped",
      slug: "shipped",
      position: 4,
      isFinal: true,
    });

    await seedTask({
      projectId: project.id,
      userId: assignee.id,
      title: "Shipped work",
      status: "shipped",
      number: 1,
      // A past due date on a finished task must not count as overdue.
      dueDate: new Date(Date.now() - DAY),
    });

    mockAuthenticatedSession(owner);
    const { app } = createApp();

    const response = await app.request(
      `/api/workspace/${workspace.id}/members/${assignee.id}/tasks`,
    );
    const body = await response.json();

    expect(body.summary).toMatchObject({
      total: 1,
      done: 1,
      open: 0,
      overdue: 0,
    });
    expect(body.projects[0].tasks[0].statusName).toBe("Shipped");
    expect(body.projects[0].tasks[0].isCompleted).toBe(true);
  });

  it("includes tasks from archived projects and flags them", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const assignee = await addMemberToWorkspace(workspace.id);
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
      name: "Retired",
    });

    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, project.id));

    await seedTask({
      projectId: project.id,
      userId: assignee.id,
      title: "Left over",
      status: "to-do",
      number: 1,
    });

    mockAuthenticatedSession(owner);
    const { app } = createApp();

    const response = await app.request(
      `/api/workspace/${workspace.id}/members/${assignee.id}/tasks`,
    );
    const body = await response.json();

    expect(body.summary.total).toBe(1);
    expect(body.projects[0].isArchived).toBe(true);
  });
});

describe("member task endpoints are workspace scoped", () => {
  it("returns 404 for a user who belongs to a different workspace", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const other = await createWorkspaceMember({ role: "owner" });

    mockAuthenticatedSession(owner);
    const { app } = createApp();

    const response = await app.request(
      `/api/workspace/${workspace.id}/members/${other.user.id}/tasks`,
    );

    expect(response.status).toBe(404);
  });

  it("refuses a caller who is not a member of the workspace", async () => {
    const outsider = await createWorkspaceMember({ role: "owner" });
    const target = await createWorkspaceMember({ role: "owner" });

    mockAuthenticatedSession(outsider.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/workspace/${target.workspace.id}/members/${target.user.id}/tasks`,
    );

    expect(response.status).toBe(403);
  });

  it("refuses a role whose permissions do not include task read", async () => {
    const { user, workspace } = await createWorkspaceMember({
      role: "restricted",
    });

    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: workspace.id,
      role: "restricted",
      permission: JSON.stringify({ project: ["read"] }),
    });

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const tasksResponse = await app.request(
      `/api/workspace/${workspace.id}/members/${user.id}/tasks`,
    );
    expect(tasksResponse.status).toBe(403);

    const countsResponse = await app.request(
      `/api/workspace/${workspace.id}/members/task-counts`,
    );
    expect(countsResponse.status).toBe(403);
  });

  it("lets a viewer read member tasks", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "viewer" });

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request(
      `/api/workspace/${workspace.id}/members/${user.id}/tasks`,
    );

    expect(response.status).toBe(200);
  });
});

describe("member task counts", () => {
  it("counts open and overdue tasks per member, scoped to the workspace", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const assignee = await addMemberToWorkspace(workspace.id);
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    await seedTask({
      projectId: project.id,
      userId: assignee.id,
      title: "Open",
      status: "to-do",
      number: 1,
    });
    await seedTask({
      projectId: project.id,
      userId: assignee.id,
      title: "Overdue",
      status: "in-progress",
      number: 2,
      dueDate: new Date(Date.now() - DAY),
    });
    // Neither of these is open work.
    await seedTask({
      projectId: project.id,
      userId: assignee.id,
      title: "Finished",
      status: "done",
      number: 3,
    });
    await seedTask({
      projectId: project.id,
      userId: assignee.id,
      title: "Backlog",
      status: "planned",
      number: 4,
    });
    await seedTask({
      projectId: project.id,
      userId: owner.id,
      title: "Owner open",
      status: "to-do",
      number: 5,
    });

    mockAuthenticatedSession(owner);
    const { app } = createApp();

    const response = await app.request(
      `/api/workspace/${workspace.id}/members/task-counts`,
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    const assigneeCounts = body.find(
      (row: { userId: string }) => row.userId === assignee.id,
    );
    expect(assigneeCounts).toMatchObject({ openCount: 2, overdueCount: 1 });

    const ownerCounts = body.find(
      (row: { userId: string }) => row.userId === owner.id,
    );
    expect(ownerCounts).toMatchObject({ openCount: 1, overdueCount: 0 });
  });
});
