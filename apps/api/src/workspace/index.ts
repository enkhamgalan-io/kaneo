import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import getMemberTaskCountsCtrl from "./controllers/get-member-task-counts";
import getMemberTasksCtrl from "./controllers/get-member-tasks";
import getWorkspaceMembersCtrl from "./controllers/get-workspace-members";

const memberTaskSchema = v.object({
  id: v.string(),
  number: v.nullable(v.number()),
  title: v.string(),
  status: v.string(),
  statusName: v.string(),
  priority: v.string(),
  startDate: v.nullable(v.string()),
  dueDate: v.nullable(v.string()),
  createdAt: v.string(),
  projectId: v.string(),
  isCompleted: v.boolean(),
  isOverdue: v.boolean(),
});

const memberTasksResponseSchema = v.object({
  member: v.object({
    userId: v.string(),
    name: v.string(),
    email: v.string(),
    image: v.nullable(v.string()),
    role: v.string(),
    joinedAt: v.string(),
  }),
  summary: v.object({
    total: v.number(),
    open: v.number(),
    overdue: v.number(),
    done: v.number(),
    backlog: v.number(),
    archived: v.number(),
    projectCount: v.number(),
    byStatus: v.array(
      v.object({
        slug: v.string(),
        name: v.string(),
        isFinal: v.boolean(),
        count: v.number(),
      }),
    ),
  }),
  projects: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      slug: v.string(),
      icon: v.nullable(v.string()),
      isArchived: v.boolean(),
      counts: v.object({
        total: v.number(),
        open: v.number(),
        overdue: v.number(),
        done: v.number(),
      }),
      tasks: v.array(memberTaskSchema),
    }),
  ),
});

const workspace = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/:workspaceId/members",
    describeRoute({
      operationId: "getWorkspaceMembers",
      tags: ["Workspaces"],
      description: "Get all members of a workspace",
      responses: {
        200: {
          description: "List of workspace members",
          content: {
            "application/json": {
              schema: resolver(
                v.array(
                  v.object({
                    id: v.string(),
                    name: v.string(),
                    email: v.string(),
                    image: v.nullable(v.string()),
                    role: v.string(),
                  }),
                ),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromParam("workspaceId"),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const members = await getWorkspaceMembersCtrl(workspaceId);
      return c.json(members);
    },
  )
  .get(
    "/:workspaceId/members/task-counts",
    describeRoute({
      operationId: "getWorkspaceMemberTaskCounts",
      tags: ["Workspaces"],
      description:
        "Get per-member open and overdue task counts for a workspace",
      responses: {
        200: {
          description: "Task counts keyed by member user id",
          content: {
            "application/json": {
              schema: resolver(
                v.array(
                  v.object({
                    userId: v.string(),
                    openCount: v.number(),
                    overdueCount: v.number(),
                  }),
                ),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ task: ["read"] }),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const counts = await getMemberTaskCountsCtrl(workspaceId);
      return c.json(counts);
    },
  )
  .get(
    "/:workspaceId/members/:userId/tasks",
    describeRoute({
      operationId: "getWorkspaceMemberTasks",
      tags: ["Workspaces"],
      description:
        "Get every task assigned to one workspace member, grouped by project",
      responses: {
        200: {
          description: "The member's tasks with a workspace-wide summary",
          content: {
            "application/json": {
              schema: resolver(memberTasksResponseSchema),
            },
          },
        },
        404: { description: "Member not found in this workspace" },
      },
    }),
    validator(
      "param",
      v.object({ workspaceId: v.string(), userId: v.string() }),
    ),
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ task: ["read"] }),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const { userId } = c.req.valid("param");
      const result = await getMemberTasksCtrl(workspaceId, userId);
      return c.json(result);
    },
  );

export default workspace;
