import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import { GanttTimeline } from "@/components/gantt/gantt-timeline";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import type Task from "@/types/task";

type GanttSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/gantt",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): GanttSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: project } = useGetTasks(projectId);

  const tasks = useMemo(
    () => [
      ...(project?.columns.flatMap((column) => column.tasks) ?? []),
      ...(project?.plannedTasks ?? []),
    ],
    [project],
  );

  const projectSlug = project?.slug;
  const getTaskKey = useCallback(
    (task: Task) => `${projectSlug ?? ""}-${task.number ?? ""}`,
    [projectSlug],
  );

  const handleOpenTask = useCallback(
    (nextTaskId: string) =>
      navigate({ to: ".", search: { taskId: nextTaskId }, replace: true }),
    [navigate],
  );

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="gantt"
    >
      <PageTitle
        title={t("tasks:gantt.pageTitle", { name: project?.name })}
        hideAppName
      />
      {/* The project selector swaps projectId on this same mounted route, so
          the timeline is told to re-center for the new project. */}
      <GanttTimeline
        tasks={tasks}
        getTaskKey={getTaskKey}
        resetKey={projectId}
        onOpenTask={handleOpenTask}
      />

      <TaskDetailsSheet
        taskId={taskId}
        projectId={projectId}
        workspaceId={workspaceId}
        onClose={() =>
          navigate({
            to: ".",
            search: {},
            replace: true,
          })
        }
      />
    </ProjectLayout>
  );
}
