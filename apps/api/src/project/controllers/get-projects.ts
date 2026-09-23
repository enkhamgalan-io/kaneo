import { and, asc, count, eq, isNull, min, sql } from "drizzle-orm";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import {
  type ProjectScope,
  visibleProjectFilter,
} from "../../utils/project-access";

type ProjectStatistics = {
  completionPercentage: number;
  totalTasks: number;
  dueDate: Date | null;
};

const EMPTY_STATISTICS: ProjectStatistics = {
  completionPercentage: 0,
  totalTasks: 0,
  dueDate: null,
};

async function getProjectStatistics(
  workspaceId: string,
  includeArchived: boolean,
  scope: ProjectScope,
) {
  const statisticsByProject = new Map<string, ProjectStatistics>();

  // Aggregate in the database instead of loading every task row into memory.
  // This endpoint needs three numbers per project; the previous
  // `with: { tasks: true }` made both the query and the response grow linearly
  // with the number of tasks in the workspace. Scoping by workspaceId through
  // a join (rather than an `IN (...projectIds)` list) keeps the statement size
  // constant regardless of how many projects the workspace has.
  const rows = await db
    .select({
      projectId: taskTable.projectId,
      totalTasks: count(),
      completedTasks: count(
        sql`case when ${taskTable.status} in ('done', 'archived') then 1 end`,
      ),
      dueDate: min(taskTable.dueDate),
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        includeArchived ? undefined : isNull(projectTable.archivedAt),
        visibleProjectFilter(scope, projectTable.id),
      ),
    )
    .groupBy(taskTable.projectId);

  for (const row of rows) {
    const totalTasks = Number(row.totalTasks);
    const completedTasks = Number(row.completedTasks);

    statisticsByProject.set(row.projectId, {
      totalTasks,
      completionPercentage:
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      dueDate: row.dueDate ?? null,
    });
  }

  return statisticsByProject;
}

async function getProjects(
  workspaceId: string,
  includeArchived: boolean,
  scope: ProjectScope,
) {
  // The select builder rather than db.query: the relational builder aliases
  // the table, which breaks the visibility filter's correlated reference.
  const projects = await db
    .select()
    .from(projectTable)
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        includeArchived ? undefined : isNull(projectTable.archivedAt),
        visibleProjectFilter(scope, projectTable.id),
      ),
    )
    // `id` is the deterministic tie-breaker: without it, rows sharing both a
    // position and a createdAt come back in an unspecified order.
    .orderBy(
      asc(projectTable.position),
      asc(projectTable.createdAt),
      asc(projectTable.id),
    );

  const statisticsByProject = await getProjectStatistics(
    workspaceId,
    includeArchived,
    scope,
  );

  return projects.map((project) => ({
    ...project,
    statistics: statisticsByProject.get(project.id) ?? EMPTY_STATISTICS,
    archivedTasks: [],
    plannedTasks: [],
    columns: [],
  }));
}

export default getProjects;
