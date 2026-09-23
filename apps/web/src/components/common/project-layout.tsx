import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  SquareKanban,
  SquircleDashed,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import MobileProjectNav from "@/components/common/header/mobile-project-nav";
import ProjectCrumbSelect from "@/components/common/header/project-crumb-select";
import {
  ViewSwitcher,
  ViewTab,
  viewTabActiveOptions,
} from "@/components/common/header/view-switcher";
import WorkspaceCrumbSelect from "@/components/common/header/workspace-crumb-select";
import Layout from "@/components/common/layout";
import CreateProjectModal from "@/components/shared/modals/create-project-modal";
import { KbdSequence } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shortcuts } from "@/constants/shortcuts";
import useGetProject from "@/hooks/queries/project/use-get-project";
import { useProjectWebSocket } from "@/hooks/use-project-websocket";
import { isNotFoundError } from "@/lib/http-error";
import { ProjectNotAvailable } from "./project-not-available";

type ProjectLayoutProps = {
  projectId: string;
  workspaceId: string;
  headerActions?: ReactNode;
  children: ReactNode;
  showViewSwitcher?: boolean;
  activeView?: "backlog" | "board" | "calendar" | "gantt";
};

export default function ProjectLayout({
  projectId,
  workspaceId,
  headerActions,
  children,
  showViewSwitcher = true,
  activeView,
}: ProjectLayoutProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: project, error: projectError } = useGetProject({
    id: projectId,
    workspaceId,
  });
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] =
    useState(false);
  // Missing, or not one the user has been added to: the API answers both
  // with 404, and so does this page.
  const isUnavailable = isNotFoundError(projectError);

  useProjectWebSocket(isUnavailable ? "" : projectId);

  const resolvedView =
    activeView ??
    (location.pathname.includes("/backlog")
      ? "backlog"
      : location.pathname.includes("/calendar")
        ? "calendar"
        : location.pathname.includes("/gantt")
          ? "gantt"
          : "board");

  const renderViewTabs = (variant: "segmented" | "grid") => (
    <>
      <ViewTab
        variant={variant}
        icon={SquircleDashed}
        to="/dashboard/workspace/$workspaceId/project/$projectId/backlog"
        params={{ workspaceId, projectId }}
        activeOptions={viewTabActiveOptions}
      >
        {t("navigation:views.backlog")}
      </ViewTab>
      <ViewTab
        variant={variant}
        icon={SquareKanban}
        to="/dashboard/workspace/$workspaceId/project/$projectId/board"
        params={{ workspaceId, projectId }}
        activeOptions={viewTabActiveOptions}
      >
        {t("tasks:title")}
      </ViewTab>
      <ViewTab
        variant={variant}
        icon={CalendarRange}
        to="/dashboard/workspace/$workspaceId/project/$projectId/calendar"
        params={{ workspaceId, projectId }}
        activeOptions={viewTabActiveOptions}
      >
        {t("tasks:calendar.title")}
      </ViewTab>
      <ViewTab
        variant={variant}
        icon={CalendarDays}
        to="/dashboard/workspace/$workspaceId/project/$projectId/gantt"
        params={{ workspaceId, projectId }}
        activeOptions={viewTabActiveOptions}
      >
        {t("navigation:views.gantt")}
      </ViewTab>
    </>
  );

  const handleProjectSwitch = (nextProjectId: string) => {
    navigate({
      to:
        resolvedView === "backlog"
          ? "/dashboard/workspace/$workspaceId/project/$projectId/backlog"
          : resolvedView === "calendar"
            ? "/dashboard/workspace/$workspaceId/project/$projectId/calendar"
            : resolvedView === "gantt"
              ? "/dashboard/workspace/$workspaceId/project/$projectId/gantt"
              : "/dashboard/workspace/$workspaceId/project/$projectId/board",
      params: {
        workspaceId,
        projectId: nextProjectId,
      },
    });
  };

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
                    Toggle sidebar
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
              <ProjectCrumbSelect
                workspaceId={workspaceId}
                projectId={projectId}
                projectName={project?.name}
                onSelectProject={handleProjectSwitch}
                onAddProject={() => setIsCreateProjectModalOpen(true)}
              />
            </div>

            <div className="md:hidden">
              <MobileProjectNav
                workspaceId={workspaceId}
                projectId={projectId}
                viewTabs={renderViewTabs("grid")}
                onSelectProject={handleProjectSwitch}
                onAddProject={() => setIsCreateProjectModalOpen(true)}
              />
            </div>

            {showViewSwitcher && !isUnavailable && (
              <ViewSwitcher>{renderViewTabs("segmented")}</ViewSwitcher>
            )}
          </div>

          {!isUnavailable && (
            <div className="flex shrink-0 items-center gap-1.5">
              {headerActions}
            </div>
          )}
        </div>
      </Layout.Header>

      <Layout.Content>
        {isUnavailable ? (
          <ProjectNotAvailable workspaceId={workspaceId} />
        ) : (
          children
        )}
      </Layout.Content>

      <CreateProjectModal
        open={isCreateProjectModalOpen}
        onClose={() => setIsCreateProjectModalOpen(false)}
      />
    </Layout>
  );
}
