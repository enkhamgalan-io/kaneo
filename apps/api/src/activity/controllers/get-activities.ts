import { desc, eq } from "drizzle-orm";
import db from "../../database";
import { activityTable } from "../../database/schema";
import {
  type ProjectScope,
  visibleProjectIdsInScope,
} from "../../utils/project-access";

type MovedEventData = {
  fromProjectId?: string | null;
  fromProjectName?: string | null;
  toProjectId?: string | null;
  toProjectName?: string | null;
};

function movedEventData(eventData: unknown): MovedEventData | null {
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return null;
  }
  return eventData as MovedEventData;
}

async function getActivitiesFromTaskId(taskId: string, scope: ProjectScope) {
  const activities = await db.query.activityTable.findMany({
    where: eq(activityTable.taskId, taskId),
    orderBy: [desc(activityTable.createdAt)],
  });

  activities.forEach((x) => {
    if (x.content) {
      x.content = x.content.replace(/\n+/g, "\n");
    }
  });

  // A task moved between projects records both. The caller can open the
  // task's current project, but maybe not the other one, whose name and id
  // are left out so it stays hidden.
  const movedProjectIds = activities.flatMap((activity) => {
    const data =
      activity.type === "moved" ? movedEventData(activity.eventData) : null;
    return data ? [data.fromProjectId ?? "", data.toProjectId ?? ""] : [];
  });
  const visible = await visibleProjectIdsInScope(scope, movedProjectIds);

  return activities.map((activity) => {
    const data =
      activity.type === "moved" ? movedEventData(activity.eventData) : null;
    if (!data) return activity;

    const redacted = { ...data };
    if (data.fromProjectId && !visible.has(data.fromProjectId)) {
      redacted.fromProjectId = null;
      redacted.fromProjectName = null;
    }
    if (data.toProjectId && !visible.has(data.toProjectId)) {
      redacted.toProjectId = null;
      redacted.toProjectName = null;
    }
    return { ...activity, eventData: redacted };
  });
}

export default getActivitiesFromTaskId;
