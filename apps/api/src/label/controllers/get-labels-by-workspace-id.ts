import { and, eq, exists, isNull, or, sql } from "drizzle-orm";
import db from "../../database";
import { labelTable, taskTable } from "../../database/schema";
import {
  type ProjectScope,
  visibleProjectFilter,
} from "../../utils/project-access";

// Workspace-level labels (no task) are shared vocabulary and always listed. A
// label attached to a task is listed only when the caller can reach that
// task's project, so the list never reveals tasks in hidden projects.
function getLabelsByWorkspaceId(workspaceId: string, scope: ProjectScope) {
  return db
    .select()
    .from(labelTable)
    .where(
      and(
        eq(labelTable.workspaceId, workspaceId),
        scope.all
          ? undefined
          : or(
              isNull(labelTable.taskId),
              exists(
                db
                  .select({ one: sql`1` })
                  .from(taskTable)
                  .where(
                    and(
                      eq(taskTable.id, labelTable.taskId),
                      visibleProjectFilter(scope, taskTable.projectId),
                    ),
                  ),
              ),
            ),
      ),
    );
}

export default getLabelsByWorkspaceId;
