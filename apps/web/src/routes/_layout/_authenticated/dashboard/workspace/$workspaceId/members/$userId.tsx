import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, UserX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import MemberTaskList from "@/components/team/member-task-list";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import useGetMemberTasks from "@/hooks/queries/workspace/use-get-member-tasks";
import { toneFor } from "@/lib/avatar-tone";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

type MemberTasksSearchParams = {
  taskId?: string;
};

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

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId, userId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useGetMemberTasks(workspaceId, userId);

  const member = data?.member;
  const title = member?.name || t("team:memberTasks.pageTitle");

  // The sheet needs the task's project, which varies per row here. It comes
  // from the list rather than a route param.
  const openTaskProjectId = useMemo(() => {
    if (!taskId || !data) return undefined;
    return data.projects.find((project) =>
      project.tasks.some((task) => task.id === taskId),
    )?.id;
  }, [taskId, data]);

  // Held past the point the search param clears, so the sheet keeps its
  // project (and its header) through the 300ms exit animation.
  const [sheetProjectId, setSheetProjectId] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (openTaskProjectId) setSheetProjectId(openTaskProjectId);
  }, [openTaskProjectId]);

  const handleCloseTaskSheet = useCallback(() => {
    navigate({ to: ".", search: {}, replace: true });
    // The sheet can change status, assignee or due date, which moves the task
    // between this page's sections and shifts the counts behind it.
    queryClient.invalidateQueries({
      queryKey: ["workspace", workspaceId, "member-tasks", userId],
    });
    queryClient.invalidateQueries({
      queryKey: ["workspace", workspaceId, "member-task-counts"],
    });
  }, [navigate, queryClient, workspaceId, userId]);

  const backAction = (
    <Link
      to="/dashboard/workspace/$workspaceId/members"
      params={{ workspaceId }}
    >
      <Button variant="ghost" size="sm" className="gap-2">
        <ArrowLeft className="w-4 h-4" />
        {t("team:memberTasks.backToMembers")}
      </Button>
    </Link>
  );

  return (
    <>
      <PageTitle title={title} />
      <WorkspaceLayout title={title} headerActions={backAction}>
        {isLoading ? (
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
        ) : isError || !data || !member ? (
          <Empty className="min-h-[50vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserX />
              </EmptyMedia>
              <EmptyTitle>{t("team:memberTasks.notFoundTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("team:memberTasks.notFoundDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Avatar className={cn("size-10", toneFor(member.email))}>
                <AvatarImage src={member.image ?? ""} alt={member.name} />
                <AvatarFallback className="bg-transparent text-xs font-medium">
                  {getInitials(member.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{member.name}</span>
                  <Badge variant="secondary" size="sm" className="capitalize">
                    {t(`team:roles.${member.role}`, {
                      defaultValue: capitalize(member.role),
                    })}
                  </Badge>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {member.email}
                </div>
              </div>
            </div>

            <MemberTaskList data={data} />

            {/* Opened over this page rather than on the task's own board, so
                closing it returns here instead of stranding the reader in a
                project they never navigated to. */}
            <TaskDetailsSheet
              taskId={openTaskProjectId ? taskId : undefined}
              projectId={sheetProjectId ?? ""}
              workspaceId={workspaceId}
              onClose={handleCloseTaskSheet}
            />
          </div>
        )}
      </WorkspaceLayout>
    </>
  );
}
