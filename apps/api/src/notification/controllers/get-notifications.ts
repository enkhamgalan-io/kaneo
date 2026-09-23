import { and, desc, eq } from "drizzle-orm";
import db from "../../database";
import {
  notificationTable,
  projectTable,
  taskTable,
  workspaceTable,
} from "../../database/schema";
import { userCanAccessProject } from "../../utils/project-access";

async function getNotifications(userId: string) {
  const rows = await db
    .select({
      notification: notificationTable,
      projectId: projectTable.id,
      workspaceId: workspaceTable.id,
    })
    .from(notificationTable)
    .leftJoin(
      taskTable,
      and(
        eq(notificationTable.resourceId, taskTable.id),
        eq(notificationTable.resourceType, "task"),
      ),
    )
    .leftJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
    .where(eq(notificationTable.userId, userId))
    .orderBy(desc(notificationTable.createdAt))
    .limit(50);

  // A task's current project replaces the one stored with the notification
  // only while the user can open it. A task moved into a project they cannot
  // reach keeps pointing where it was, so its new location stays hidden.
  const liveProjectIds = [
    ...new Set(rows.flatMap((row) => (row.projectId ? [row.projectId] : []))),
  ];
  const reachable = new Set<string>();
  await Promise.all(
    liveProjectIds.map(async (projectId) => {
      if (await userCanAccessProject(projectId, userId)) {
        reachable.add(projectId);
      }
    }),
  );

  return rows.map(({ notification, projectId, workspaceId }) => {
    if (!projectId || !reachable.has(projectId)) {
      return notification;
    }

    const existing =
      notification.eventData &&
      typeof notification.eventData === "object" &&
      !Array.isArray(notification.eventData)
        ? (notification.eventData as Record<string, unknown>)
        : {};

    return {
      ...notification,
      eventData: {
        ...existing,
        projectId: projectId ?? existing.projectId ?? null,
        workspaceId: workspaceId ?? existing.workspaceId ?? null,
      },
    };
  });
}

export default getNotifications;
