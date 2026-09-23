import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import MemberTaskList from "@/components/team/member-task-list";
import { useMemberView } from "@/components/team/member-view-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toneFor } from "@/lib/avatar-tone";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

// The member's Overview tab: a workspace-wide summary and every assigned task
// grouped by project, including archived projects the other views leave out.
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/members/$userId/",
)({
  component: RouteComponent,
});

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function RouteComponent() {
  const { t } = useTranslation();
  const { data, refreshSummaryIfStale } = useMemberView();
  const { member } = data;

  // Coming back from another tab where tasks were edited.
  useEffect(() => {
    refreshSummaryIfStale();
  }, [refreshSummaryIfStale]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageTitle title={member.name || member.email} />
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
    </div>
  );
}
