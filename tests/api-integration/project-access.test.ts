import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import createNotification from "../../apps/api/src/notification/controllers/create-notification";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  addProjectMember,
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(async () => {
  await resetTestDatabase();
});

async function addUser(workspaceId: string, role: string, name = role) {
  const userId = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name,
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

async function seedTask(projectId: string, title: string, userId?: string) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title,
      status: "to-do",
      number: Math.floor(Math.random() * 100000),
      userId: userId ?? null,
    })
    .returning();
  return task;
}

// An owner, an admin, a member and a viewer; the member belongs to "Mine"
// only, and nobody but the owner was added to "Hidden".
async function seedWorkspace() {
  const { user: owner, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Owner",
  });
  const admin = await addUser(workspace.id, "admin", "Admin");
  const member = await addUser(workspace.id, "member", "Member");
  const viewer = await addUser(workspace.id, "viewer", "Viewer");

  const { project: mine } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Mine",
    slug: "mine",
    members: [owner.id, member.id],
  });
  const { project: hidden } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Hidden",
    slug: "hidden",
    members: [owner.id],
  });

  const { app } = createApp();
  return { app, workspace, owner, admin, member, viewer, mine, hidden };
}

async function listProjectNames(
  app: ReturnType<typeof createApp>["app"],
  workspaceId: string,
) {
  const res = await app.request(`/api/project?workspaceId=${workspaceId}`);
  expect(res.status).toBe(200);
  const projects = (await res.json()) as Array<{ name: string }>;
  return projects.map((project) => project.name).sort();
}

describe("project access", () => {
  it("lists only a member's own projects, and every project for admins and owners", async () => {
    const { app, workspace, owner, admin, member, viewer } =
      await seedWorkspace();

    mockAuthenticatedSession(member);
    expect(await listProjectNames(app, workspace.id)).toEqual(["Mine"]);

    mockAuthenticatedSession(viewer);
    expect(await listProjectNames(app, workspace.id)).toEqual([]);

    mockAuthenticatedSession(admin);
    expect(await listProjectNames(app, workspace.id)).toEqual([
      "Hidden",
      "Mine",
    ]);

    mockAuthenticatedSession(owner);
    expect(await listProjectNames(app, workspace.id)).toEqual([
      "Hidden",
      "Mine",
    ]);
  });

  it("answers a hidden project and its tasks like missing ones", async () => {
    const { app, member, mine, hidden } = await seedWorkspace();
    const hiddenTask = await seedTask(hidden.id, "Secret");
    const ownTask = await seedTask(mine.id, "Visible");

    mockAuthenticatedSession(member);

    const hiddenProject = await app.request(`/api/project/${hidden.id}`);
    const missingProject = await app.request("/api/project/no-such-project");
    expect(hiddenProject.status).toBe(404);
    expect(missingProject.status).toBe(404);
    expect(await hiddenProject.text()).toBe(await missingProject.text());

    const hiddenTaskRes = await app.request(`/api/task/${hiddenTask.id}`);
    const missingTaskRes = await app.request("/api/task/no-such-task");
    expect(hiddenTaskRes.status).toBe(404);
    expect(missingTaskRes.status).toBe(404);
    expect(await hiddenTaskRes.text()).toBe(await missingTaskRes.text());

    const board = await app.request(`/api/task/tasks/${hidden.id}`);
    expect(board.status).toBe(404);

    expect((await app.request(`/api/task/${ownTask.id}`)).status).toBe(200);
  });

  it("refuses writes to a hidden project's tasks", async () => {
    const { app, member, hidden } = await seedWorkspace();
    const hiddenTask = await seedTask(hidden.id, "Secret");

    mockAuthenticatedSession(member);

    const create = await app.request(`/api/task/${hidden.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Sneaky",
        description: "",
        priority: "low",
        status: "to-do",
      }),
    });
    expect(create.status).toBe(404);

    const rename = await app.request(`/api/task/title/${hiddenTask.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed" }),
    });
    expect(rename.status).toBe(404);

    const [unchanged] = await db
      .select({ title: schema.taskTable.title })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, hiddenTask.id));
    expect(unchanged?.title).toBe("Secret");
  });

  it("adds a member who creates a project to it", async () => {
    const { app, workspace, member } = await seedWorkspace();

    mockAuthenticatedSession(member);
    const res = await app.request("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Created",
        workspaceId: workspace.id,
        icon: "Folder",
        slug: "created",
      }),
    });
    expect(res.status).toBe(200);
    const created = (await res.json()) as { id: string };

    expect(await listProjectNames(app, workspace.id)).toEqual([
      "Created",
      "Mine",
    ]);

    const members = await app.request(`/api/project/${created.id}/members`);
    expect(members.status).toBe(200);
    const list = (await members.json()) as Array<{
      id: string;
      access: string;
    }>;
    expect(list).toContainEqual(
      expect.objectContaining({ id: member.id, access: "member" }),
    );
  });

  it("lets admins add and remove project members, and not members", async () => {
    const { app, workspace, admin, member, viewer, mine, hidden } =
      await seedWorkspace();

    mockAuthenticatedSession(member);
    const refused = await app.request(`/api/project/${mine.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: viewer.id }),
    });
    expect(refused.status).toBe(403);

    mockAuthenticatedSession(admin);
    const added = await app.request(`/api/project/${hidden.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: viewer.id }),
    });
    expect(added.status).toBe(200);
    const afterAdd = (await added.json()) as Array<{
      id: string;
      access: string;
    }>;
    expect(afterAdd).toContainEqual(
      expect.objectContaining({ id: viewer.id, access: "member" }),
    );
    // Admins reach every project through their role.
    expect(afterAdd).toContainEqual(
      expect.objectContaining({ id: admin.id, access: "all" }),
    );

    mockAuthenticatedSession(viewer);
    expect(await listProjectNames(app, workspace.id)).toEqual(["Hidden"]);

    mockAuthenticatedSession(admin);
    const removed = await app.request(
      `/api/project/${hidden.id}/members/${viewer.id}`,
      { method: "DELETE" },
    );
    expect(removed.status).toBe(200);

    mockAuthenticatedSession(viewer);
    expect(await listProjectNames(app, workspace.id)).toEqual([]);
    expect((await app.request(`/api/project/${hidden.id}`)).status).toBe(404);

    mockAuthenticatedSession(admin);
    const outsider = await createWorkspaceMember();
    const foreign = await app.request(`/api/project/${hidden.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: outsider.user.id }),
    });
    expect(foreign.status).toBe(404);
  });

  it("assigns tasks only to people who can reach the project", async () => {
    const { app, admin, member, viewer, mine } = await seedWorkspace();

    mockAuthenticatedSession(admin);
    const create = (userId: string) =>
      app.request(`/api/task/${mine.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Assigned",
          description: "",
          priority: "low",
          status: "to-do",
          userId,
        }),
      });

    const toViewer = await create(viewer.id);
    expect(toViewer.status).toBe(403);
    expect(await toViewer.text()).toContain(
      "Assignee is not a member of this project",
    );

    expect((await create(member.id)).status).toBe(200);
    // Admins can be assigned anywhere: their role reaches every project.
    expect((await create(admin.id)).status).toBe(200);
  });

  it("keeps hidden projects out of search, labels and a colleague's tasks", async () => {
    const { app, workspace, owner, member, mine, hidden } =
      await seedWorkspace();
    await seedTask(mine.id, "Needle visible", owner.id);
    const secret = await seedTask(hidden.id, "Needle secret", owner.id);
    await db.insert(schema.labelTable).values([
      { name: "Shared", color: "#000000", workspaceId: workspace.id },
      {
        name: "Secret label",
        color: "#000000",
        workspaceId: workspace.id,
        taskId: secret.id,
      },
    ]);

    mockAuthenticatedSession(member);

    const search = await app.request(
      `/api/search?q=Needle&type=tasks&workspaceId=${workspace.id}`,
    );
    expect(search.status).toBe(200);
    const { results } = (await search.json()) as {
      results: Array<{ title: string }>;
    };
    expect(results.map((result) => result.title)).toEqual(["Needle visible"]);

    const labels = await app.request(`/api/label/workspace/${workspace.id}`);
    expect(labels.status).toBe(200);
    const labelNames = ((await labels.json()) as Array<{ name: string }>).map(
      (label) => label.name,
    );
    expect(labelNames).toEqual(["Shared"]);

    const tasks = await app.request(
      `/api/workspace/${workspace.id}/members/${owner.id}/tasks`,
    );
    expect(tasks.status).toBe(200);
    const body = (await tasks.json()) as {
      summary: { total: number };
      projects: Array<{ name: string }>;
    };
    expect(body.summary.total).toBe(1);
    expect(body.projects.map((project) => project.name)).toEqual(["Mine"]);
  });

  it("lets a custom role reach every project with project:access_all", async () => {
    const { app, workspace } = await seedWorkspace();
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: workspace.id,
      role: "lead",
      permission: JSON.stringify({
        project: ["read", "access_all"],
        task: ["read"],
        workspace: ["read"],
      }),
    });
    const lead = await addUser(workspace.id, "lead", "Lead");

    mockAuthenticatedSession(lead);
    expect(await listProjectNames(app, workspace.id)).toEqual([
      "Hidden",
      "Mine",
    ]);
  });

  it("does not notify someone about a task they cannot open", async () => {
    const { app, member, hidden, mine } = await seedWorkspace();
    const secret = await seedTask(hidden.id, "Secret");
    const visible = await seedTask(mine.id, "Visible");

    const blocked = await createNotification({
      userId: member.id,
      type: "task_mention",
      resourceId: secret.id,
      resourceType: "task",
    });
    expect(blocked).toBeNull();

    const delivered = await createNotification({
      userId: member.id,
      type: "task_mention",
      resourceId: visible.id,
      resourceType: "task",
    });
    expect(delivered).not.toBeNull();

    mockAuthenticatedSession(member);
    const manual = await app.request("/api/notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Probe",
        message: "Probe",
        type: "info",
        relatedEntityId: secret.id,
        relatedEntityType: "task",
      }),
    });
    expect(manual.status).toBe(404);
  });
});

describe("project access: hidden records look like missing ones", () => {
  it("answers a hidden move destination like a missing one", async () => {
    const { app, member, mine, hidden } = await seedWorkspace();
    const ownTask = await seedTask(mine.id, "Mine");

    mockAuthenticatedSession(member);
    const move = (destinationProjectId: string) =>
      app.request(`/api/task/move/${ownTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationProjectId }),
      });

    const toHidden = await move(hidden.id);
    const toMissing = await move("no-such-project");
    expect(toHidden.status).toBe(404);
    expect(toMissing.status).toBe(404);
    expect(await toHidden.text()).toBe(await toMissing.text());
  });

  it("answers a bulk change naming a hidden task like one naming a missing task", async () => {
    const { app, member, mine, hidden } = await seedWorkspace();
    const ownTask = await seedTask(mine.id, "Mine");
    const secret = await seedTask(hidden.id, "Secret");

    mockAuthenticatedSession(member);
    const bulk = (taskIds: string[]) =>
      app.request("/api/task/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskIds,
          operation: "updatePriority",
          value: "high",
        }),
      });

    const withHidden = await bulk([ownTask.id, secret.id]);
    const withMissing = await bulk([ownTask.id, "no-such-task"]);
    expect(withHidden.status).toBe(404);
    expect(withMissing.status).toBe(404);
    expect(await withHidden.text()).toBe(await withMissing.text());

    const [untouched] = await db
      .select({ priority: schema.taskTable.priority })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, ownTask.id));
    expect(untouched?.priority).not.toBe("high");
  });

  it("answers a reorder naming a hidden project like one naming a missing project", async () => {
    const { app, workspace, mine, hidden } = await seedWorkspace();
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: workspace.id,
      role: "editor",
      permission: JSON.stringify({
        project: ["read", "update"],
        workspace: ["read"],
      }),
    });
    const editor = await addUser(workspace.id, "editor", "Editor");
    await addProjectMember(workspace.id, mine.id, editor.id);

    mockAuthenticatedSession(editor);
    const reorder = (id: string) =>
      app.request(`/api/project/reorder?workspaceId=${workspace.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projects: [
            { id: mine.id, position: 0 },
            { id, position: 1 },
          ],
        }),
      });

    const withHidden = await reorder(hidden.id);
    const withMissing = await reorder("no-such-project");
    expect(withHidden.status).toBe(withMissing.status);
    expect((await withHidden.text()).replace(hidden.id, "ID")).toBe(
      (await withMissing.text()).replace("no-such-project", "ID"),
    );
  });
});

describe("project access: changes that reach other projects", () => {
  it("keeps members who cannot open every project from renaming or deleting workspace labels", async () => {
    const { app, workspace, admin, member, hidden } = await seedWorkspace();
    const secret = await seedTask(hidden.id, "Secret");
    const [workspaceLabel] = await db
      .insert(schema.labelTable)
      .values({ name: "bug", color: "#000000", workspaceId: workspace.id })
      .returning();
    await db.insert(schema.labelTable).values({
      name: "bug",
      color: "#000000",
      workspaceId: workspace.id,
      taskId: secret.id,
    });

    mockAuthenticatedSession(member);
    const rename = await app.request(`/api/label/${workspaceLabel?.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "renamed", color: "#ffffff" }),
    });
    const remove = await app.request(`/api/label/${workspaceLabel?.id}`, {
      method: "DELETE",
    });
    expect(rename.status).toBe(403);
    expect(remove.status).toBe(403);

    const onSecretTask = await db
      .select({ name: schema.labelTable.name })
      .from(schema.labelTable)
      .where(eq(schema.labelTable.taskId, secret.id));
    expect(onSecretTask).toEqual([{ name: "bug" }]);

    mockAuthenticatedSession(admin);
    const adminRename = await app.request(`/api/label/${workspaceLabel?.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "renamed", color: "#ffffff" }),
    });
    expect(adminRename.status).toBe(200);
  });

  it("shows a move from a hidden project without naming it", async () => {
    const { app, owner, member, mine, hidden } = await seedWorkspace();
    const task = await seedTask(hidden.id, "Moved");

    mockAuthenticatedSession(owner);
    const moved = await app.request(`/api/task/move/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationProjectId: mine.id }),
    });
    expect(moved.status).toBe(200);

    const findMove = async () => {
      const res = await app.request(`/api/activity/${task.id}`);
      expect(res.status).toBe(200);
      const activities = (await res.json()) as Array<{
        type: string;
        eventData: Record<string, unknown> | null;
      }>;
      return activities.find((activity) => activity.type === "moved");
    };

    await vi.waitFor(async () => {
      expect(await findMove()).toBeDefined();
    });
    expect((await findMove())?.eventData).toMatchObject({
      fromProjectName: "Hidden",
      toProjectName: "Mine",
    });

    mockAuthenticatedSession(member);
    expect((await findMove())?.eventData).toMatchObject({
      fromProjectId: null,
      fromProjectName: null,
      toProjectName: "Mine",
    });
  });

  it("drops a notification rule's project the user lost access to instead of refusing to save", async () => {
    const { app, workspace, member, mine, hidden } = await seedWorkspace();
    const [rule] = await db
      .insert(schema.userNotificationWorkspaceRuleTable)
      .values({
        userId: member.id,
        workspaceId: workspace.id,
        projectMode: "selected",
      })
      .returning();
    const ruleId = rule?.id ?? "";
    await db.insert(schema.userNotificationWorkspaceProjectTable).values([
      {
        workspaceId: workspace.id,
        workspaceRuleId: ruleId,
        projectId: mine.id,
      },
      {
        workspaceId: workspace.id,
        workspaceRuleId: ruleId,
        projectId: hidden.id,
      },
    ]);

    mockAuthenticatedSession(member);
    const before = await app.request("/api/notification-preferences");
    expect(before.status).toBe(200);
    const listed = (await before.json()) as {
      workspaces: Array<{ selectedProjectIds: string[] }>;
    };
    expect(listed.workspaces[0]?.selectedProjectIds).toEqual([mine.id]);

    const save = (selectedProjectIds: string[]) =>
      app.request(`/api/notification-preferences/workspaces/${workspace.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: false,
          emailEnabled: false,
          ntfyEnabled: false,
          gotifyEnabled: false,
          webhookEnabled: false,
          projectMode: "selected",
          selectedProjectIds,
        }),
      });

    // A client that still sends the hidden project it had selected can save.
    expect((await save([mine.id, hidden.id])).status).toBe(200);
    const stored = await db
      .select({
        projectId: schema.userNotificationWorkspaceProjectTable.projectId,
      })
      .from(schema.userNotificationWorkspaceProjectTable)
      .where(
        eq(
          schema.userNotificationWorkspaceProjectTable.workspaceRuleId,
          ruleId,
        ),
      );
    expect(stored).toEqual([{ projectId: mine.id }]);

    // Adding a hidden project anew is refused like a missing one.
    const added = await save([mine.id, hidden.id]);
    const missing = await save([mine.id, "no-such-project"]);
    expect(added.status).toBe(400);
    expect(await added.text()).toBe(await missing.text());
  });
});

// Runs the shipped migration rather than a copy of its SQL, so the test covers
// the artifact that reaches an upgraded installation.
async function runBackfillMigration() {
  const file = new URL(
    "../../apps/api/drizzle/0046_backfill_project_members.sql",
    import.meta.url,
  );
  const statements = readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}

describe("project access migration", () => {
  it("makes task assignees members, patches admin roles, and is safe to re-run", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const assignee = await addUser(workspace.id, "member");
    const idle = await addUser(workspace.id, "viewer");
    const departed = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
      members: [],
    });
    await seedTask(project.id, "Assigned", assignee.id);
    await seedTask(project.id, "Also assigned", assignee.id);
    // Assigned in this workspace but no longer a member of it.
    await seedTask(project.id, "Left behind", departed.user.id);
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: workspace.id,
      role: "admin",
      permission: JSON.stringify({
        project: ["create", "read", "update"],
        workspace: ["read"],
      }),
    });

    await runBackfillMigration();
    await runBackfillMigration();

    const members = await db
      .select({ userId: schema.projectMemberTable.userId })
      .from(schema.projectMemberTable)
      .where(eq(schema.projectMemberTable.projectId, project.id));
    expect(members.map((row) => row.userId)).toEqual([assignee.id]);
    expect(members.map((row) => row.userId)).not.toContain(idle.id);
    expect(members.map((row) => row.userId)).not.toContain(owner.id);

    const [adminRole] = await db
      .select({ permission: schema.workspaceRoleTable.permission })
      .from(schema.workspaceRoleTable)
      .where(
        and(
          eq(schema.workspaceRoleTable.workspaceId, workspace.id),
          eq(schema.workspaceRoleTable.role, "admin"),
        ),
      );
    const permission = JSON.parse(adminRole?.permission ?? "{}") as {
      project: string[];
    };
    expect(permission.project).toEqual([
      "create",
      "read",
      "update",
      "access_all",
    ]);
  });
});
