import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { getProjectScope } from "../utils/project-access";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createTaskRelation from "./controllers/create-task-relation";
import deleteTaskRelation from "./controllers/delete-task-relation";
import getTaskRelations from "./controllers/get-task-relations";
import {
  taskRelationSchema,
  taskRelationWithTasksListSchema,
} from "./response";
import {
  createTaskRelationBody,
  taskIdParam,
  taskRelationParam,
} from "./schema";

const getTaskRelationsRoute = createRoute({
  method: "get",
  operationId: "getTaskRelations",
  path: "/{taskId}",
  tags: ["Task Relations"],
  summary: "Get task relations",
  description:
    "Get every relation where the task is the source or the target, each with a summary of both linked tasks. Relations pointing outside the caller's workspace are omitted.",
  middleware: [workspaceAccess.fromTaskId("taskId")] as const,
  request: { params: taskIdParam },
  responses: {
    200: jsonResponse(
      "Task relations with the linked task summaries",
      taskRelationWithTasksListSchema,
    ),
    403: errorResponse("No access to the task's workspace"),
    404: errorResponse(
      "The task does not exist or is in a project the caller cannot access",
    ),
  },
});

const createTaskRelationRoute = createRoute({
  method: "post",
  operationId: "createTaskRelation",
  path: "/",
  tags: ["Task Relations"],
  summary: "Create task relation",
  description:
    "Link two tasks. Authorization is scoped to the source task's workspace.",
  middleware: [
    // Both tasks: a relation shows each side to the other, so creating one
    // needs access to both projects.
    workspaceAccess.fromTaskId("sourceTaskId", {
      also: [{ key: "targetTaskId", resource: "task" }],
    }),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createTaskRelationBody } },
    },
  },
  responses: {
    200: jsonResponse("The created relation", taskRelationSchema),
    400: errorResponse(
      "Invalid body, or the two tasks belong to different workspaces",
    ),
    403: errorResponse(
      "No workspace access, or missing task:update permission",
    ),
    404: errorResponse(
      "The source or target task does not exist, or is in a project the caller cannot access",
    ),
    409: errorResponse("This relation already exists"),
  },
});

const deleteTaskRelationRoute = createRoute({
  method: "delete",
  operationId: "deleteTaskRelation",
  path: "/{id}",
  tags: ["Task Relations"],
  summary: "Delete task relation",
  description: "Remove a link between two tasks. Returns the deleted relation.",
  middleware: [
    workspaceAccess.fromTaskRelation("id"),
    requireWorkspacePermission({ task: ["update"] }),
  ] as const,
  request: { params: taskRelationParam },
  responses: {
    200: jsonResponse("The deleted relation", taskRelationSchema),
    403: errorResponse(
      "No workspace access, or missing task:update permission",
    ),
    404: errorResponse(
      "The relation does not exist, or one of its tasks is in a project the caller cannot access",
    ),
  },
});

const taskRelation = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(getTaskRelationsRoute, async (c) =>
    c.json(
      await getTaskRelations(
        c.req.valid("param").taskId,
        c.get("workspaceId"),
        await getProjectScope(c),
      ),
      200,
    ),
  )
  .openapi(createTaskRelationRoute, async (c) => {
    const { sourceTaskId, targetTaskId, relationType } = c.req.valid("json");
    return c.json(
      await createTaskRelation({
        sourceTaskId,
        targetTaskId,
        relationType,
        userId: c.get("userId"),
        workspaceId: c.get("workspaceId"),
      }),
      200,
    );
  })
  .openapi(deleteTaskRelationRoute, async (c) =>
    c.json(
      await deleteTaskRelation(c.req.valid("param").id, c.get("userId")),
      200,
    ),
  );

export default taskRelation;
