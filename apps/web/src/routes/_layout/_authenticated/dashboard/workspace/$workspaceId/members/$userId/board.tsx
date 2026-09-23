import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import BoardToolbar from "@/components/board/board-toolbar";
import type { CrossProjectBoard } from "@/components/board/cross-project";
import KanbanBoard from "@/components/kanban-board";
import ListView from "@/components/list-view";
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
import { useBoardSort } from "@/hooks/use-board-sort";
import { useMemberTaskActions } from "@/hooks/use-member-task-actions";
import { useTaskFiltersWithLabelsSupport } from "@/hooks/use-task-filters-with-labels-support";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import {
  isFinalInOwnProject,
  mergeBoardColumns,
  projectHasStatus,
} from "@/lib/member-board";
import { sortTasks } from "@/lib/sort-tasks";
import { toast } from "@/lib/toast";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type { ProjectWithTasks } from "@/types/project";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/members/$userId/board",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { data, workspaceId, userId, projectIds, refreshSummary } =
    useMemberView();
  const { boards, isPending, isError, failedCount } = useMemberBoards();
  const { taskProjects, moveTask, getSharedColumns, projectIdsWithStatus } =
    useMemberTaskActions(userId, boards);
  const { viewMode, setViewMode } = useUserPreferencesStore();
  const { canUpdateTasks, canCreateTasks } = useWorkspacePermission();
  // The column a new task is being created in, or null while the dialog is
  // closed.
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const { data: users } = useGetActiveWorkspaceUsers(workspaceId);
  const { data: workspaceLabels = [] } = useGetLabelsByWorkspace(workspaceId);
  // Filters and sort persist per member, apart from any project board's.
  const viewKey = `member-${userId}`;
  const { sort, setSort } = useBoardSort(viewKey);
  const memberLabel = data.member.name || data.member.email;

  // One board-shaped view over every project, so the project board's toolbar,
  // filters, kanban and list all work on it unchanged.
  const mergedBoard = useMemo<ProjectWithTasks | undefined>(
    () =>
      isPending
        ? undefined
        : {
            id: viewKey,
            name: memberLabel,
            slug: "",
            icon: null,
            description: null,
            isPublic: false,
            workspaceId,
            columns: mergeBoardColumns(boards),
            plannedTasks: [],
            archivedTasks: [],
          },
    [isPending, viewKey, memberLabel, workspaceId, boards],
  );

  const {
    filters,
    updateFilter,
    updateLabelFilter,
    filteredProject,
    hasActiveFilters,
    clearFilters,
  } = useTaskFiltersWithLabelsSupport(mergedBoard, viewKey);

  const sortedBoard = useMemo(() => {
    if (!filteredProject || sort.field === "position") return filteredProject;
    return {
      ...filteredProject,
      columns: filteredProject.columns.map((column) => ({
        ...column,
        tasks: sortTasks(column.tasks, sort),
      })),
    };
  }, [filteredProject, sort]);

  const crossProject = useMemo<CrossProjectBoard>(
    () => ({
      canMoveTo: (task, status) =>
        projectHasStatus(taskProjects.get(task.projectId), status),
      onMoveTask: (task, status) => {
        void moveTask(task, status);
      },
      getArchivableTasks: (tasks) =>
        tasks.filter((task) =>
          isFinalInOwnProject(taskProjects.get(task.projectId), task.status),
        ),
      onArchiveTasks: (tasks) => {
        void Promise.all(tasks.map((task) => moveTask(task, "archived"))).then(
          (results) => {
            const archived = results.filter(Boolean).length;
            if (archived > 0) {
              toast.success(t("tasks:archive.success", { count: archived }));
            }
          },
        );
      },
      onCreateTask: canCreateTasks()
        ? (status) => setCreateStatus(status)
        : undefined,
      getSharedColumns,
    }),
    [taskProjects, moveTask, getSharedColumns, canCreateTasks, t],
  );

  const title = `${memberLabel} · ${
    viewMode === "board" ? t("tasks:view.board") : t("tasks:view.list")
  }`;

  if (isError) {
    return (
      <Empty className="min-h-[50vh]">
        <PageTitle title={title} hideAppName />
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
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <PageTitle title={title} hideAppName />
      <BoardToolbar
        project={mergedBoard}
        filters={filters}
        updateFilter={updateFilter}
        updateLabelFilter={updateLabelFilter}
        clearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
        users={users}
        workspaceLabels={workspaceLabels}
        viewMode={viewMode}
        setViewMode={setViewMode}
        sort={sort}
        onSortChange={setSort}
      />
      <MemberPartialLoadNotice failedCount={failedCount} />

      <div className="flex h-full flex-1 overflow-hidden bg-background">
        {!sortedBoard ? (
          <div className="flex h-full w-full gap-4 overflow-hidden p-4">
            {[1, 2, 3, 4].map((column) => (
              <div key={column} className="flex w-72 shrink-0 flex-col gap-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            ))}
          </div>
        ) : sortedBoard.columns.length === 0 ? (
          // No columns means no active project to show. That is either a
          // member with no tasks, or one whose tasks all sit in archived
          // projects, which only the Overview lists.
          <Empty className="min-h-[50vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpen />
              </EmptyMedia>
              {projectIds.length === 0 && data.projects.length > 0 ? (
                <>
                  <EmptyTitle>
                    {t("team:memberTasks.allArchivedTitle")}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t("team:memberTasks.allArchivedDescription", {
                      name: memberLabel,
                    })}
                  </EmptyDescription>
                </>
              ) : (
                <>
                  <EmptyTitle>{t("team:memberTasks.emptyTitle")}</EmptyTitle>
                  <EmptyDescription>
                    {t("team:memberTasks.emptyDescription", {
                      name: memberLabel,
                    })}
                  </EmptyDescription>
                </>
              )}
            </EmptyHeader>
          </Empty>
        ) : (
          <TaskProjectsProvider projects={taskProjects}>
            {viewMode === "board" ? (
              <KanbanBoard
                project={sortedBoard}
                disableDragDrop={!canUpdateTasks()}
                crossProject={crossProject}
              />
            ) : (
              <ListView
                project={sortedBoard}
                disableDragDrop={!canUpdateTasks()}
                crossProject={crossProject}
              />
            )}
          </TaskProjectsProvider>
        )}
      </div>

      {/* Pre-assigned to the member so the new task appears on this board,
          and limited to projects that have the column it was started from. */}
      <CreateTaskModal
        open={createStatus !== null}
        status={createStatus ?? undefined}
        defaultAssigneeId={userId}
        allowedProjectIds={
          createStatus ? projectIdsWithStatus(createStatus) : undefined
        }
        onClose={() => {
          setCreateStatus(null);
          refreshSummary();
        }}
      />
    </div>
  );
}
