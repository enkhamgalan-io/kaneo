import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { assertProjectAccess } from "./project-access";
import { validateWorkspaceAccess } from "./validate-workspace-access";

type LookupResource =
  | "project"
  | "task"
  | "label"
  | "timeEntry"
  | "activity"
  | "comment"
  | "column"
  | "workflowRule"
  | "taskRelation";

type WorkspaceIdSource =
  | { type: "query"; key: string }
  | { type: "body"; key: string }
  | { type: "param"; key: string }
  | { type: "lookup"; resource: LookupResource; idKey: string }
  | { type: "lookupMany"; resource: "task"; idKey: string };

// A second record named in the JSON body that the route also acts on, e.g. the
// destination project of a move or the target task of a relation. It must be
// in the same workspace, and its project is checked along with the first.
type AlsoSource = {
  key: string;
  resource: "project" | "task";
  optional?: boolean;
};

type WorkspaceAccessMiddlewareConfig = {
  sources: WorkspaceIdSource[];
  also?: AlsoSource[];
  // The record the route acts on must be found through a lookup; such a route
  // never falls back to authorizing at workspace level.
  requireLookup?: boolean;
};

type Resolved = { workspaceId: string; projectIds: string[] };

const NOT_FOUND: Record<LookupResource, string> = {
  project: "Project not found",
  task: "Task not found",
  label: "Label not found",
  timeEntry: "Time entry not found",
  activity: "Activity not found",
  comment: "Comment not found",
  column: "Column not found",
  workflowRule: "Workflow rule not found",
  taskRelation: "Task relation not found",
};

async function readJsonObjectBody(
  c: Context,
): Promise<Record<string, unknown>> {
  const raw = (await c.req.json().catch(() => ({}))) || {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}

export function workspaceAccessMiddleware(
  config: WorkspaceAccessMiddlewareConfig,
) {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId");

    if (!userId) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    let resolved: Resolved | null = null;
    // Which lookup produced the project ids, for a 404 that names it.
    let resolvedFrom: LookupResource | null = null;

    for (const source of config.sources) {
      if (source.type === "query") {
        const workspaceId = c.req.query(source.key);
        if (workspaceId) resolved = { workspaceId, projectIds: [] };
      } else if (source.type === "body") {
        const body = await readJsonObjectBody(c);
        const bodyValue = body[source.key];
        if (typeof bodyValue === "string" && bodyValue) {
          resolved = { workspaceId: bodyValue, projectIds: [] };
        }
      } else if (source.type === "param") {
        const workspaceId = c.req.param(source.key);
        if (workspaceId) resolved = { workspaceId, projectIds: [] };
      } else if (source.type === "lookup") {
        const body = await readJsonObjectBody(c);
        const bodyId = body[source.idKey];
        const idFromBody = typeof bodyId === "string" ? bodyId : null;
        // Only accept the id from the same place the handler will read it
        // (path param or JSON body). Accepting it from the query string let a
        // caller authorize against one resource (`?taskId=<mine>`) while the
        // handler acted on another (`{"taskId": "<someone else's>"}`).
        const id = c.req.param(source.idKey) || idFromBody;
        if (id) {
          // An id that was given but matches nothing is a 404, never a
          // reason to fall through to a looser source such as ?workspaceId=.
          const found = await lookup(source.resource, id);
          if (!found) {
            throw new HTTPException(404, {
              message: NOT_FOUND[source.resource],
            });
          }
          resolved = found;
          resolvedFrom = source.resource;
        }
      } else if (source.type === "lookupMany") {
        const body = await readJsonObjectBody(c);
        const ids = body[source.idKey];
        if (Array.isArray(ids)) {
          const taskIds = [
            ...new Set(
              ids.filter((id): id is string => typeof id === "string"),
            ),
          ];
          if (taskIds.length > 0) {
            const tasks = await db
              .select({
                workspaceId: schema.projectTable.workspaceId,
                projectId: schema.taskTable.projectId,
              })
              .from(schema.taskTable)
              .innerJoin(
                schema.projectTable,
                eq(schema.taskTable.projectId, schema.projectTable.id),
              )
              .where(inArray(schema.taskTable.id, taskIds));
            // Every id must exist: dropping unknown ones would let a caller
            // tell them apart from tasks in a hidden project, which fail below
            // with the same message.
            if (tasks.length !== taskIds.length) {
              throw new HTTPException(404, { message: NOT_FOUND.task });
            }
            const workspaceIds = [
              ...new Set(tasks.map((task) => task.workspaceId)),
            ];
            if (workspaceIds.length > 1) {
              throw new HTTPException(400, {
                message: "All tasks must belong to the same workspace",
              });
            }
            resolved = {
              workspaceId: workspaceIds[0] as string,
              projectIds: [...new Set(tasks.map((task) => task.projectId))],
            };
            resolvedFrom = "task";
          }
        }
      }

      if (resolved) {
        break;
      }
    }

    if (!resolved) {
      throw new HTTPException(400, {
        message: "Workspace ID could not be determined",
      });
    }

    if (config.requireLookup && !resolvedFrom) {
      throw new HTTPException(400, {
        message: "Workspace ID could not be determined",
      });
    }

    const alsoFound: Array<{ resource: LookupResource; projectIds: string[] }> =
      [];

    for (const also of config.also ?? []) {
      const body = await readJsonObjectBody(c);
      const value = body[also.key];
      const id = typeof value === "string" && value ? value : null;
      if (!id) {
        if (also.optional) continue;
        throw new HTTPException(400, { message: `${also.key} is required` });
      }
      const found = await lookup(also.resource, id);
      if (!found) {
        throw new HTTPException(404, { message: NOT_FOUND[also.resource] });
      }
      if (found.workspaceId !== resolved.workspaceId) {
        throw new HTTPException(400, {
          message: "All records must belong to the same workspace",
        });
      }
      alsoFound.push({ resource: also.resource, projectIds: found.projectIds });
    }

    const apiKey = c.get("apiKey");
    const apiKeyId = apiKey?.id;

    await validateWorkspaceAccess(userId, resolved.workspaceId, apiKeyId);

    c.set("workspaceId", resolved.workspaceId);

    // Inside the workspace, a user who lacks project:access_all reaches only
    // projects they are a member of. Each record is checked with its own 404,
    // the message it would get if it did not exist, so a hidden record cannot
    // be told apart from a missing one.
    await assertProjectAccess(
      c,
      resolved.projectIds,
      NOT_FOUND[resolvedFrom ?? "project"],
    );
    for (const found of alsoFound) {
      await assertProjectAccess(c, found.projectIds, NOT_FOUND[found.resource]);
    }
    c.set("projectIds", [
      ...new Set([
        ...resolved.projectIds,
        ...alsoFound.flatMap((found) => found.projectIds),
      ]),
    ]);

    return next();
  };
}

/**
 * The workspace a record belongs to and the project(s) it lives in. A
 * workspace-level label (not attached to a task) has no project. Lookup errors
 * propagate: swallowing them would let a request continue with nothing
 * resolved, skipping the project check.
 */
async function lookup(
  resource: LookupResource,
  id: string,
): Promise<Resolved | null> {
  switch (resource) {
    case "project": {
      const [project] = await db
        .select({ workspaceId: schema.projectTable.workspaceId })
        .from(schema.projectTable)
        .where(eq(schema.projectTable.id, id))
        .limit(1);
      return project
        ? { workspaceId: project.workspaceId, projectIds: [id] }
        : null;
    }

    case "task": {
      const [task] = await db
        .select({
          workspaceId: schema.projectTable.workspaceId,
          projectId: schema.taskTable.projectId,
        })
        .from(schema.taskTable)
        .innerJoin(
          schema.projectTable,
          eq(schema.taskTable.projectId, schema.projectTable.id),
        )
        .where(eq(schema.taskTable.id, id))
        .limit(1);
      return task
        ? { workspaceId: task.workspaceId, projectIds: [task.projectId] }
        : null;
    }

    case "label": {
      const [label] = await db
        .select({
          workspaceId: schema.labelTable.workspaceId,
          projectId: schema.taskTable.projectId,
        })
        .from(schema.labelTable)
        .leftJoin(
          schema.taskTable,
          eq(schema.labelTable.taskId, schema.taskTable.id),
        )
        .where(eq(schema.labelTable.id, id))
        .limit(1);
      if (!label?.workspaceId) return null;
      return {
        workspaceId: label.workspaceId,
        projectIds: label.projectId ? [label.projectId] : [],
      };
    }

    case "timeEntry": {
      const [timeEntry] = await db
        .select({
          workspaceId: schema.projectTable.workspaceId,
          projectId: schema.taskTable.projectId,
        })
        .from(schema.timeEntryTable)
        .innerJoin(
          schema.taskTable,
          eq(schema.timeEntryTable.taskId, schema.taskTable.id),
        )
        .innerJoin(
          schema.projectTable,
          eq(schema.taskTable.projectId, schema.projectTable.id),
        )
        .where(eq(schema.timeEntryTable.id, id))
        .limit(1);
      return timeEntry
        ? {
            workspaceId: timeEntry.workspaceId,
            projectIds: [timeEntry.projectId],
          }
        : null;
    }

    case "activity":
    case "comment": {
      const [activity] = await db
        .select({
          workspaceId: schema.projectTable.workspaceId,
          projectId: schema.taskTable.projectId,
        })
        .from(schema.activityTable)
        .innerJoin(
          schema.taskTable,
          eq(schema.activityTable.taskId, schema.taskTable.id),
        )
        .innerJoin(
          schema.projectTable,
          eq(schema.taskTable.projectId, schema.projectTable.id),
        )
        .where(
          resource === "comment"
            ? and(
                eq(schema.activityTable.id, id),
                eq(schema.activityTable.type, "comment"),
              )
            : eq(schema.activityTable.id, id),
        )
        .limit(1);
      return activity
        ? {
            workspaceId: activity.workspaceId,
            projectIds: [activity.projectId],
          }
        : null;
    }

    case "column": {
      const [column] = await db
        .select({
          workspaceId: schema.projectTable.workspaceId,
          projectId: schema.columnTable.projectId,
        })
        .from(schema.columnTable)
        .innerJoin(
          schema.projectTable,
          eq(schema.columnTable.projectId, schema.projectTable.id),
        )
        .where(eq(schema.columnTable.id, id))
        .limit(1);
      return column
        ? { workspaceId: column.workspaceId, projectIds: [column.projectId] }
        : null;
    }

    case "workflowRule": {
      const [workflowRule] = await db
        .select({
          workspaceId: schema.projectTable.workspaceId,
          projectId: schema.workflowRuleTable.projectId,
        })
        .from(schema.workflowRuleTable)
        .innerJoin(
          schema.projectTable,
          eq(schema.workflowRuleTable.projectId, schema.projectTable.id),
        )
        .where(eq(schema.workflowRuleTable.id, id))
        .limit(1);
      return workflowRule
        ? {
            workspaceId: workflowRule.workspaceId,
            projectIds: [workflowRule.projectId],
          }
        : null;
    }

    case "taskRelation": {
      // A relation joins two tasks, possibly in different projects; acting on
      // it requires access to both.
      const sourceTask = alias(schema.taskTable, "source_task");
      const targetTask = alias(schema.taskTable, "target_task");
      const [relation] = await db
        .select({
          workspaceId: schema.projectTable.workspaceId,
          sourceProjectId: sourceTask.projectId,
          targetProjectId: targetTask.projectId,
        })
        .from(schema.taskRelationTable)
        .innerJoin(
          sourceTask,
          eq(schema.taskRelationTable.sourceTaskId, sourceTask.id),
        )
        .innerJoin(
          targetTask,
          eq(schema.taskRelationTable.targetTaskId, targetTask.id),
        )
        .innerJoin(
          schema.projectTable,
          eq(sourceTask.projectId, schema.projectTable.id),
        )
        .where(eq(schema.taskRelationTable.id, id))
        .limit(1);
      return relation
        ? {
            workspaceId: relation.workspaceId,
            projectIds: [relation.sourceProjectId, relation.targetProjectId],
          }
        : null;
    }
  }
}

type LookupOptions = { also?: AlsoSource[] };

// Project-scoped: the id is required (path param or JSON body) and its
// project is checked. No ?workspaceId= fallback: an id that is missing or
// matches nothing never degrades to a workspace-level check.
function projectScoped(
  resource: LookupResource,
  idKey: string,
  options?: LookupOptions,
) {
  return workspaceAccessMiddleware({
    sources: [{ type: "lookup", resource, idKey }],
    also: options?.also,
    requireLookup: true,
  });
}

export const workspaceAccess = {
  fromQuery: (key = "workspaceId") =>
    workspaceAccessMiddleware({ sources: [{ type: "query", key }] }),

  fromBody: (key = "workspaceId", options?: LookupOptions) =>
    workspaceAccessMiddleware({
      sources: [{ type: "body", key }],
      also: options?.also,
    }),

  fromParam: (key = "workspaceId") =>
    workspaceAccessMiddleware({ sources: [{ type: "param", key }] }),

  fromProject: (idKey = "id", options?: LookupOptions) =>
    projectScoped("project", idKey, options),

  fromTask: (idKey = "id", options?: LookupOptions) =>
    projectScoped("task", idKey, options),

  fromTaskId: (idKey = "taskId", options?: LookupOptions) =>
    projectScoped("task", idKey, options),

  fromTasks: (idKey = "taskIds") =>
    workspaceAccessMiddleware({
      sources: [{ type: "lookupMany", resource: "task", idKey }],
      requireLookup: true,
    }),

  // Labels are workspace vocabulary: a label that is not attached to a task
  // has no project, so only the workspace is checked for it.
  fromLabel: (idKey = "id", options?: LookupOptions) =>
    workspaceAccessMiddleware({
      sources: [{ type: "lookup", resource: "label", idKey }],
      also: options?.also,
      requireLookup: true,
    }),

  fromTimeEntry: (idKey = "id") => projectScoped("timeEntry", idKey),

  fromActivity: (idKey = "id") => projectScoped("activity", idKey),

  fromComment: (idKey = "id") => projectScoped("comment", idKey),

  fromColumn: (idKey = "id") => projectScoped("column", idKey),

  fromWorkflowRule: (idKey = "id") => projectScoped("workflowRule", idKey),

  fromTaskRelation: (idKey = "id") => projectScoped("taskRelation", idKey),
};
