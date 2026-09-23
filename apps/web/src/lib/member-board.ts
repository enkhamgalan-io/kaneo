import type { TaskProjectInfo } from "@/components/task/task-projects-context";
import type { MemberBoard } from "@/hooks/queries/task/use-get-member-boards";

type BoardColumn = MemberBoard["columns"][number];
type BoardTask = BoardColumn["tasks"][number];

/**
 * One set of columns for a board that mixes projects, matched by status slug.
 * Projects are walked in the order given and each keeps its own column order.
 * A slug seen for the first time goes just before the next column its own
 * project shares with the board (and never before its own predecessor), so
 * earlier projects keep their layout and a custom column fills the gap where
 * its project put it: two default workflows collapse into the familiar four
 * columns. A column is final if any project marks it final and takes the first
 * name seen; each task's completion still comes from its own project.
 */
export function mergeBoardColumns(boards: MemberBoard[]): BoardColumn[] {
  const order: string[] = [];
  const merged = new Map<string, BoardColumn>();

  for (const board of boards) {
    let previousSlug: string | undefined;
    for (const [index, column] of board.columns.entries()) {
      const existing = merged.get(column.slug);
      if (existing) {
        merged.set(column.slug, {
          ...existing,
          isFinal: existing.isFinal || column.isFinal,
          tasks: [...existing.tasks, ...column.tasks],
        });
      } else {
        merged.set(column.slug, {
          ...column,
          id: column.slug,
          tasks: [...column.tasks],
        });
        const successor = board.columns
          .slice(index + 1)
          .find((later) => merged.has(later.slug));
        const successorIndex = successor
          ? order.indexOf(successor.slug)
          : order.length;
        const afterPredecessor =
          previousSlug === undefined ? 0 : order.indexOf(previousSlug) + 1;
        order.splice(
          Math.max(successorIndex, afterPredecessor),
          0,
          column.slug,
        );
      }
      previousSlug = column.slug;
    }
  }

  return order.flatMap((slug) => {
    const column = merged.get(slug);
    return column ? [column] : [];
  });
}

export function buildTaskProjects(
  boards: MemberBoard[],
): Map<string, TaskProjectInfo> {
  return new Map(
    boards.map((board) => [
      board.id,
      {
        id: board.id,
        slug: board.slug,
        workspaceId: board.workspaceId,
        columns: board.columns.map((column) => ({
          id: column.id,
          slug: column.slug,
          name: column.name,
          icon: column.icon,
          isFinal: column.isFinal,
        })),
      },
    ]),
  );
}

/**
 * The columns every given project has, in the first project's order and with
 * its names: the only statuses a bulk change across these projects can set
 * without the API refusing some of the tasks.
 */
export function sharedColumns(
  projects: TaskProjectInfo[],
): TaskProjectInfo["columns"] {
  const [first, ...rest] = projects;
  if (!first) return [];
  return first.columns.filter((column) =>
    rest.every((project) =>
      project.columns.some((other) => other.slug === column.slug),
    ),
  );
}

// Whether a status exists in the task's own project. Planned and archived are
// valid everywhere; any other slug has to be one of the project's columns.
export function projectHasStatus(
  project: TaskProjectInfo | undefined,
  status: string,
): boolean {
  if (status === "planned" || status === "archived") return true;
  return project?.columns.some((column) => column.slug === status) ?? false;
}

// A task's status is final by its own project's column, not by the merged
// column it is shown in.
export function isFinalInOwnProject(
  project: TaskProjectInfo | undefined,
  status: string,
): boolean {
  return (
    project?.columns.find((column) => column.slug === status)?.isFinal ?? false
  );
}

/**
 * The board with one task moved to `status`, appended to the end of its new
 * list. Positions are untouched: they belong to the whole project column,
 * which a member's filtered board only sees part of. Returns the board
 * unchanged when the task or the status is not on it.
 */
export function moveTaskInBoard(
  board: MemberBoard,
  taskId: string,
  status: string,
): MemberBoard {
  const task = [
    ...board.columns.flatMap((column) => column.tasks),
    ...board.plannedTasks,
    ...board.archivedTasks,
  ].find((candidate) => candidate.id === taskId);
  if (!task) return board;

  const isColumnStatus = status !== "planned" && status !== "archived";
  if (
    isColumnStatus &&
    !board.columns.some((column) => column.slug === status)
  ) {
    return board;
  }

  const moved: BoardTask = { ...task, status };
  const without = (tasks: BoardTask[]) =>
    tasks.filter((candidate) => candidate.id !== taskId);

  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      tasks:
        column.slug === status
          ? [...without(column.tasks), moved]
          : without(column.tasks),
    })),
    plannedTasks:
      status === "planned"
        ? [...without(board.plannedTasks), moved]
        : without(board.plannedTasks),
    archivedTasks:
      status === "archived"
        ? [...without(board.archivedTasks), moved]
        : without(board.archivedTasks),
  };
}
