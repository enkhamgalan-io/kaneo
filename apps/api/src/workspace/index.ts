import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import getMemberTaskCountsCtrl from "./controllers/get-member-task-counts";
import getMemberTasksCtrl from "./controllers/get-member-tasks";
import getWorkspaceMembersCtrl from "./controllers/get-workspace-members";
import {
  memberTaskCountListSchema,
  memberTasksSchema,
  workspaceMemberListSchema,
} from "./response";
import { workspaceIdParam, workspaceMemberParam } from "./schema";

const getWorkspaceMembersRoute = createRoute({
  method: "get",
  operationId: "getWorkspaceMembers",
  path: "/{workspaceId}/members",
  tags: ["Workspaces"],
  summary: "Get workspace members",
  description: "Get all members of a workspace, with their role.",
  middleware: [workspaceAccess.fromParam("workspaceId")] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse("List of workspace members", workspaceMemberListSchema),
    400: errorResponse("Workspace ID could not be determined"),
    403: errorResponse("No access to the workspace"),
  },
});

const getWorkspaceMemberTaskCountsRoute = createRoute({
  method: "get",
  operationId: "getWorkspaceMemberTaskCounts",
  path: "/{workspaceId}/members/task-counts",
  tags: ["Workspaces"],
  summary: "Get member task counts",
  description:
    "Get open and overdue task counts per assignee across every project in the workspace. Assignees with no counted tasks are omitted, and an assignee may no longer be a workspace member.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse("Task counts per assignee", memberTaskCountListSchema),
    400: errorResponse("Workspace ID could not be determined"),
    403: errorResponse("No workspace access, or missing task:read permission"),
  },
});

const getWorkspaceMemberTasksRoute = createRoute({
  method: "get",
  operationId: "getWorkspaceMemberTasks",
  path: "/{workspaceId}/members/{userId}/tasks",
  tags: ["Workspaces"],
  summary: "Get member tasks",
  description:
    "Get every task assigned to one workspace member, grouped by project, with a workspace-wide summary. A task is complete when its column is marked final.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: workspaceMemberParam },
  responses: {
    200: jsonResponse("The member's tasks with a summary", memberTasksSchema),
    400: errorResponse("Workspace ID could not be determined"),
    403: errorResponse("No workspace access, or missing task:read permission"),
    404: errorResponse("The user is not a member of this workspace"),
  },
});

const workspace = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(getWorkspaceMembersRoute, async (c) =>
    c.json(await getWorkspaceMembersCtrl(c.get("workspaceId")), 200),
  )
  .openapi(getWorkspaceMemberTaskCountsRoute, async (c) =>
    c.json(await getMemberTaskCountsCtrl(c.get("workspaceId")), 200),
  )
  .openapi(getWorkspaceMemberTasksRoute, async (c) => {
    // The path userId is the member being viewed; c.get("userId") is the caller.
    const { userId } = c.req.valid("param");
    return c.json(await getMemberTasksCtrl(c.get("workspaceId"), userId), 200);
  });

export default workspace;
