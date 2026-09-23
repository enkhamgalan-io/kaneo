import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import icons from "@/constants/project-icons";
import type {
  MemberTask,
  MemberTaskProject,
  MemberTasksResponse,
} from "@/fetchers/workspace/get-member-tasks";
import { cn } from "@/lib/cn";
import { formatDateMedium } from "@/lib/format";
import { getPriorityIcon } from "@/lib/priority";

type Props = {
  data: MemberTasksResponse;
};

function StatTile({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <div
        className={cn(
          "text-xl font-semibold tabular-nums",
          emphasis && value > 0 && "text-destructive-foreground",
        )}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function MemberTaskRow({
  projectSlug,
  task,
}: {
  projectSlug: string;
  task: MemberTask;
}) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      // Stays on this route and lets the member page host the task sheet, so
      // closing it comes back here rather than to the task's project board.
      onClick={() => navigate({ to: ".", search: { taskId: task.id } })}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/60 transition-colors text-left"
    >
      <div className="flex-shrink-0 first:[&_svg]:h-4 first:[&_svg]:w-4">
        {getPriorityIcon(task.priority)}
      </div>

      {task.number != null && (
        <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
          {projectSlug}-{task.number}
        </span>
      )}

      <span
        className={cn(
          "flex-1 min-w-0 truncate text-sm",
          task.isCompleted && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </span>

      {task.dueDate && (
        <span
          className={cn(
            "text-xs flex-shrink-0 tabular-nums",
            task.isOverdue
              ? "text-destructive-foreground"
              : "text-muted-foreground",
          )}
        >
          {formatDateMedium(task.dueDate)}
        </span>
      )}

      <Badge variant="outline" size="sm" className="flex-shrink-0">
        {task.statusName}
      </Badge>
    </button>
  );
}

function MemberProjectSection({ project }: { project: MemberTaskProject }) {
  const { t } = useTranslation();
  const IconComponent =
    icons[project.icon as keyof typeof icons] || icons.Layout;

  const activeTasks = project.tasks.filter((task) => !task.isCompleted);
  const completedTasks = project.tasks.filter((task) => task.isCompleted);

  // Archived projects and projects with nothing left to do start collapsed, so
  // the page opens on the work that is actually live.
  const defaultOpen = !project.isArchived && project.counts.open > 0;

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="rounded-lg border border-border bg-background"
    >
      <CollapsibleTrigger className="group/project flex w-full items-center gap-3 px-4 py-3 text-left">
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200 group-data-panel-open/project:rotate-90" />
        <IconComponent className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium truncate">{project.name}</span>
        {project.isArchived && (
          <Badge variant="secondary" size="sm" className="flex-shrink-0">
            {t("team:memberTasks.projectArchived")}
          </Badge>
        )}
        <span className="ml-auto flex items-center gap-2 flex-shrink-0 text-xs text-muted-foreground tabular-nums">
          {project.counts.overdue > 0 && (
            <span className="text-destructive-foreground">
              {t("team:memberTasks.overdueCount", {
                count: project.counts.overdue,
              })}
            </span>
          )}
          <span>
            {t("team:memberTasks.projectCounts", {
              open: project.counts.open,
              total: project.counts.total,
            })}
          </span>
        </span>
      </CollapsibleTrigger>

      <CollapsiblePanel>
        <div className="border-t border-border p-1.5">
          {activeTasks.map((task) => (
            <MemberTaskRow
              key={task.id}
              projectSlug={project.slug}
              task={task}
            />
          ))}

          {completedTasks.length > 0 && (
            <Collapsible className="group/completed">
              <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-panel-open/completed:rotate-90" />
                {t("team:memberTasks.completedTasks", {
                  count: completedTasks.length,
                })}
              </CollapsibleTrigger>
              <CollapsiblePanel>
                {completedTasks.map((task) => (
                  <MemberTaskRow
                    key={task.id}
                    projectSlug={project.slug}
                    task={task}
                  />
                ))}
              </CollapsiblePanel>
            </Collapsible>
          )}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

function MemberTaskList({ data }: Props) {
  const { t } = useTranslation();
  const { summary, projects, member } = data;

  if (summary.total === 0) {
    return (
      <Empty className="min-h-[50vh]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderOpen />
          </EmptyMedia>
          <EmptyTitle>{t("team:memberTasks.emptyTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("team:memberTasks.emptyDescription", {
              name: member.name || member.email,
            })}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label={t("team:memberTasks.summary.total")}
          value={summary.total}
        />
        <StatTile
          label={t("team:memberTasks.summary.open")}
          value={summary.open}
        />
        <StatTile
          label={t("team:memberTasks.summary.overdue")}
          value={summary.overdue}
          emphasis
        />
        <StatTile
          label={t("team:memberTasks.summary.done")}
          value={summary.done}
        />
        <StatTile
          label={t("team:memberTasks.summary.backlog")}
          value={summary.backlog}
        />
        <StatTile
          label={t("team:memberTasks.summary.archived")}
          value={summary.archived}
        />
      </div>

      {summary.byStatus.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("team:memberTasks.byState")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {summary.byStatus.map((status) => (
              <div
                key={status.slug}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5"
              >
                <span className="text-xs text-muted-foreground">
                  {status.name}
                </span>
                <span className="text-xs font-medium tabular-nums">
                  {status.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("team:memberTasks.acrossProjects", {
            count: summary.projectCount,
          })}
        </h2>
        <div className="space-y-2">
          {projects.map((project) => (
            <MemberProjectSection key={project.id} project={project} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default MemberTaskList;
