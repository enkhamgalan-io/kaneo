import { createFileRoute } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import BacklogListView from "@/components/backlog-list-view";
import { BacklogToolbar } from "@/components/backlog-list-view/backlog-toolbar";
import { useBacklogFilters } from "@/components/backlog-list-view/use-backlog-filters";
import type { CrossProjectBacklog } from "@/components/board/cross-project";
import PageTitle from "@/components/page-title";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import { TaskProjectsProvider } from "@/components/task/task-projects-context";
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
import { Skeleton } from "@/components/ui/skeleton";
import useGetLabelsByWorkspace from "@/hooks/queries/label/use-get-labels-by-workspace";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useMemberTaskActions } from "@/hooks/use-member-task-actions";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { type SortConfig, sortTasks } from "@/lib/sort-tasks";
import type { ProjectWithTasks } from "@/types/project";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/members/$userId/backlog",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { data, workspaceId, userId, refreshSummary } = useMemberView();
  const { boards, isPending, isError, failedCount } = useMemberBoards();
  const { taskProjects, moveTask, getSharedColumns } = useMemberTaskActions(
    userId,
    boards,
  );
  const { canUpdateTasks, canCreateTasks } = useWorkspacePermission();
  const { data: users } = useGetActiveWorkspaceUsers(workspaceId);
  const { data: workspaceLabels = [] } = useGetLabelsByWorkspace(workspaceId);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [sort, setSort] = useState<SortConfig>({
    field: "position",
    direction: "asc",
  });
  const memberLabel = data.member.name || data.member.email;

  // Every project's Planned and Archived lists in one backlog, in project
  // order, so the project backlog's filters and list work on it unchanged.
  const mergedBacklog = useMemo<ProjectWithTasks | undefined>(
    () =>
      isPending
        ? undefined
        : {
            id: `member-${userId}`,
            name: memberLabel,
            slug: "",
            icon: null,
            description: null,
            isPublic: false,
            workspaceId,
            columns: [],
            plannedTasks: boards.flatMap((board) => board.plannedTasks),
            archivedTasks: boards.flatMap((board) => board.archivedTasks),
          },
    [isPending, userId, memberLabel, workspaceId, boards],
  );

  const {
    filters,
    updateFilter,
    updateLabelFilter,
    clearFilters,
    hasActiveFilters,
    filteredProject,
  } = useBacklogFilters(mergedBacklog);

  const sortedBacklog = useMemo(() => {
    if (!filteredProject || sort.field === "position") return filteredProject;
    return {
      ...filteredProject,
      plannedTasks: sortTasks(filteredProject.plannedTasks || [], sort),
      archivedTasks: sortTasks(filteredProject.archivedTasks || [], sort),
    };
  }, [filteredProject, sort]);

  const canCreate = Boolean(canCreateTasks());
  const crossProject = useMemo<CrossProjectBacklog>(
    () => ({
      onMoveTask: (task, status) => {
        void moveTask(task, status);
      },
      onCreateTask: canCreate ? () => setIsCreateOpen(true) : undefined,
      getSharedColumns,
    }),
    [moveTask, canCreate, getSharedColumns],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <PageTitle title={t("tasks:backlog.pageTitle", { name: memberLabel })} />
      {/* No "move all to To Do" here: a project may have renamed or removed
          that column, and the move cannot be undone across projects. */}
      <BacklogToolbar
        filters={filters}
        updateFilter={updateFilter}
        updateLabelFilter={updateLabelFilter}
        clearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
        sort={sort}
        onSortChange={setSort}
        users={users}
        workspaceLabels={workspaceLabels}
        onPlan={canCreate ? () => setIsCreateOpen(true) : undefined}
      />
      <MemberPartialLoadNotice failedCount={failedCount} />

      <div className="h-full flex-1 overflow-hidden bg-card">
        {isError ? (
          <Empty className="min-h-[50vh]">
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
        ) : !sortedBacklog ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((row) => (
              <Skeleton key={row} className="h-9" />
            ))}
          </div>
        ) : (
          <TaskProjectsProvider projects={taskProjects}>
            <BacklogListView
              project={sortedBacklog}
              disableDragDrop={!canUpdateTasks()}
              crossProject={crossProject}
            />
          </TaskProjectsProvider>
        )}
      </div>

      {/* Any project can take a planned task. Pre-assigned to the member so it
          lands in this backlog; closing refreshes the summary, which is what
          adds a project the member had no tasks in to the views. */}
      <CreateTaskModal
        open={isCreateOpen}
        status="planned"
        defaultAssigneeId={userId}
        onClose={() => {
          setIsCreateOpen(false);
          refreshSummary();
        }}
      />
    </div>
  );
}
