import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import db from "../../database";
import { notificationTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { deliverNotification } from "../../notification-preferences/delivery";
import { userCanAccessProject } from "../../utils/project-access";

// The project of a task notification's task, or null when the task is gone.
async function taskProjectId(taskId: string) {
  const [task] = await db
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);
  return task?.projectId ?? null;
}

// Whether the user can open the task a notification points at. A task that no
// longer exists has nothing to reveal, so it does not block the notification.
async function canReceiveTaskNotification(userId: string, taskId: string) {
  const projectId = await taskProjectId(taskId);
  return projectId === null || userCanAccessProject(projectId, userId);
}

async function createNotification({
  userId,
  title,
  content,
  type,
  eventData,
  resourceId,
  resourceType,
}: {
  userId: string;
  title?: string | null;
  content?: string | null;
  type?: string;
  eventData?: Record<string, unknown> | null;
  resourceId?: string;
  resourceType?: string;
}) {
  const preferenceKey =
    type === "task_assignee_changed" || type === "task_created"
      ? "taskAssignmentEnabled"
      : type === "task_comment" || type === "task_mention"
        ? "taskCommentEnabled"
        : type === "task_status_changed"
          ? "taskStatusChangeEnabled"
          : type === "due_date_reminder" || type === "task_overdue"
            ? "dueDateReminderEnabled"
            : null;

  // Every task notification (assignment, status, comment, mention, reminder)
  // passes through here, so this is the one place that keeps them from
  // reaching someone who cannot open the task.
  if (
    resourceType === "task" &&
    resourceId &&
    !(await canReceiveTaskNotification(userId, resourceId))
  ) {
    return null;
  }

  if (preferenceKey) {
    const preference = await db.query.userNotificationPreferenceTable.findFirst(
      {
        where: (table, { eq }) => eq(table.userId, userId),
      },
    );

    if (preference?.[preferenceKey] === false) {
      return null;
    }
  }

  const [notification] = await db
    .insert(notificationTable)
    .values({
      id: createId(),
      userId,
      title: title ?? null,
      content: content ?? null,
      type: type || "info",
      eventData: eventData ?? null,
      resourceId: resourceId || null,
      resourceType: resourceType || null,
    })
    .returning();

  if (notification) {
    await publishEvent("notification.created", {
      notificationId: notification.id,
      userId,
    });
    void deliverNotification(notification.id).catch((error) => {
      console.error("Failed to deliver notification", {
        notificationId: notification.id,
        error,
      });
    });
  }

  return notification;
}

export default createNotification;
