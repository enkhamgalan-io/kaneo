import { type CollisionDetection, closestCorners } from "@dnd-kit/core";
import type { SortingStrategy } from "@dnd-kit/sortable";
import type { TaskProjectColumn } from "@/components/task/task-projects-context";
import type Task from "@/types/task";

// Columns a bulk status change may offer for a selection that can span
// projects: only statuses every selected task's own project has.
export type GetSharedColumns = (taskIds: string[]) => TaskProjectColumn[];

/**
 * Behaviour for a board whose columns merge several projects (a member's
 * tasks). Without it, a board is a single project's and keeps its usual
 * reorder-and-renumber drag.
 */
export type CrossProjectBoard = {
  // Whether the task's own project has this status. Drops anywhere else are
  // refused before any request is sent.
  canMoveTo: (task: Task, status: string) => boolean;
  // A status-only move. Positions are never rewritten: they belong to the
  // whole project column, which a merged board only sees part of.
  onMoveTask: (task: Task, status: string) => void;
  // Of a merged column's tasks, the ones whose own project marks it final.
  getArchivableTasks: (tasks: Task[]) => Task[];
  onArchiveTasks: (tasks: Task[]) => void;
  // Omitted to hide the create buttons.
  onCreateTask?: (status: string) => void;
  getSharedColumns: GetSharedColumns;
};

/**
 * The backlog's version: planned and archived exist in every project, so any
 * drop between the two sections is valid; only reordering is off.
 */
export type CrossProjectBacklog = {
  onMoveTask: (task: Task, status: "planned" | "archived") => void;
  onCreateTask?: () => void;
  getSharedColumns: GetSharedColumns;
};

// Keeps cards in place while dragging: with reordering off, shuffling the
// column under the pointer would promise an order the drop never saves.
export const keepInPlaceSortingStrategy: SortingStrategy = () => null;

type DroppableColumn = { id: string; slug: string; tasks: Task[] };

/**
 * Collision detection that refuses a drop on a column the dragged task's own
 * project lacks. It resolves the target among every column first and then
 * returns no collision when that target is refused; filtering the refused
 * columns out beforehand would instead let the nearest allowed column win,
 * quietly moving the task to a status the user never picked.
 */
export function crossProjectCollision(
  columns: DroppableColumn[],
  crossProject: CrossProjectBoard,
): CollisionDetection {
  const taskById = new Map<string, Task>();
  const columnIdByTaskId = new Map<string, string>();
  const columnSlugById = new Map<string, string>();
  for (const column of columns) {
    columnSlugById.set(column.id, column.slug);
    for (const task of column.tasks) {
      taskById.set(task.id, task);
      columnIdByTaskId.set(task.id, column.id);
    }
  }

  return (args) => {
    const collisions = closestCorners(args);
    const activeTask = taskById.get(String(args.active.id));
    const target = collisions[0];
    if (!activeTask || !target) return collisions;

    const targetId = String(target.id);
    const columnId = columnSlugById.has(targetId)
      ? targetId
      : columnIdByTaskId.get(targetId);
    const slug = columnId ? columnSlugById.get(columnId) : undefined;
    if (slug === undefined) return collisions;

    return crossProject.canMoveTo(activeTask, slug) ? collisions : [];
  };
}
