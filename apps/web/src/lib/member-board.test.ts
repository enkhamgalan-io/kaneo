import { describe, expect, it } from "vitest";
import type { MemberBoard } from "@/hooks/queries/task/use-get-member-boards";
import {
  buildTaskProjects,
  isFinalInOwnProject,
  mergeBoardColumns,
  moveTaskInBoard,
  projectHasStatus,
} from "./member-board";

type Task = MemberBoard["columns"][number]["tasks"][number];

function task(id: string, status: string, projectId: string): Task {
  return {
    id,
    title: id,
    number: 1,
    description: "keep me",
    status,
    priority: "low",
    startDate: null,
    dueDate: null,
    position: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    userId: "user-1",
    assigneeName: "Ada",
    assigneeId: "user-1",
    assigneeImage: null,
    projectId,
    labels: [],
    externalLinks: [],
  };
}

function board(
  id: string,
  columns: Array<[slug: string, isFinal: boolean, tasks?: Task[]]>,
  extra: Partial<MemberBoard> = {},
): MemberBoard {
  return {
    id,
    name: id,
    slug: id.toUpperCase(),
    icon: null,
    description: null,
    isPublic: false,
    workspaceId: "workspace-1",
    columns: columns.map(([slug, isFinal, tasks = []]) => ({
      id: slug,
      slug,
      name: `${id}:${slug}`,
      icon: null,
      isFinal,
      tasks,
    })),
    plannedTasks: [],
    archivedTasks: [],
    ...extra,
  };
}

const DEFAULT: Array<[string, boolean]> = [
  ["to-do", false],
  ["in-progress", false],
  ["in-review", false],
  ["done", true],
];

describe("mergeBoardColumns", () => {
  it("collapses identical workflows into one set of columns", () => {
    const merged = mergeBoardColumns([
      board("a", DEFAULT),
      board("b", DEFAULT),
    ]);
    expect(merged.map((column) => column.slug)).toEqual([
      "to-do",
      "in-progress",
      "in-review",
      "done",
    ]);
  });

  it("puts a custom column where its own project put it", () => {
    const merged = mergeBoardColumns([
      board("a", DEFAULT),
      board("b", [
        ["to-do", false],
        ["in-progress", false],
        ["qa", false],
        ["done", true],
      ]),
    ]);
    expect(merged.map((column) => column.slug)).toEqual([
      "to-do",
      "in-progress",
      "in-review",
      "qa",
      "done",
    ]);
  });

  it("keeps consecutive new columns in their project's order", () => {
    const merged = mergeBoardColumns([
      board("a", [
        ["to-do", false],
        ["done", true],
      ]),
      board("b", [
        ["to-do", false],
        ["design", false],
        ["build", false],
        ["done", true],
      ]),
    ]);
    expect(merged.map((column) => column.slug)).toEqual([
      "to-do",
      "design",
      "build",
      "done",
    ]);
  });

  it("concatenates tasks in project order and takes the first name seen", () => {
    const merged = mergeBoardColumns([
      board("a", [["to-do", false, [task("a1", "to-do", "a")]]]),
      board("b", [["to-do", false, [task("b1", "to-do", "b")]]]),
    ]);
    expect(merged[0]?.tasks.map((t) => t.id)).toEqual(["a1", "b1"]);
    expect(merged[0]?.name).toBe("a:to-do");
  });

  it("marks a column final when any project does", () => {
    const merged = mergeBoardColumns([
      board("a", [["shipped", false]]),
      board("b", [["shipped", true]]),
    ]);
    expect(merged[0]?.isFinal).toBe(true);
  });

  it("does not mutate the boards it merges", () => {
    const source = board("a", [["to-do", false, [task("a1", "to-do", "a")]]]);
    mergeBoardColumns([source, board("b", [["to-do", false]])]);
    expect(source.columns[0]?.tasks).toHaveLength(1);
  });
});

describe("per-project status checks", () => {
  const projects = buildTaskProjects([
    board("a", DEFAULT),
    board("b", [
      ["to-do", false],
      ["shipped", true],
    ]),
  ]);

  it("only allows statuses the task's own project has", () => {
    expect(projectHasStatus(projects.get("a"), "in-review")).toBe(true);
    expect(projectHasStatus(projects.get("b"), "in-review")).toBe(false);
    expect(projectHasStatus(projects.get("b"), "shipped")).toBe(true);
  });

  it("always allows the backlog and the archive", () => {
    expect(projectHasStatus(projects.get("b"), "planned")).toBe(true);
    expect(projectHasStatus(projects.get("b"), "archived")).toBe(true);
  });

  it("refuses everything for an unknown project", () => {
    expect(projectHasStatus(undefined, "to-do")).toBe(false);
  });

  it("judges finality by the task's own project", () => {
    expect(isFinalInOwnProject(projects.get("a"), "done")).toBe(true);
    expect(isFinalInOwnProject(projects.get("b"), "done")).toBe(false);
    expect(isFinalInOwnProject(projects.get("b"), "shipped")).toBe(true);
  });
});

describe("moveTaskInBoard", () => {
  const source = board(
    "a",
    [
      ["to-do", false, [task("t1", "to-do", "a"), task("t2", "to-do", "a")]],
      ["done", true, [task("t3", "done", "a")]],
    ],
    { plannedTasks: [task("p1", "planned", "a")] },
  );

  it("moves a task to the end of another column and sets its status", () => {
    const moved = moveTaskInBoard(source, "t1", "done");
    expect(moved.columns[0]?.tasks.map((t) => t.id)).toEqual(["t2"]);
    expect(moved.columns[1]?.tasks.map((t) => t.id)).toEqual(["t3", "t1"]);
    expect(moved.columns[1]?.tasks[1]?.status).toBe("done");
  });

  it("keeps every other field, so a later whole-task write stays safe", () => {
    const moved = moveTaskInBoard(source, "t1", "done");
    const t1 = moved.columns[1]?.tasks.find((t) => t.id === "t1");
    expect(t1?.description).toBe("keep me");
    expect(t1?.userId).toBe("user-1");
    expect(t1?.position).toBe(0);
  });

  it("moves between the board and the backlog or archive", () => {
    expect(
      moveTaskInBoard(source, "p1", "to-do").columns[0]?.tasks.map((t) => t.id),
    ).toEqual(["t1", "t2", "p1"]);
    const archived = moveTaskInBoard(source, "t3", "archived");
    expect(archived.archivedTasks.map((t) => t.id)).toEqual(["t3"]);
    expect(archived.columns[1]?.tasks).toHaveLength(0);
  });

  it("leaves the board untouched for a status the project does not have", () => {
    expect(moveTaskInBoard(source, "t1", "in-review")).toBe(source);
  });

  it("leaves the board untouched for a task that is not on it", () => {
    expect(moveTaskInBoard(source, "missing", "done")).toBe(source);
  });
});
