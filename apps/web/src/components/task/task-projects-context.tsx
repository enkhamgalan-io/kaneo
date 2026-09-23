import { createContext, type ReactNode, useContext } from "react";
import useProjectStore from "@/store/project";

export type TaskProjectColumn = {
  id: string;
  slug: string;
  name: string;
  icon?: string | null;
  isFinal: boolean;
};

export type TaskProjectInfo = {
  id: string;
  slug: string;
  workspaceId: string;
  columns: TaskProjectColumn[];
};

const TaskProjectsContext = createContext<Map<string, TaskProjectInfo> | null>(
  null,
);

// Shared task components (cards, rows, the context menu) need the task's own
// project for its key prefix, completion and status options. A project board
// has one project, kept in the global store; a view that mixes projects wraps
// its tasks in this provider so each task resolves to its own.
export function TaskProjectsProvider({
  projects,
  children,
}: {
  projects: Map<string, TaskProjectInfo>;
  children: ReactNode;
}) {
  return (
    <TaskProjectsContext.Provider value={projects}>
      {children}
    </TaskProjectsContext.Provider>
  );
}

export function useTaskProject(
  projectId: string | undefined,
): TaskProjectInfo | undefined {
  const projects = useContext(TaskProjectsContext);
  const { project: storeProject } = useProjectStore();
  if (projects) return projectId ? projects.get(projectId) : undefined;
  return storeProject;
}
