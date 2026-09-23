import { PROJECT_ACCESS_ALL } from "@kaneo/permissions";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  projectMemberTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { projectAccessChanged } from "../../utils/project-access";
import { usersWithWorkspacePermission } from "../../utils/require-workspace-permission";

type ProjectMember = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  access: "member" | "all";
  addedAt: Date | null;
};

/**
 * Everyone in the workspace who can reach the project: its members, and the
 * people whose role reaches every project ("all", which cannot be removed
 * here). Doubles as the list of people a task in the project can be assigned
 * to.
 */
export async function getProjectMembers(
  workspaceId: string,
  projectId: string,
): Promise<ProjectMember[]> {
  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
      role: workspaceUserTable.role,
      addedAt: projectMemberTable.createdAt,
    })
    .from(workspaceUserTable)
    .innerJoin(userTable, eq(workspaceUserTable.userId, userTable.id))
    .leftJoin(
      projectMemberTable,
      and(
        eq(projectMemberTable.projectId, projectId),
        eq(projectMemberTable.userId, workspaceUserTable.userId),
      ),
    )
    .where(eq(workspaceUserTable.workspaceId, workspaceId));

  const accessAll = await usersWithWorkspacePermission(
    workspaceId,
    rows.map((row) => row.id),
    PROJECT_ACCESS_ALL,
  );

  const members: ProjectMember[] = [];
  for (const row of rows) {
    if (accessAll.has(row.id)) {
      members.push({ ...row, access: "all" });
    } else if (row.addedAt) {
      members.push({ ...row, access: "member" });
    }
  }

  return members.sort((a, b) => a.name.localeCompare(b.name));
}

async function assertWorkspaceMember(workspaceId: string, userId: string) {
  const [member] = await db
    .select({ id: workspaceUserTable.id })
    .from(workspaceUserTable)
    .where(
      and(
        eq(workspaceUserTable.workspaceId, workspaceId),
        eq(workspaceUserTable.userId, userId),
      ),
    )
    .limit(1);

  if (!member) {
    throw new HTTPException(404, { message: "Member not found" });
  }
}

export async function addProjectMember(
  workspaceId: string,
  projectId: string,
  userId: string,
) {
  await assertWorkspaceMember(workspaceId, userId);

  await db
    .insert(projectMemberTable)
    .values({ workspaceId, projectId, userId })
    .onConflictDoNothing();

  await projectAccessChanged(workspaceId, [userId]);
  await publishEvent("project.members_changed", { projectId });

  return getProjectMembers(workspaceId, projectId);
}

export async function removeProjectMember(
  workspaceId: string,
  projectId: string,
  userId: string,
) {
  const removed = await db
    .delete(projectMemberTable)
    .where(
      and(
        eq(projectMemberTable.projectId, projectId),
        eq(projectMemberTable.userId, userId),
      ),
    )
    .returning({ id: projectMemberTable.id });

  if (removed.length === 0) {
    throw new HTTPException(404, { message: "Member not found" });
  }

  await projectAccessChanged(workspaceId, [userId]);
  await publishEvent("project.members_changed", { projectId });

  return getProjectMembers(workspaceId, projectId);
}
