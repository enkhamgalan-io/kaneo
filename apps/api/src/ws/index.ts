import { randomUUID } from "node:crypto";
import type { WSContext } from "hono/ws";
import { subscribeToEvent } from "../events";
import { isRedisConfigured } from "../redis";
import {
  authorizeProjectAccess,
  taskProjectIds,
} from "../utils/project-access";
import type {
  BroadcastAdapter,
  BroadcastMessage,
  ProjectBroadcastMessage,
  UserBroadcast,
  UserBroadcastMessage,
} from "./broadcast-adapter";
import { InMemoryBroadcastAdapter } from "./in-memory-broadcast-adapter";
import { RedisBroadcastAdapter } from "./redis-broadcast-adapter";

const INSTANCE_ID = randomUUID();

// Sent on a user's channel when the projects they can reach may have changed.
export const PROJECT_ACCESS_CHANGED = "PROJECT_ACCESS_CHANGED";

// Close code for a project socket whose user can no longer reach the project;
// the web client does not reconnect after it.
export const PROJECT_ACCESS_REVOKED_CLOSE_CODE = 4403;

// How the socket was authorized, so a recheck applies the same rule: an API
// key limited to some permissions reaches only what the key allows.
type ProjectConnectionAccess = {
  apiKeyId?: string;
  apiKeyPermissions?: Record<string, string[]> | null;
  // projectAccessEpoch(userId) when the upgrade was authorized.
  epoch?: number;
};

type ProjectConnection = {
  ws: WSContext;
  userId: string;
  initiatorId: string;
  access: ProjectConnectionAccess;
};

type UserConnection = {
  ws: WSContext;
};

/**
 * User-scoped connections: tracks WebSocket connections keyed by userId.
 * Used for delivering user-targeted events like NOTIFICATION_CREATED.
 */
const userConnections = new Map<string, Set<UserConnection>>();

export function addUserConnection(userId: string, ws: WSContext) {
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  const conn: UserConnection = { ws };
  userConnections.get(userId)?.add(conn);
  return conn;
}

export function removeUserConnection(userId: string, conn: UserConnection) {
  const connections = userConnections.get(userId);
  if (connections) {
    connections.delete(conn);
    if (connections.size === 0) {
      userConnections.delete(userId);
    }
  }
}

export function broadcastToUser(userId: string, message: UserBroadcastMessage) {
  deliverToLocalUserConnections(userId, message);

  if (!adapter) {
    return;
  }

  void adapter
    .publishToUser({ userId, message, origin: INSTANCE_ID })
    .catch((err) => {
      console.error("Failed to publish a user broadcast:", err);
    });
}

function deliverToLocalUserConnections(
  userId: string,
  message: UserBroadcastMessage,
) {
  if (message.type === PROJECT_ACCESS_CHANGED) {
    revalidateProjectConnections(userId);
  }

  const connections = userConnections.get(userId);
  if (!connections) return;

  const payload = JSON.stringify(message);
  for (const conn of connections) {
    try {
      conn.ws.send(payload);
    } catch {
      connections.delete(conn);
    }
  }
  if (connections.size === 0) {
    userConnections.delete(userId);
  }
}

/**
 * Local connections: each instance tracks only its own WebSocket connections.
 */
const projectConnections = new Map<string, Set<ProjectConnection>>();

/**
 * Batching queues and timers local per-instance.
 * They accumulate messages before flushing to the broadcast adapter.
 */
const projectBroadcastQueues = new Map<
  string,
  Map<string, { message: ProjectBroadcastMessage; excludeInitiatorId?: string }>
>();
const projectBroadcastTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

let adapter: BroadcastAdapter | null = null;

// --- Subscribe to incoming broadcasts and deliver to local connections ---
export async function initializeWebSocketAdapter() {
  if (adapter) return;

  const nextAdapter = isRedisConfigured()
    ? new RedisBroadcastAdapter()
    : new InMemoryBroadcastAdapter();

  try {
    await nextAdapter.subscribe((msg: BroadcastMessage) => {
      deliverToLocalConnections(
        msg.projectId,
        msg.message,
        msg.excludeInitiatorId,
      );
    });
    await nextAdapter.subscribeToUser((msg: UserBroadcast) => {
      if (msg.origin === INSTANCE_ID) {
        return;
      }
      deliverToLocalUserConnections(msg.userId, msg.message);
    });
  } catch (err) {
    await nextAdapter.shutdown().catch(() => {});
    throw err;
  }

  adapter = nextAdapter;
  console.log(`📡 WebSockets Initialized using: "${adapter.constructor.name}"`);
}

export async function shutdownWebSocketAdapter() {
  const pendingQueues = [...projectBroadcastQueues.entries()];

  for (const timeout of projectBroadcastTimeouts.values()) {
    clearTimeout(timeout);
  }
  projectBroadcastTimeouts.clear();
  projectBroadcastQueues.clear();

  const currentAdapter = adapter;
  if (currentAdapter) {
    await Promise.allSettled(
      pendingQueues.flatMap(([projectId, queue]) =>
        [...queue.values()].map(({ message, excludeInitiatorId }) =>
          currentAdapter.publish({ projectId, message, excludeInitiatorId }),
        ),
      ),
    );
  }

  await currentAdapter?.shutdown();
  adapter = null;
}

function deliverToLocalConnections(
  projectId: string,
  message: ProjectBroadcastMessage,
  excludeInitiatorId?: string,
) {
  const connections = projectConnections.get(projectId);
  if (!connections) return;

  const payload = JSON.stringify(message);
  for (const conn of connections) {
    if (excludeInitiatorId && conn.initiatorId === excludeInitiatorId) continue;
    try {
      conn.ws.send(payload);
    } catch {
      connections.delete(conn);
    }
  }
  if (connections.size === 0) {
    projectConnections.delete(projectId);
  }
}

/**
 * Closes this instance's project sockets that the user can no longer reach.
 * It runs wherever the user's access-changed message is delivered, which with
 * Redis is every instance, since each holds its own sockets.
 */
function revalidateProjectConnections(userId: string) {
  accessEpochs.set(userId, projectAccessEpoch(userId) + 1);
  for (const [projectId, connections] of projectConnections) {
    for (const conn of connections) {
      if (conn.userId === userId) recheckConnection(projectId, conn);
    }
  }
}

function recheckConnection(projectId: string, conn: ProjectConnection) {
  void authorizeProjectAccess({
    userId: conn.userId,
    projectId,
    apiKeyId: conn.access.apiKeyId,
    apiKeyPermissions: conn.access.apiKeyPermissions,
  })
    .then(() => true)
    .catch((error: unknown) => {
      // 403 (left the workspace) and 404 (not in the project) both revoke.
      const status =
        error && typeof error === "object" && "status" in error
          ? (error as { status: unknown }).status
          : undefined;
      if (status === 403 || status === 404) return false;
      console.error("Failed to recheck project access for a socket:", error);
      return true;
    })
    .then((allowed) => {
      if (allowed) return;
      removeConnection(projectId, conn);
      try {
        conn.ws.close(
          PROJECT_ACCESS_REVOKED_CLOSE_CODE,
          "Project access revoked",
        );
      } catch {
        // Already closed.
      }
    });
}

/**
 * Counts the access changes this instance has seen for a user. A socket is
 * authorized during the upgrade but registered later, when it opens; a change
 * that lands in between finds nothing to recheck, so the socket compares the
 * count it was authorized under and rechecks itself.
 */
const accessEpochs = new Map<string, number>();

export function projectAccessEpoch(userId: string) {
  return accessEpochs.get(userId) ?? 0;
}

export function addConnection(
  projectId: string,
  ws: WSContext,
  userId: string,
  initiatorId: string,
  access: ProjectConnectionAccess = {},
) {
  if (!projectConnections.has(projectId)) {
    projectConnections.set(projectId, new Set());
  }
  const conn: ProjectConnection = { ws, userId, initiatorId, access };
  projectConnections.get(projectId)?.add(conn);
  if (
    access.epoch !== undefined &&
    access.epoch !== projectAccessEpoch(userId)
  ) {
    recheckConnection(projectId, conn);
  }
  return conn;
}

export function removeConnection(projectId: string, conn: ProjectConnection) {
  const connections = projectConnections.get(projectId);
  if (connections) {
    connections.delete(conn);
    if (connections.size === 0) {
      projectConnections.delete(projectId);
    }
  }
}

export function broadcastToProject(
  projectId: string,
  message: ProjectBroadcastMessage,
  excludeInitiatorId?: string,
) {
  if (!adapter) {
    console.warn("broadcastToProject called before adapter initialization");
    return;
  }

  if (!projectBroadcastQueues.has(projectId)) {
    projectBroadcastQueues.set(projectId, new Map());
  }

  const messageKey = `${message.type}:${message.taskId ?? ""}:${message.sourceTaskId ?? ""}:${message.targetTaskId ?? ""}`;
  projectBroadcastQueues
    .get(projectId)
    ?.set(messageKey, { message, excludeInitiatorId });

  if (projectBroadcastTimeouts.has(projectId)) {
    return;
  }

  const timeout = setTimeout(() => {
    projectBroadcastTimeouts.delete(projectId);
    const queue = projectBroadcastQueues.get(projectId);
    projectBroadcastQueues.delete(projectId);

    if (!queue || !adapter) return;

    // Publish each queued message through the adapter
    for (const { message: msg, excludeInitiatorId: exId } of queue.values()) {
      void adapter
        .publish({
          projectId,
          message: msg,
          excludeInitiatorId: exId,
        })
        .catch((err) => {
          console.error(
            `Failed to publish broadcast for project ${projectId}:`,
            err,
          );
        });
    }
  }, 100);

  projectBroadcastTimeouts.set(projectId, timeout);
}

type TaskEvent = {
  id: string | undefined;
  projectId: string;
  userId: string;
  initiatorId?: string;
  taskId: string;
  sourceTaskId: string | undefined;
  targetTaskId: string | undefined;
};

const taskUpdateEvents = [
  "task.created",
  "task.updated",
  "task.deleted",
  "task.status_changed",
  "task.priority_changed",
  "task.unassigned",
  "task.assignee_changed",
  "task.due_date_changed",
  "task.title_changed",
  "task.description_changed",
  "task.label_assigned",
  "task.label_unassigned",
  "task.label_created",
  "task.label_deleted",
  "task-relation.created",
  "task-relation.deleted",
  "comment.created",
  "comment.deleted",
  "comment.updated",
];

subscribeToEvent<{
  taskId: string;
  userId: string;
  initiatorId?: string;
  type: string;
  content: string;
  fromProjectId: string;
  fromProjectName: string;
  toProjectId: string;
  toProjectName: string;
  oldStatus: string;
  newStatus: string;
}>("task.moved", async (data) => {
  const { fromProjectId, initiatorId, toProjectId, taskId } = data;

  broadcastToProject(
    toProjectId,
    { type: "TASK_MOVED", projectId: toProjectId, taskId },
    initiatorId,
  );
  broadcastToProject(
    fromProjectId,
    { type: "TASK_MOVED", projectId: fromProjectId, taskId },
    initiatorId,
  );
});

subscribeToEvent<{
  projectId: string;
  userId: string;
  initiatorId?: string;
}>("task-relation.refresh", async (data) => {
  const { projectId, initiatorId } = data;
  if (!projectId) return;

  broadcastToProject(
    projectId,
    {
      type: "TASK_RELATION_UPDATED",
      projectId,
      taskId: "",
      sourceTaskId: undefined,
      targetTaskId: undefined,
    },
    initiatorId,
  );
});

subscribeToEvent<{ workspaceId: string; userIds: string[] }>(
  "project.access_changed",
  async (data) => {
    for (const userId of data.userIds) {
      broadcastToUser(userId, {
        type: PROJECT_ACCESS_CHANGED,
        workspaceId: data.workspaceId,
      });
    }
  },
);

// Everyone viewing the project refreshes who can be assigned in it.
subscribeToEvent<{ projectId: string; initiatorId?: string }>(
  "project.members_changed",
  async (data) => {
    broadcastToProject(
      data.projectId,
      { type: "PROJECT_MEMBERS_UPDATED", projectId: data.projectId },
      data.initiatorId,
    );
  },
);

subscribeToEvent<{ notificationId: string; userId: string }>(
  "notification.created",
  async (data) => {
    if (data.userId) {
      broadcastToUser(data.userId, { type: "NOTIFICATION_CREATED" });
    }
  },
);

/**
 * A relation can join tasks in two projects. Each project's socket hears only
 * about its own task, so members who cannot open the other project never
 * receive its task id, and the other project gets a message of its own.
 */
async function broadcastRelationChange(data: TaskEvent) {
  const { projectId, initiatorId, taskId } = data;
  const projectOf = await taskProjectIds(
    [data.sourceTaskId, data.targetTaskId].filter((id): id is string =>
      Boolean(id),
    ),
  );
  // A task deleted along with its relations is gone from the table; it was
  // in the project the event names.
  projectOf.set(taskId, projectId);

  const byProject = new Map<
    string,
    { sourceTaskId?: string; targetTaskId?: string }
  >([[projectId, {}]]);
  for (const key of ["sourceTaskId", "targetTaskId"] as const) {
    const id = data[key];
    const taskProject = id ? projectOf.get(id) : undefined;
    if (!id || !taskProject) continue;
    byProject.set(taskProject, { ...byProject.get(taskProject), [key]: id });
  }

  for (const [target, ids] of byProject) {
    broadcastToProject(
      target,
      {
        type: "TASK_RELATION_UPDATED",
        projectId: target,
        taskId:
          target === projectId
            ? taskId
            : (ids.sourceTaskId ?? ids.targetTaskId ?? ""),
        sourceTaskId: ids.sourceTaskId,
        targetTaskId: ids.targetTaskId,
      },
      initiatorId,
    );
  }
}

for (const eventName of taskUpdateEvents) {
  subscribeToEvent<TaskEvent>(eventName, async (data) => {
    const { projectId, initiatorId } = data;
    const taskId = data.taskId;

    if (!projectId || !taskId) return;
    if (
      eventName === "task-relation.created" ||
      eventName === "task-relation.deleted"
    ) {
      await broadcastRelationChange(data);
      return;
    }
    let type: string;
    switch (eventName) {
      case "task.created":
        type = "TASK_CREATED";
        break;
      case "task.deleted":
        type = "TASK_DELETED";
        break;
      case "task.label_assigned":
      case "task.label_unassigned":
      case "task.label_created":
      case "task.label_deleted":
        type = "TASK_LABEL_UPDATED";
        break;
      case "comment.created":
      case "comment.deleted":
      case "comment.updated":
        type = "COMMENT_UPDATED";
        break;
      default:
        type = "TASK_UPDATED";
    }

    broadcastToProject(
      projectId,
      {
        type,
        projectId,
        taskId: taskId,
        sourceTaskId: data.sourceTaskId,
        targetTaskId: data.targetTaskId,
      },
      initiatorId,
    );
  });
}
