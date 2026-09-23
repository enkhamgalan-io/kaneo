import { and, count, eq, isNotNull } from "drizzle-orm";
import db from "../../database";
import { columnTable, projectTable, taskTable } from "../../database/schema";
import { openTaskCase, overdueTaskCase } from "./member-task-status";

// Aggregated in the database, grouped by assignee, so the members table costs
// one query no matter how many members or tasks the workspace has. Mirrors the
// approach in `project/controllers/get-projects.ts`.
async function getMemberTaskCounts(workspaceId: string) {
  const rows = await db
    .select({
      userId: taskTable.userId,
      openCount: count(openTaskCase),
      overdueCount: count(overdueTaskCase),
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(
      columnTable,
      and(
        eq(columnTable.projectId, taskTable.projectId),
        eq(columnTable.slug, taskTable.status),
      ),
    )
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        isNotNull(taskTable.userId),
      ),
    )
    .groupBy(taskTable.userId);

  return rows
    .filter((row): row is typeof row & { userId: string } => row.userId != null)
    .map((row) => ({
      userId: row.userId,
      openCount: Number(row.openCount),
      overdueCount: Number(row.overdueCount),
    }));
}

export default getMemberTaskCounts;
