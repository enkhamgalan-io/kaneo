import { createFileRoute } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GanttTimeline } from "@/components/gantt/gantt-timeline";
import PageTitle from "@/components/page-title";
import { MemberPartialLoadNotice } from "@/components/team/member-partial-load-notice";
import { useMemberView } from "@/components/team/member-view-context";
import { useMemberBoards } from "@/components/team/use-member-boards";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import getTask from "@/fetchers/task/get-task";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import type Task from "@/types/task";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/members/$userId/gantt",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { data, userId, openTask } = useMemberView();
  const { boards, isPending, isError, failedCount } = useMemberBoards();
  const { mutateAsync: updateTask } = useUpdateTask();

  // Board tasks, not the summary's trimmed ones: dragging a bar writes the
  // whole task back, and a trimmed task would blank its description.
  const tasks = useMemo(
    () =>
      isPending
        ? []
        : boards.flatMap((board) => [
            ...board.columns.flatMap((column) => column.tasks),
            ...board.plannedTasks,
          ]),
    [boards, isPending],
  );

  const slugByProjectId = useMemo(
    () => new Map(boards.map((board) => [board.id, board.slug])),
    [boards],
  );

  const getTaskKey = useCallback(
    (task: Task) =>
      `${slugByProjectId.get(task.projectId) ?? ""}-${task.number ?? ""}`,
    [slugByProjectId],
  );

  // A bar drag writes the whole task. A project Gantt's copy is kept fresh by
  // the project socket; this page has none and polls, so its copy can be a
  // poll old. Writing the new dates onto the task as the server has it now
  // keeps a teammate's recent edit from being overwritten.
  const persistDates = useCallback(
    async (task: Task, startDate: string, dueDate: string) => {
      const current = await getTask(task.id);
      await updateTask({ ...task, ...current, startDate, dueDate });
    },
    [updateTask],
  );

  const pageTitle = (
    <PageTitle
      title={t("tasks:gantt.pageTitle", {
        name: data.member.name || data.member.email,
      })}
      hideAppName
    />
  );

  if (isPending) {
    return (
      <div className="border-b border-border/80 px-4 py-3 text-center">
        {pageTitle}
        <p className="text-sm text-muted-foreground">
          {t("common:empty.loading")}
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <Empty className="min-h-[50vh]">
        {pageTitle}
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>{t("team:memberTasks.loadErrorTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("team:memberTasks.loadErrorDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {pageTitle}
      <MemberPartialLoadNotice failedCount={failedCount} />
      <div className="min-h-0 flex-1">
        <GanttTimeline
          tasks={tasks}
          getTaskKey={getTaskKey}
          resetKey={userId}
          onOpenTask={openTask}
          onPersistDates={persistDates}
        />
      </div>
    </div>
  );
}
