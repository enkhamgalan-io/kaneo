import { nullableResponseTimestamp, responseTimestamp, z } from "../openapi";

export const workspaceMemberSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
    role: z.string().openapi({
      description:
        "The member's workspace role: a built-in role (owner, admin, member, guest) or a custom role name.",
    }),
  })
  .openapi("WorkspaceMember");

export const workspaceMemberListSchema = z.array(workspaceMemberSchema);

const memberTaskCountSchema = z
  .object({
    userId: z.string(),
    openCount: z.number().openapi({
      description:
        "Assigned tasks that are neither finished nor in the backlog (planned).",
    }),
    overdueCount: z.number().openapi({
      description:
        "Assigned, unfinished tasks whose due date has passed, backlog included.",
    }),
  })
  .openapi("MemberTaskCount");

export const memberTaskCountListSchema = z.array(memberTaskCountSchema);

const memberTaskSchema = z
  .object({
    id: z.string(),
    number: z.number().nullable().openapi({
      description: "Per-project counter shown as {projectSlug}-{number}.",
    }),
    title: z.string(),
    status: z.string().openapi({
      description:
        "The column slug, or planned/archived for the backlog and archive.",
    }),
    statusName: z.string().openapi({
      description:
        "The column's display name, or one derived from the slug when the status has no column.",
    }),
    priority: z.string().openapi({
      description: "One of: no-priority, low, medium, high, urgent.",
    }),
    startDate: nullableResponseTimestamp,
    dueDate: nullableResponseTimestamp,
    createdAt: responseTimestamp,
    projectId: z.string(),
    isCompleted: z.boolean().openapi({
      description:
        "True when the task's column is marked final or the task is archived. Without a matching column, only the done slug counts.",
    }),
    isOverdue: z.boolean().openapi({
      description: "Not completed and past its due date.",
    }),
  })
  .openapi("MemberTask");

const memberTaskProjectCountsSchema = z
  .object({
    total: z.number(),
    open: z.number(),
    overdue: z.number(),
    done: z.number(),
  })
  .openapi({
    description:
      "Open and done leave out backlog and archived tasks; total includes them.",
  })
  .openapi("MemberTaskProjectCounts");

const memberTaskProjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    icon: z.string().nullable(),
    isArchived: z.boolean(),
    counts: memberTaskProjectCountsSchema,
    tasks: z.array(memberTaskSchema),
  })
  .openapi("MemberTaskProject");

export const memberTasksSchema = z
  .object({
    member: z
      .object({
        userId: z.string(),
        name: z.string(),
        email: z.string(),
        image: z.string().nullable(),
        role: z.string(),
        joinedAt: responseTimestamp,
      })
      .openapi("MemberTasksMember"),
    summary: z
      .object({
        total: z.number(),
        open: z.number(),
        overdue: z.number(),
        done: z.number(),
        backlog: z.number(),
        archived: z.number(),
        projectCount: z.number(),
        byStatus: z.array(
          z
            .object({
              slug: z.string(),
              name: z.string(),
              isFinal: z.boolean().openapi({
                description: "Whether tasks in this status count as completed.",
              }),
              count: z.number(),
            })
            .openapi("MemberTaskStatusCount"),
        ),
      })
      .openapi({
        description:
          "Open, done, backlog and archived are exclusive and sum to total; overdue overlaps them.",
      })
      .openapi("MemberTasksSummary"),
    projects: z.array(memberTaskProjectSchema).openapi({
      description:
        "Only projects with a task assigned to the member, in workspace order.",
    }),
  })
  .openapi("MemberTasks");
