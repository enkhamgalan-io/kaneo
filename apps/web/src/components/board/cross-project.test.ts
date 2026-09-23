import type { ClientRect, DroppableContainer } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import type Task from "@/types/task";
import { type CrossProjectBoard, crossProjectCollision } from "./cross-project";

function task(id: string, status: string, projectId: string): Task {
  return {
    id,
    title: id,
    number: 1,
    description: null,
    status,
    priority: "low",
    startDate: null,
    dueDate: null,
    position: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    userId: "user-1",
    assigneeId: "user-1",
    assigneeName: null,
    projectId,
  };
}

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  } satisfies ClientRect;
}

// Project A has no "qa" column; project B does. The merged board shows
// To Do | QA | Done side by side.
const aTask = task("a1", "to-do", "a");
const qaCard = task("b1", "qa", "b");
const columns = [
  { id: "to-do", slug: "to-do", tasks: [aTask] },
  { id: "qa", slug: "qa", tasks: [qaCard] },
  { id: "done", slug: "done", tasks: [] },
];
const statusesByProject: Record<string, string[]> = {
  a: ["to-do", "done"],
  b: ["to-do", "qa", "done"],
};
const crossProject: CrossProjectBoard = {
  canMoveTo: (t, status) =>
    statusesByProject[t.projectId]?.includes(status) ?? false,
  onMoveTask: () => {},
  getArchivableTasks: () => [],
  onArchiveTasks: () => {},
  getSharedColumns: () => [],
};

const rects = new Map<string, ClientRect>([
  ["to-do", rect(0, 0, 100, 400)],
  ["a1", rect(5, 10, 90, 40)],
  ["qa", rect(110, 0, 100, 400)],
  ["b1", rect(115, 10, 90, 40)],
  ["done", rect(220, 0, 100, 400)],
]);
const containers = [...rects.keys()].map(
  (id) =>
    ({ id, data: { current: undefined } }) as unknown as DroppableContainer,
);

function detect(collisionRect: ClientRect) {
  return crossProjectCollision(
    columns,
    crossProject,
  )({
    active: { id: "a1" } as never,
    collisionRect,
    droppableRects: rects,
    droppableContainers: containers,
    pointerCoordinates: null,
  });
}

describe("crossProjectCollision", () => {
  it("refuses a drop over a column the task's project lacks", () => {
    // Over the QA column, empty space below its card.
    expect(detect(rect(115, 200, 90, 40))).toEqual([]);
  });

  it("refuses a drop onto a card inside such a column", () => {
    expect(detect(rect(115, 10, 90, 40))).toEqual([]);
  });

  it("does not redirect a refused drop to the nearest allowed column", () => {
    // The regression: filtering refused columns out before resolving let the
    // neighbouring Done or To Do column win.
    const result = detect(rect(125, 150, 90, 40));
    expect(result.map((collision) => collision.id)).not.toContain("done");
    expect(result).toEqual([]);
  });

  it("allows a drop over a column the task's project has", () => {
    expect(detect(rect(225, 200, 90, 40))[0]?.id).toBe("done");
  });
});
