import { PROJECT_ACCESS_ALL } from "@kaneo/permissions";
import {
  and,
  type Column,
  eq,
  exists,
  inArray,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { publishEvent } from "../events";
import {
  hasWorkspacePermission,
  userHasWorkspacePermission,
  usersWithWorkspacePermission,
} from "./require-workspace-permission";
import { validateWorkspaceAccess } from "./validate-workspace-access";

/**
 * Project-level access. The workspace stays the outer boundary; inside it a
 * user reaches a project if their role grants project:access_all (Owner and
 * Admin by default, instance admins always) or they have a project_member
 * row. Every check here runs after the workspace check, so a membership row
 * left behind in a workspace the user has left grants nothing.
 */

export type ProjectScope = { all: true } | { all: false; userId: string };

const ACCESS_ALL_VAR = "canAccessAllProjects";

// Memoized per request: several checks in one request ask the same question.
export async function canAccessAllProjects(c: Context): Promise<boolean> {
  const cached = c.get(ACCESS_ALL_VAR);
  if (typeof cached === "boolean") return cached;
  const allowed = await hasWorkspacePermission(c, PROJECT_ACCESS_ALL);
  c.set(ACCESS_ALL_VAR, allowed);
  return allowed;
}

// What a workspace-wide listing may show the caller. Always the caller: a
// listing about someone else (a member's tasks) is still limited to the
// projects the person asking can see.
export async function getProjectScope(c: Context): Promise<ProjectScope> {
  if (await canAccessAllProjects(c)) return { all: true };
  return { all: false, userId: c.get("userId") as string };
}

// getProjectScope for code that runs outside a route's middleware and asks
// about a user rather than a request (their own notification rules, say).
export async function userProjectScope(
  userId: string,
  workspaceId: string,
): Promise<ProjectScope> {
  const all = await userHasWorkspacePermission({
    userId,
    workspaceId,
    permissions: PROJECT_ACCESS_ALL,
  });
  return all ? { all: true } : { all: false, userId };
}

/**
 * A where-clause fragment limiting rows to projects visible in `scope`, or
 * undefined (no restriction) for a caller who can see every project; drizzle's
 * and() drops undefined. A correlated EXISTS on the unique (project, user)
 * index, so it never duplicates rows under a join or GROUP BY and costs the
 * same whatever the number of projects.
 */
export function visibleProjectFilter(
  scope: ProjectScope,
  projectIdColumn: Column | SQL,
): SQL | undefined {
  if (scope.all) return undefined;
  return exists(
    db
      .select({ one: sql`1` })
      .from(schema.projectMemberTable)
      .where(
        and(
          eq(schema.projectMemberTable.projectId, projectIdColumn),
          eq(schema.projectMemberTable.userId, scope.userId),
        ),
      ),
  );
}

/**
 * For changes that cascade into every project, such as renaming or deleting a
 * workspace label, which rewrites its copies on tasks everywhere. Runs after
 * workspaceAccess; a record with no project (projectIds empty) needs
 * project:access_all. The answer depends only on the caller's role, so it
 * says nothing about which projects the change would reach.
 */
export function requireAccessAllForWorkspaceRecords(message: string) {
  return async (c: Context, next: Next) => {
    const projectIds = (c.get("projectIds") as string[] | undefined) ?? [];
    if (projectIds.length === 0 && !(await canAccessAllProjects(c))) {
      throw new HTTPException(403, { message });
    }
    return next();
  };
}

// The project each of these tasks is in; ids that match no task are absent.
export async function taskProjectIds(
  taskIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(taskIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({
      id: schema.taskTable.id,
      projectId: schema.taskTable.projectId,
    })
    .from(schema.taskTable)
    .where(inArray(schema.taskTable.id, unique));
  return new Map(rows.map((row) => [row.id, row.projectId]));
}

// Of these projects, the ones visible in `scope`.
export async function visibleProjectIdsInScope(
  scope: ProjectScope,
  projectIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(projectIds.filter(Boolean))];
  if (scope.all || unique.length === 0) return new Set(unique);
  const rows = await db
    .select({ projectId: schema.projectMemberTable.projectId })
    .from(schema.projectMemberTable)
    .where(
      and(
        eq(schema.projectMemberTable.userId, scope.userId),
        inArray(schema.projectMemberTable.projectId, unique),
      ),
    );
  return new Set(rows.map((row) => row.projectId));
}

/**
 * Throws 404 unless the caller can reach every one of these projects. 404,
 * not 403, and the same message as a missing record, so a hidden project
 * cannot be told apart from one that does not exist.
 */
export async function assertProjectAccess(
  c: Context,
  projectIds: string[],
  notFoundMessage: string,
): Promise<void> {
  const unique = [...new Set(projectIds)];
  if (unique.length === 0) return;
  if (await canAccessAllProjects(c)) return;

  const userId = c.get("userId") as string | undefined;
  if (!userId) throw new HTTPException(404, { message: notFoundMessage });

  const rows = await db
    .select({ projectId: schema.projectMemberTable.projectId })
    .from(schema.projectMemberTable)
    .where(
      and(
        eq(schema.projectMemberTable.userId, userId),
        inArray(schema.projectMemberTable.projectId, unique),
      ),
    );

  if (rows.length !== unique.length) {
    throw new HTTPException(404, { message: notFoundMessage });
  }
}

/**
 * The same decision for code that runs outside a route's middleware (the
 * project socket, asset downloads). Resolves the project's workspace, applies
 * the workspace check (403), then the project check (404).
 */
export async function authorizeProjectAccess({
  userId,
  projectId,
  apiKeyId,
  apiKeyPermissions,
  notFoundMessage = "Project not found",
}: {
  userId: string;
  projectId: string;
  apiKeyId?: string;
  apiKeyPermissions?: Record<string, string[]> | null;
  // The record the caller asked for, so a hidden one reads like a missing one.
  notFoundMessage?: string;
}): Promise<{ workspaceId: string }> {
  const [project] = await db
    .select({ workspaceId: schema.projectTable.workspaceId })
    .from(schema.projectTable)
    .where(eq(schema.projectTable.id, projectId))
    .limit(1);
  if (!project) {
    throw new HTTPException(404, { message: notFoundMessage });
  }

  await validateWorkspaceAccess(userId, project.workspaceId, apiKeyId);

  const accessAll = await userHasWorkspacePermission({
    userId,
    workspaceId: project.workspaceId,
    permissions: PROJECT_ACCESS_ALL,
    apiKeyPermissions,
  });
  if (accessAll) return { workspaceId: project.workspaceId };

  const [membership] = await db
    .select({ id: schema.projectMemberTable.id })
    .from(schema.projectMemberTable)
    .where(
      and(
        eq(schema.projectMemberTable.projectId, projectId),
        eq(schema.projectMemberTable.userId, userId),
      ),
    )
    .limit(1);
  if (!membership) {
    throw new HTTPException(404, { message: notFoundMessage });
  }

  return { workspaceId: project.workspaceId };
}

/**
 * Of these users, the ones who can reach the project: members of its
 * workspace (or instance admins) who either hold project:access_all or have a
 * project_member row. For deciding who may be assigned, mentioned or notified.
 */
export async function usersWithProjectAccess(
  projectId: string,
  userIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const allowed = new Set<string>();
  if (unique.length === 0) return allowed;

  const [project] = await db
    .select({ workspaceId: schema.projectTable.workspaceId })
    .from(schema.projectTable)
    .where(eq(schema.projectTable.id, projectId))
    .limit(1);
  if (!project) return allowed;

  const [accessAll, memberRows, workspaceRows] = await Promise.all([
    usersWithWorkspacePermission(
      project.workspaceId,
      unique,
      PROJECT_ACCESS_ALL,
    ),
    db
      .select({ userId: schema.projectMemberTable.userId })
      .from(schema.projectMemberTable)
      .where(
        and(
          eq(schema.projectMemberTable.projectId, projectId),
          inArray(schema.projectMemberTable.userId, unique),
        ),
      ),
    db
      .select({ userId: schema.workspaceUserTable.userId })
      .from(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, project.workspaceId),
          inArray(schema.workspaceUserTable.userId, unique),
        ),
      ),
  ]);

  const inWorkspace = new Set(workspaceRows.map((row) => row.userId));
  // usersWithWorkspacePermission already includes instance admins, who pass
  // the workspace check without a membership.
  for (const userId of accessAll) allowed.add(userId);
  for (const row of memberRows) {
    if (inWorkspace.has(row.userId)) allowed.add(row.userId);
  }
  return allowed;
}

/**
 * Tells these users' clients that the projects they can reach may have
 * changed: their project lists refresh, and any project socket they can no
 * longer reach is closed (see ws/index.ts).
 */
export async function projectAccessChanged(
  workspaceId: string,
  userIds: string[],
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;
  await publishEvent("project.access_changed", {
    workspaceId,
    userIds: unique,
  });
}

// Project memberships only mean something while the user belongs to the
// workspace. Cleared when they leave or are removed, and again when they join,
// so someone who comes back starts with no projects rather than their old ones.
export async function clearProjectMemberships(
  userId: string,
  workspaceId: string,
): Promise<void> {
  await db
    .delete(schema.projectMemberTable)
    .where(
      and(
        eq(schema.projectMemberTable.userId, userId),
        eq(schema.projectMemberTable.workspaceId, workspaceId),
      ),
    );
}

export async function userCanAccessProject(
  projectId: string,
  userId: string,
): Promise<boolean> {
  return (await usersWithProjectAccess(projectId, [userId])).has(userId);
}
