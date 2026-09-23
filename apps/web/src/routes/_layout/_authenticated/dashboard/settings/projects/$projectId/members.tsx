import { createFileRoute, useParams } from "@tanstack/react-router";
import { UserMinus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { ProjectMember } from "@/fetchers/project/get-project-members";
import {
  useAddProjectMember,
  useRemoveProjectMember,
} from "@/hooks/mutations/project/use-project-member-mutations";
import useGetProjectMembers from "@/hooks/queries/project/use-get-project-members";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/projects/$projectId/members",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId = "" } = useParams({ strict: false });
  const { workspace, canUpdateProjects } = useWorkspacePermission();
  const canManage = canUpdateProjects();

  const { data: members, isPending, isError } = useGetProjectMembers(projectId);
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(
    workspace?.id ?? "",
  );
  const { mutateAsync: addMember, isPending: isAdding } =
    useAddProjectMember(projectId);
  const { mutateAsync: removeMember } = useRemoveProjectMember(projectId);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [memberToRemove, setMemberToRemove] = useState<ProjectMember | null>(
    null,
  );

  // Workspace members who cannot open the project yet.
  const candidates = useMemo(() => {
    const listed = new Set(members?.map((member) => member.id));
    return (workspaceUsers?.members ?? [])
      .filter((workspaceUser) => !listed.has(workspaceUser.userId))
      .map((workspaceUser) => ({
        id: workspaceUser.userId,
        name: workspaceUser.user.name,
        email: workspaceUser.user.email,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, workspaceUsers]);

  const selectedCandidate = candidates.find(
    (candidate) => candidate.id === selectedUserId,
  );

  const handleAdd = async () => {
    if (!selectedCandidate) return;
    try {
      await addMember(selectedCandidate.id);
      setSelectedUserId("");
      toast.success(
        t("settings:projectMembers.toastAdded", {
          name: selectedCandidate.name,
        }),
      );
    } catch {
      toast.error(t("settings:projectMembers.toastAddError"));
    }
  };

  const handleRemove = async (member: ProjectMember) => {
    try {
      await removeMember(member.id);
      toast.success(
        t("settings:projectMembers.toastRemoved", { name: member.name }),
      );
    } catch {
      toast.error(t("settings:projectMembers.toastRemoveError"));
    }
  };

  return (
    <>
      <PageTitle title={t("settings:projectMembers.pageTitle")} />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {t("settings:projectMembers.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("settings:projectMembers.subtitle")}
          </p>
        </div>

        {canManage && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-md font-medium">
                {t("settings:projectMembers.addTitle")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("settings:projectMembers.addSubtitle")}
              </p>
            </div>

            <div className="border border-border rounded-md p-4 bg-sidebar">
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("settings:projectMembers.noOneToAdd")}
                </p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select
                    value={selectedUserId}
                    onValueChange={(value) => setSelectedUserId(value ?? "")}
                  >
                    <SelectTrigger
                      className="h-8 w-full text-sm font-normal sm:w-80"
                      size="sm"
                      aria-label={t("settings:projectMembers.addPlaceholder")}
                    >
                      <span className="truncate">
                        {selectedCandidate?.name ??
                          t("settings:projectMembers.addPlaceholder")}
                      </span>
                    </SelectTrigger>
                    <SelectContent
                      side="bottom"
                      align="start"
                      sideOffset={6}
                      alignItemWithTrigger={false}
                      className="w-(--anchor-width)"
                    >
                      {candidates.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          <span className="truncate">{candidate.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {candidate.email}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={handleAdd}
                    disabled={!selectedCandidate || isAdding}
                  >
                    {t("settings:projectMembers.addButton")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:projectMembers.listTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {canManage
                ? t("settings:projectMembers.listSubtitle")
                : t("settings:projectMembers.readOnlyHint")}
            </p>
          </div>

          <div className="border border-border rounded-md bg-sidebar">
            {isPending ? null : isError ? (
              <p className="p-4 text-sm text-muted-foreground" role="alert">
                {t("settings:projectMembers.loadError")}
              </p>
            ) : members.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("settings:projectMembers.empty")}
              </p>
            ) : (
              <ul>
                {members.map((member, index) => (
                  <li key={member.id}>
                    {index > 0 && <Separator />}
                    <div className="flex items-center gap-3 p-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={member.image ?? ""}
                          alt={member.name}
                        />
                        <AvatarFallback className="text-xs">
                          {getInitials(member.name, "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {member.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.email}
                        </p>
                      </div>
                      <span className="hidden text-xs text-muted-foreground capitalize sm:inline">
                        {t(`team:roles.${member.role}`, {
                          defaultValue: member.role,
                        })}
                      </span>
                      {member.access === "all" ? (
                        <Badge
                          variant="secondary"
                          title={t("settings:projectMembers.allProjectsHint")}
                        >
                          {t("settings:projectMembers.allProjectsBadge")}
                        </Badge>
                      ) : canManage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMemberToRemove(member)}
                          aria-label={t(
                            "settings:projectMembers.removeAriaLabel",
                            { name: member.name },
                          )}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          <span>{t("settings:projectMembers.remove")}</span>
                        </Button>
                      ) : (
                        <Badge variant="outline">
                          {t("settings:projectMembers.addedBadge")}
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <AlertDialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings:projectMembers.removeConfirmTitle", {
                name: memberToRemove?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings:projectMembers.removeConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="sm" />}>
              {t("common:actions.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (memberToRemove) void handleRemove(memberToRemove);
                  }}
                />
              }
            >
              {t("settings:projectMembers.remove")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
