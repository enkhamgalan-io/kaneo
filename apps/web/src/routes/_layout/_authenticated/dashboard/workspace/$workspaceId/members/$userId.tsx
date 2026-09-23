import { useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  LayoutDashboard,
  ShieldOff,
  SquareKanban,
  SquircleDashed,
  TriangleAlert,
  UserX,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  exactViewTabActiveOptions,
  MobileViewNav,
  ViewSwitcher,
  ViewTab,
  viewTabActiveOptions,
} from "@/components/common/header/view-switcher";
import WorkspaceCrumbSelect from "@/components/common/header/workspace-crumb-select";
import Layout from "@/components/common/layout";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { resolveMemberPageState } from "@/components/team/member-page-state";
import { MemberViewProvider } from "@/components/team/member-view-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { KbdSequence } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shortcuts } from "@/constants/shortcuts";
import type { MemberBoard } from "@/hooks/queries/task/use-get-member-boards";
import useGetMemberTasks from "@/hooks/queries/workspace/use-get-member-tasks";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toneFor } from "@/lib/avatar-tone";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";
import { HttpError } from "@/lib/http-error";
import useProjectStore from "@/store/project";
import { useUserPreferencesStore } from "@/store/user-preferences";

type MemberTasksSearchParams = {
  taskId?: string;
};

// A layout route: the tabs below are its children and share one header, one
// permission gate and one task sheet. Children inherit `taskId`, so opening a
// task from any tab lands in the sheet rendered here.
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/members/$userId",
)({
  component: RouteComponent,
  validateSearch: (
    search: Record<string, unknown>,
  ): MemberTasksSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId, userId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    canReadTasks,
    canAccessAllProjects,
    isCheckingPermissions,
    isLoadingMember,
    isMemberError,
  } = useWorkspacePermission();
  // The summary and views cover only projects the viewer can open.
  const seesOwnProjectsOnly = !isCheckingPermissions && !canAccessAllProjects();
  const canViewTasks = Boolean(canReadTasks());
  const { data, isPending, error } = useGetMemberTasks(workspaceId, userId, {
    enabled: canViewTasks,
  });

  const member = data?.member;
  const pageState = resolveMemberPageState({
    isLoadingMember,
    isMemberError,
    isCheckingPermissions,
    canViewTasks,
    isPending,
    errorStatus: error instanceof HttpError ? error.status : undefined,
    hasData: Boolean(member),
  });
  const memberLabel = member ? member.name || member.email : undefined;

  // Project views set this global store from their own board. Left over from
  // the last board visited, it would leak that project into shared task
  // components here, where tasks come from many projects.
  const { setProject } = useProjectStore();
  const { setViewMode } = useUserPreferencesStore();
  useEffect(() => {
    setProject(undefined);
  }, [setProject]);

  const projectIds = useMemo(
    () =>
      (data?.projects ?? [])
        .filter((project) => !project.isArchived)
        .map((project) => project.id),
    [data],
  );

  // The sheet needs the task's project, which varies per task here. The
  // summary covers every task the page showed when it loaded; a view's board
  // can be newer (a task assigned since), so its cache is checked too.
  const openTaskProjectId = useMemo(() => {
    if (!taskId) return undefined;
    const fromSummary = data?.projects.find((project) =>
      project.tasks.some((task) => task.id === taskId),
    )?.id;
    if (fromSummary) return fromSummary;

    for (const [key, board] of queryClient.getQueriesData<MemberBoard>({
      queryKey: ["tasks"],
    })) {
      if (key[2] !== "assignee" || key[3] !== userId || !board) continue;
      const tasks = [
        ...board.columns.flatMap((column) => column.tasks),
        ...board.plannedTasks,
        ...board.archivedTasks,
      ];
      if (tasks.some((task) => task.id === taskId)) return board.id;
    }
    return undefined;
  }, [taskId, data, queryClient, userId]);

  // Held past the point the search param clears, so the sheet keeps its
  // project (and its header) through the 300ms exit animation.
  const [sheetProjectId, setSheetProjectId] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (openTaskProjectId) setSheetProjectId(openTaskProjectId);
  }, [openTaskProjectId]);

  const openTask = useCallback(
    (nextTaskId: string) =>
      navigate({ to: ".", search: { taskId: nextTaskId }, replace: true }),
    [navigate],
  );

  const refreshSummary = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["workspace", workspaceId, "member-tasks", userId],
    });
    queryClient.invalidateQueries({
      queryKey: ["workspace", workspaceId, "member-task-counts"],
    });
  }, [queryClient, workspaceId, userId]);

  // Any successful mutation while the member page is open may have changed a
  // task the summary shows. Flag it rather than refetch on every edit; the
  // Overview refreshes when it is shown again.
  const isSummaryStaleRef = useRef(false);
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type === "updated" && event.action.type === "success") {
          isSummaryStaleRef.current = true;
        }
      }),
    [queryClient],
  );

  const refreshSummaryIfStale = useCallback(() => {
    if (!isSummaryStaleRef.current) return;
    isSummaryStaleRef.current = false;
    refreshSummary();
  }, [refreshSummary]);

  const handleCloseTaskSheet = useCallback(() => {
    navigate({ to: ".", search: {}, replace: true });
    // The sheet can change status, assignee or due date, which moves the task
    // between the summary's sections and shifts the counts behind it. The
    // views' boards refresh on their own through the task mutations.
    refreshSummary();
  }, [navigate, refreshSummary]);

  // Registered here once for every tab: the shortcut registry drops a key for
  // everyone when any registrant unmounts, so children must not register the
  // same keys.
  useRegisterShortcuts({
    sequentialShortcuts: {
      [shortcuts.view.prefix]: {
        [shortcuts.view.board]: () => {
          setViewMode("board");
          navigate({
            to: "/dashboard/workspace/$workspaceId/members/$userId/board",
            params: { workspaceId, userId },
          });
        },
        [shortcuts.view.list]: () => {
          setViewMode("list");
          navigate({
            to: "/dashboard/workspace/$workspaceId/members/$userId/board",
            params: { workspaceId, userId },
          });
        },
        [shortcuts.view.backlog]: () =>
          navigate({
            to: "/dashboard/workspace/$workspaceId/members/$userId/backlog",
            params: { workspaceId, userId },
          }),
        [shortcuts.view.calendar]: () =>
          navigate({
            to: "/dashboard/workspace/$workspaceId/members/$userId/calendar",
            params: { workspaceId, userId },
          }),
        [shortcuts.view.gantt]: () =>
          navigate({
            to: "/dashboard/workspace/$workspaceId/members/$userId/gantt",
            params: { workspaceId, userId },
          }),
      },
    },
  });

  const renderViewTabs = (variant: "segmented" | "grid") => (
    <>
      <ViewTab
        variant={variant}
        icon={LayoutDashboard}
        to="/dashboard/workspace/$workspaceId/members/$userId"
        params={{ workspaceId, userId }}
        activeOptions={exactViewTabActiveOptions}
      >
        {t("navigation:views.overview")}
      </ViewTab>
      <ViewTab
        variant={variant}
        icon={SquircleDashed}
        to="/dashboard/workspace/$workspaceId/members/$userId/backlog"
        params={{ workspaceId, userId }}
        activeOptions={viewTabActiveOptions}
      >
        {t("navigation:views.backlog")}
      </ViewTab>
      <ViewTab
        variant={variant}
        icon={SquareKanban}
        to="/dashboard/workspace/$workspaceId/members/$userId/board"
        params={{ workspaceId, userId }}
        activeOptions={viewTabActiveOptions}
      >
        {t("tasks:title")}
      </ViewTab>
      <ViewTab
        variant={variant}
        icon={CalendarRange}
        to="/dashboard/workspace/$workspaceId/members/$userId/calendar"
        params={{ workspaceId, userId }}
        activeOptions={viewTabActiveOptions}
      >
        {t("tasks:calendar.title")}
      </ViewTab>
      <ViewTab
        variant={variant}
        icon={CalendarDays}
        to="/dashboard/workspace/$workspaceId/members/$userId/gantt"
        params={{ workspaceId, userId }}
        activeOptions={viewTabActiveOptions}
      >
        {t("navigation:views.gantt")}
      </ViewTab>
    </>
  );

  const statePanel = (icon: ReactNode, title: string, description: string) => (
    <Empty className="min-h-[50vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  const isReady = pageState === "ready" && data && member;

  return (
    <Layout>
      <Layout.Header className="h-11 border-border/80 px-2">
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarTrigger className="-ml-1 h-7 w-7 cursor-pointer text-foreground/85 hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="flex items-center gap-2 text-[10px]">
                    {t("common:a11y.toggleSidebar")}
                    <KbdSequence
                      keys={[
                        shortcuts.sidebar.prefix,
                        shortcuts.sidebar.toggle,
                      ]}
                    />
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="h-4 w-px shrink-0 bg-border/80" />

            <div className="hidden min-w-0 items-center gap-1 md:flex">
              <WorkspaceCrumbSelect />
              <span className="text-foreground/30 text-xs">/</span>
              <Button
                render={
                  <Link
                    to="/dashboard/workspace/$workspaceId/members"
                    params={{ workspaceId }}
                  />
                }
                variant="ghost"
                size="xs"
                className="h-7 px-2 text-xs text-foreground"
              >
                {t("navigation:sidebar.members")}
              </Button>
              {member ? (
                <>
                  <span className="text-foreground/30 text-xs">/</span>
                  <span className="flex min-w-0 items-center gap-1.5 px-1 text-xs text-foreground">
                    <Avatar className={cn("size-5", toneFor(member.email))}>
                      <AvatarImage src={member.image ?? ""} alt="" />
                      <AvatarFallback className="bg-transparent text-[9px] font-medium">
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{memberLabel}</span>
                  </span>
                </>
              ) : null}
            </div>

            {isReady ? (
              <>
                <div className="md:hidden">
                  <MobileViewNav>{renderViewTabs("grid")}</MobileViewNav>
                </div>
                <ViewSwitcher>{renderViewTabs("segmented")}</ViewSwitcher>
              </>
            ) : null}
          </div>
        </div>
      </Layout.Header>

      <Layout.Content>
        {isReady ? (
          <MemberViewProvider
            value={{
              workspaceId,
              userId,
              data,
              projectIds,
              openTask,
              refreshSummary,
              refreshSummaryIfStale,
            }}
          >
            {seesOwnProjectsOnly && (
              <p className="border-b border-border/80 px-4 py-2 text-xs text-muted-foreground">
                {t("team:memberTasks.ownProjectsOnly")}
              </p>
            )}
            <Outlet />
          </MemberViewProvider>
        ) : (
          <div className="p-4 sm:p-6">
            <PageTitle title={memberLabel || t("team:memberTasks.pageTitle")} />
            {pageState === "loading" ? (
              <div className="space-y-6">
                <Skeleton className="h-14 w-64" />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              </div>
            ) : pageState === "no-permission" ? (
              statePanel(
                <ShieldOff />,
                t("team:memberTasks.noPermissionTitle"),
                t("team:memberTasks.noPermissionDescription"),
              )
            ) : pageState === "not-found" ? (
              statePanel(
                <UserX />,
                t("team:memberTasks.notFoundTitle"),
                t("team:memberTasks.notFoundDescription"),
              )
            ) : (
              statePanel(
                <TriangleAlert />,
                t("team:memberTasks.loadErrorTitle"),
                t("team:memberTasks.loadErrorDescription"),
              )
            )}
          </div>
        )}

        {/* Opened over this page rather than on the task's own board, so
            closing it returns here instead of stranding the reader in a
            project they never navigated to. */}
        {isReady ? (
          <TaskDetailsSheet
            taskId={openTaskProjectId ? taskId : undefined}
            projectId={sheetProjectId ?? ""}
            workspaceId={workspaceId}
            onClose={handleCloseTaskSheet}
          />
        ) : null}
      </Layout.Content>
    </Layout>
  );
}
