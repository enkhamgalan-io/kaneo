import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import {
  getProjectScope,
  requireAccessAllForWorkspaceRecords,
} from "../utils/project-access";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import assignLabelToTask from "./controllers/assign-label-to-task";
import createLabel from "./controllers/create-label";
import deleteLabel from "./controllers/delete-label";
import getLabel from "./controllers/get-label";
import getLabelsByTaskId from "./controllers/get-labels-by-task-id";
import getLabelsByWorkspaceId from "./controllers/get-labels-by-workspace-id";
import unassignLabelFromTask from "./controllers/unassign-label-from-task";
import updateLabel from "./controllers/update-label";
import { labelListSchema, labelSchema } from "./response";
import {
  attachLabelBody,
  createLabelBody,
  labelParam,
  taskIdParam,
  updateLabelBody,
  workspaceIdParam,
} from "./schema";

const getTaskLabelsRoute = createRoute({
  method: "get",
  operationId: "getTaskLabels",
  path: "/task/{taskId}",
  tags: ["Labels"],
  summary: "Get task labels",
  description: "Get all labels assigned to a specific task",
  middleware: [workspaceAccess.fromTaskId()] as const,
  request: { params: taskIdParam },
  responses: {
    200: jsonResponse("List of labels for the task", labelListSchema),
    403: errorResponse("No access to the task's workspace"),
    404: errorResponse(
      "The task does not exist or is in a project the caller cannot access",
    ),
  },
});

const getWorkspaceLabelsRoute = createRoute({
  method: "get",
  operationId: "getWorkspaceLabels",
  path: "/workspace/{workspaceId}",
  tags: ["Labels"],
  summary: "Get workspace labels",
  description: "Get all labels for a specific workspace",
  middleware: [workspaceAccess.fromParam()] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse("List of labels in the workspace", labelListSchema),
    400: errorResponse("Workspace ID could not be determined"),
    403: errorResponse("No access to the workspace"),
  },
});

const createLabelRoute = createRoute({
  method: "post",
  operationId: "createLabel",
  path: "/",
  tags: ["Labels"],
  summary: "Create label",
  description: "Create a new label in a workspace",
  middleware: [
    // A label created directly on a task needs access to that task's project.
    workspaceAccess.fromBody("workspaceId", {
      also: [{ key: "taskId", resource: "task", optional: true }],
    }),
    requireWorkspacePermission({ label: ["create"] }),
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createLabelBody } },
    },
  },
  responses: {
    200: jsonResponse("Label created successfully", labelSchema),
    400: errorResponse("Invalid body, or workspace ID could not be determined"),
    403: errorResponse(
      "No workspace access, or missing label:create permission",
    ),
    404: errorResponse(
      "The task does not exist or is in a project the caller cannot access",
    ),
  },
});

const getLabelRoute = createRoute({
  method: "get",
  operationId: "getLabel",
  path: "/{id}",
  tags: ["Labels"],
  summary: "Get label",
  description: "Get a specific label by ID",
  middleware: [workspaceAccess.fromLabel()] as const,
  request: { params: labelParam },
  responses: {
    200: jsonResponse("Label details", labelSchema),
    403: errorResponse("No access to the label's workspace"),
    404: errorResponse(
      "The label does not exist or is on a task in a project the caller cannot access",
    ),
  },
});

const attachLabelToTaskRoute = createRoute({
  method: "put",
  operationId: "attachLabelToTask",
  path: "/{id}/task",
  tags: ["Labels"],
  summary: "Attach label to task",
  description: "Attach an existing label to a task",
  middleware: [
    // The task it is attached to as well as the label's own task, if any.
    workspaceAccess.fromLabel("id", {
      also: [{ key: "taskId", resource: "task" }],
    }),
    requireWorkspacePermission({ label: ["update"] }),
  ] as const,
  request: {
    params: labelParam,
    body: {
      required: true,
      content: { "application/json": { schema: attachLabelBody } },
    },
  },
  responses: {
    200: jsonResponse("Label attached to task successfully", labelSchema),
    400: errorResponse("The label and task belong to different workspaces"),
    403: errorResponse(
      "No workspace access, or missing label:update permission",
    ),
    404: errorResponse(
      "The label or task does not exist, or is in a project the caller cannot access",
    ),
  },
});

const detachLabelFromTaskRoute = createRoute({
  method: "delete",
  operationId: "detachLabelFromTask",
  path: "/{id}/task",
  tags: ["Labels"],
  summary: "Detach label from task",
  description: "Detach a label from its current task",
  middleware: [
    workspaceAccess.fromLabel(),
    requireWorkspacePermission({ label: ["update"] }),
  ] as const,
  request: { params: labelParam },
  responses: {
    200: jsonResponse("Label detached from task successfully", labelSchema),
    400: errorResponse("The label is not attached to a task"),
    403: errorResponse(
      "No workspace access, or missing label:update permission",
    ),
    404: errorResponse(
      "The label or its task does not exist, or is in a project the caller cannot access",
    ),
  },
});

const updateLabelRoute = createRoute({
  method: "put",
  operationId: "updateLabel",
  path: "/{id}",
  tags: ["Labels"],
  summary: "Update label",
  description: "Update an existing label",
  middleware: [
    workspaceAccess.fromLabel(),
    requireWorkspacePermission({ label: ["update"] }),
    requireAccessAllForWorkspaceRecords(
      "Changing a workspace label needs access to every project",
    ),
  ] as const,
  request: {
    params: labelParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateLabelBody } },
    },
  },
  responses: {
    200: jsonResponse("Label updated successfully", labelSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "No workspace access, missing label:update permission, or a workspace label (which changes on every task using it) edited without project:access_all",
    ),
    404: errorResponse(
      "The label does not exist or is on a task in a project the caller cannot access",
    ),
  },
});

const deleteLabelRoute = createRoute({
  method: "delete",
  operationId: "deleteLabel",
  path: "/{id}",
  tags: ["Labels"],
  summary: "Delete label",
  description: "Delete a label by ID",
  middleware: [
    workspaceAccess.fromLabel(),
    requireWorkspacePermission({ label: ["delete"] }),
    requireAccessAllForWorkspaceRecords(
      "Deleting a workspace label needs access to every project",
    ),
  ] as const,
  request: { params: labelParam },
  responses: {
    200: jsonResponse("Label deleted successfully", labelSchema),
    403: errorResponse(
      "No workspace access, missing label:delete permission, or a workspace label (removed from every task using it) deleted without project:access_all",
    ),
    404: errorResponse(
      "The label or its task does not exist, or is in a project the caller cannot access",
    ),
  },
});

const label = apiRouter()
  .openapi(getTaskLabelsRoute, async (c) => {
    const { taskId } = c.req.valid("param");
    return c.json(await getLabelsByTaskId(taskId), 200);
  })
  .openapi(getWorkspaceLabelsRoute, async (c) => {
    const { workspaceId } = c.req.valid("param");
    return c.json(
      await getLabelsByWorkspaceId(workspaceId, await getProjectScope(c)),
      200,
    );
  })
  .openapi(createLabelRoute, async (c) => {
    const { name, color, workspaceId, taskId } = c.req.valid("json");
    const userId = c.get("userId");
    return c.json(
      await createLabel(name, color, taskId, workspaceId, userId),
      200,
    );
  })
  .openapi(getLabelRoute, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await getLabel(id), 200);
  })
  .openapi(attachLabelToTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { taskId } = c.req.valid("json");
    const userId = c.get("userId");
    return c.json(await assignLabelToTask(id, taskId, userId), 200);
  })
  .openapi(detachLabelFromTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const userId = c.get("userId");
    return c.json(await unassignLabelFromTask(id, userId), 200);
  })
  .openapi(updateLabelRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { name, color } = c.req.valid("json");
    return c.json(await updateLabel(id, name, color), 200);
  })
  .openapi(deleteLabelRoute, async (c) => {
    const { id } = c.req.valid("param");
    const userId = c.get("userId");
    return c.json(await deleteLabel(id, userId), 200);
  });

export default label;
