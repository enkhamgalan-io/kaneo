import { sql } from "drizzle-orm";
import { columnTable, taskTable } from "../../database/schema";

// Statuses that exist outside a project's column set. `planned` is the backlog
// and `archived` is the archive; neither has a `column` row to read `isFinal`
// from, so both are handled explicitly everywhere completion is decided.
export const BACKLOG_STATUS = "planned";
export const ARCHIVED_STATUS = "archived";

// Completion is the column's `isFinal` flag, because columns are
// user-configurable per project. The `done` slug is only a fallback for a task
// whose status has no matching column row (a legacy status, or a column
// deleted out from under it) — the same rule the web uses in
// `lib/due-date-status.ts`, kept in sync deliberately.
const isCompletedSql = sql`(
  ${taskTable.status} = ${ARCHIVED_STATUS}
  or ${columnTable.isFinal} is true
  or (${columnTable.id} is null and ${taskTable.status} = 'done')
)`;

// Actively on a board: not finished, and not sitting in the backlog.
export const openTaskCase = sql<number>`case
  when ${isCompletedSql} then null
  when ${taskTable.status} = ${BACKLOG_STATUS} then null
  else 1
end`;

// A finished task can never be late. A backlog task with a past due date can,
// which is why this deliberately does not exclude `planned`.
export const overdueTaskCase = sql<number>`case
  when ${isCompletedSql} then null
  when ${taskTable.dueDate} is null then null
  when ${taskTable.dueDate} < now() then 1
  else null
end`;

export function isCompletedStatus(
  status: string,
  columnIsFinal: boolean | null,
): boolean {
  if (status === ARCHIVED_STATUS) return true;
  if (columnIsFinal !== null) return columnIsFinal;
  return status === "done";
}

// Display name for a status that has no column row behind it.
export function humanizeStatus(status: string): string {
  return status
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
