import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  columnTable,
  projectTable,
  taskTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";
import {
  ARCHIVED_STATUS,
  BACKLOG_STATUS,
  humanizeStatus,
  isCompletedStatus,
} from "./member-task-status";

type StatusSummary = {
  slug: string;
  name: string;
  isFinal: boolean;
  count: number;
};

async function getMemberTasks(workspaceId: string, memberUserId: string) {
  // Resolve the target through this workspace's membership rather than the
  // user table. A user id from another workspace must be indistinguishable
  // from one that does not exist, or this endpoint becomes a way to probe
  // which ids are real.
  const [member] = await db
    .select({
      userId: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
      role: workspaceUserTable.role,
      joinedAt: workspaceUserTable.joinedAt,
    })
    .from(workspaceUserTable)
    .innerJoin(userTable, eq(workspaceUserTable.userId, userTable.id))
    .where(
      and(
        eq(workspaceUserTable.workspaceId, workspaceId),
        eq(workspaceUserTable.userId, memberUserId),
      ),
    )
    .limit(1);

  if (!member) {
    throw new HTTPException(404, { message: "Member not found" });
  }

  // One pass over the member's tasks. The column join resolves each task's
  // real state, because two projects can name and order the same slug
  // differently — or not define it at all.
  const rows = await db
    .select({
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      status: taskTable.status,
      priority: taskTable.priority,
      startDate: taskTable.startDate,
      dueDate: taskTable.dueDate,
      position: taskTable.position,
      createdAt: taskTable.createdAt,
      projectId: projectTable.id,
      projectName: projectTable.name,
      projectSlug: projectTable.slug,
      projectIcon: projectTable.icon,
      projectArchivedAt: projectTable.archivedAt,
      projectPosition: projectTable.position,
      columnName: columnTable.name,
      columnIsFinal: columnTable.isFinal,
      columnPosition: columnTable.position,
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
        eq(taskTable.userId, memberUserId),
      ),
    )
    // Projects come back in the same order the workspace overview lists them
    // (`project/controllers/get-projects.ts`), so this page and that one agree.
    // Within a project, Postgres sorts NULLs last on ASC, so `planned` and
    // `archived` — which have no column row — fall after the real columns.
    .orderBy(
      asc(projectTable.position),
      asc(projectTable.createdAt),
      asc(projectTable.id),
      asc(columnTable.position),
      asc(taskTable.position),
    );

  const now = Date.now();

  const summary = {
    total: 0,
    open: 0,
    overdue: 0,
    done: 0,
    backlog: 0,
    archived: 0,
  };

  // Keyed by slug: the workspace-level breakdown has to collapse the same
  // state across projects. The display name is the first one seen, since a
  // slug shared by two projects with different labels has no single answer.
  const statusSummaries = new Map<string, StatusSummary>();

  const projects = new Map<
    string,
    {
      id: string;
      name: string;
      slug: string;
      icon: string | null;
      isArchived: boolean;
      counts: { total: number; open: number; overdue: number; done: number };
      tasks: Array<{
        id: string;
        number: number | null;
        title: string;
        status: string;
        statusName: string;
        priority: string;
        startDate: Date | null;
        dueDate: Date | null;
        createdAt: Date;
        projectId: string;
        isCompleted: boolean;
        isOverdue: boolean;
      }>;
    }
  >();

  for (const row of rows) {
    const isCompleted = isCompletedStatus(row.status, row.columnIsFinal);
    const isOverdue =
      !isCompleted && row.dueDate != null && row.dueDate.getTime() < now;
    const statusName = row.columnName ?? humanizeStatus(row.status);

    summary.total += 1;
    if (isOverdue) summary.overdue += 1;

    // Exclusive buckets, checked in this order so `total` is their sum.
    if (row.status === ARCHIVED_STATUS) {
      summary.archived += 1;
    } else if (row.status === BACKLOG_STATUS) {
      summary.backlog += 1;
    } else if (isCompleted) {
      summary.done += 1;
    } else {
      summary.open += 1;
    }

    const existingStatus = statusSummaries.get(row.status);
    if (existingStatus) {
      existingStatus.count += 1;
    } else {
      statusSummaries.set(row.status, {
        slug: row.status,
        name: statusName,
        isFinal: isCompleted,
        count: 1,
      });
    }

    let project = projects.get(row.projectId);
    if (!project) {
      project = {
        id: row.projectId,
        name: row.projectName,
        slug: row.projectSlug,
        icon: row.projectIcon,
        isArchived: row.projectArchivedAt != null,
        counts: { total: 0, open: 0, overdue: 0, done: 0 },
        tasks: [],
      };
      projects.set(row.projectId, project);
    }

    project.counts.total += 1;
    if (isOverdue) project.counts.overdue += 1;
    if (row.status === ARCHIVED_STATUS || row.status === BACKLOG_STATUS) {
      // Neither is on the board, so neither counts as open or done work.
    } else if (isCompleted) {
      project.counts.done += 1;
    } else {
      project.counts.open += 1;
    }

    project.tasks.push({
      id: row.id,
      number: row.number,
      title: row.title,
      status: row.status,
      statusName,
      priority: row.priority,
      startDate: row.startDate,
      dueDate: row.dueDate,
      createdAt: row.createdAt,
      projectId: row.projectId,
      isCompleted,
      isOverdue,
    });
  }

  return {
    member,
    summary: {
      ...summary,
      projectCount: projects.size,
      byStatus: [...statusSummaries.values()],
    },
    projects: [...projects.values()],
  };
}

export default getMemberTasks;
