import { ArrowRight, Calendar, Filter, Plus, User, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import SortControl from "@/components/common/sort-control";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import type { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { DUE_DATE_FILTER_VALUES } from "@/hooks/use-task-filters";
import { getInitials } from "@/lib/get-initials";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { resolveLabelColor } from "@/lib/label-color";
import { getPriorityIcon } from "@/lib/priority";
import type { SortConfig } from "@/lib/sort-tasks";
import type { BacklogFilterState } from "./use-backlog-filters";

type BacklogToolbarProps = {
  filters: BacklogFilterState;
  updateFilter: (key: string, value: string | null) => void;
  updateLabelFilter: (labelId: string) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  sort: SortConfig;
  onSortChange: (sort: SortConfig) => void;
  users: ReturnType<typeof useGetActiveWorkspaceUsers>["data"];
  workspaceLabels: Array<{ id: string; name: string; color: string }>;
  // Each button is shown only when its handler is given.
  onPlan?: () => void;
  onMoveAll?: () => void;
};

export function BacklogToolbar({
  filters,
  updateFilter,
  updateLabelFilter,
  clearFilters,
  hasActiveFilters,
  sort,
  onSortChange,
  users,
  workspaceLabels,
  onPlan,
  onMoveAll,
}: BacklogToolbarProps) {
  const { t } = useTranslation();

  const getAssigneeDisplayName = (userId: string) => {
    const member = users?.members?.find((m) => m.userId === userId);
    return member?.user?.name || t("common:people.unknown");
  };

  const uniqueLabels = workspaceLabels.reduce(
    (
      acc: { id: string; name: string; color: string }[],
      label: { id: string; name: string; color: string },
    ) => {
      const existing = acc.find(
        (l) => l.name === label.name && l.color === label.color,
      );
      if (!existing) {
        acc.push(label);
      }
      return acc;
    },
    [],
  );

  const isLabelGroupSelected = (label: { name: string; color: string }) => {
    return workspaceLabels
      .filter(
        (l: { name: string; color: string }) =>
          l.name === label.name && l.color === label.color,
      )
      .some((l: { id: string }) => filters.labels?.includes(l.id));
  };

  const toggleLabelGroup = (label: { name: string; color: string }) => {
    const matchingLabels = workspaceLabels.filter(
      (l: { name: string; color: string }) =>
        l.name === label.name && l.color === label.color,
    );

    const isAnySelected = matchingLabels.some((l: { id: string }) =>
      filters.labels?.includes(l.id),
    );

    if (isAnySelected) {
      for (const l of matchingLabels) {
        if (filters.labels?.includes(l.id)) {
          updateLabelFilter(l.id);
        }
      }
    } else {
      for (const l of matchingLabels) {
        if (!filters.labels?.includes(l.id)) {
          updateLabelFilter(l.id);
        }
      }
    }
  };

  return (
    <div className="border-border/80 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70">
      <div className="flex min-h-12 items-center px-3 py-2 md:px-4">
        <div className="flex w-full items-center gap-2">
          <div className="flex w-full flex-wrap items-center gap-1.5">
            {onPlan ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={onPlan}
                className="h-6 px-2 text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Plus className="h-3 w-3 mr-1" />
                {t("tasks:backlog.plan")}
              </Button>
            ) : null}

            {onMoveAll ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={onMoveAll}
                className="h-6 px-2 text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                title={t("tasks:backlog.moveAllTooltip")}
              >
                <ArrowRight className="h-3 w-3 mr-1" />
                {t("tasks:backlog.moveAll")}
              </Button>
            ) : null}

            {filters.priority && (
              <Button
                variant="secondary"
                size="xs"
                className="h-7 rounded-md px-2 text-xs font-medium gap-1.5"
              >
                {getPriorityIcon(filters.priority)}
                <span>
                  {t("tasks:backlog.filters.priority", {
                    name: getPriorityLabel(filters.priority),
                  })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateFilter("priority", null);
                  }}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </Button>
            )}

            {filters.assignee && (
              <Button
                variant="secondary"
                size="xs"
                className="h-7 rounded-md px-2 text-xs font-medium gap-1.5"
              >
                <User className="h-3 w-3" />
                <span>
                  {t("tasks:backlog.filters.assignee", {
                    name: getAssigneeDisplayName(filters.assignee),
                  })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateFilter("assignee", null);
                  }}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </Button>
            )}

            {filters.dueDate && (
              <Button
                variant="secondary"
                size="xs"
                className="h-7 rounded-md px-2 text-xs font-medium gap-1.5"
              >
                <Calendar className="h-3 w-3" />
                <span>
                  {t("tasks:backlog.filters.due", {
                    date: t(
                      filters.dueDate === DUE_DATE_FILTER_VALUES.dueThisWeek
                        ? "tasks:backlog.filters.dueThisWeek"
                        : filters.dueDate === DUE_DATE_FILTER_VALUES.dueNextWeek
                          ? "tasks:backlog.filters.dueNextWeek"
                          : "tasks:backlog.filters.noDueDate",
                      { defaultValue: filters.dueDate },
                    ),
                  })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateFilter("dueDate", null);
                  }}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </Button>
            )}

            {filters.labels &&
              filters.labels.length > 0 &&
              uniqueLabels
                .filter((uniqueLabel) =>
                  workspaceLabels
                    .filter(
                      (l: { name: string; color: string }) =>
                        l.name === uniqueLabel.name &&
                        l.color === uniqueLabel.color,
                    )
                    .some((l: { id: string }) =>
                      filters.labels?.includes(l.id),
                    ),
                )
                .map((label) => (
                  <Button
                    key={`${label.name}-${label.color}`}
                    variant="secondary"
                    size="xs"
                    className="h-7 rounded-md px-2 text-xs font-medium gap-1.5"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: resolveLabelColor(label.color),
                      }}
                    />
                    <span>
                      {t("tasks:backlog.filters.label", {
                        name: label.name,
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLabelGroup(label);
                      }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </Button>
                ))}

            <SortControl sort={sort} onSortChange={onSortChange} />

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-2 px-2.5 text-xs font-medium text-foreground"
                  />
                }
              >
                <Filter className="h-3.5 w-3.5" />
                {t("tasks:backlog.filter")}
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-80" align="start">
                <DropdownMenuItem
                  disabled
                  className="h-8 rounded-md border border-border/80 bg-card text-sm text-muted-foreground"
                >
                  {t("tasks:backlog.addFilter")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {hasActiveFilters && (
                  <>
                    <DropdownMenuItem
                      onClick={clearFilters}
                      className="h-8 text-sm text-muted-foreground"
                    >
                      <span>{t("common:actions.clearAllFilters")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
                    {t("tasks:priority.label")}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                {["urgent", "high", "medium", "low"].map((priority) => (
                  <DropdownMenuCheckboxItem
                    key={priority}
                    checked={filters.priority === priority}
                    onCheckedChange={(checked) =>
                      updateFilter("priority", checked ? priority : null)
                    }
                    className="h-8 rounded-md text-sm [&_svg]:text-sidebar-foreground"
                  >
                    <div className="flex gap-2 items-center">
                      {getPriorityIcon(priority)}
                      <span className="capitalize">
                        {getPriorityLabel(priority)}
                      </span>
                    </div>
                  </DropdownMenuCheckboxItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
                    {t("tasks:assignee.label")}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                {users?.members?.map((member) => (
                  <DropdownMenuCheckboxItem
                    key={member.userId}
                    checked={filters.assignee === member.userId}
                    onCheckedChange={(checked) =>
                      updateFilter("assignee", checked ? member.userId : null)
                    }
                    className="h-8 rounded-md text-sm"
                  >
                    <Avatar className="h-6 w-6 mr-2">
                      <AvatarImage
                        src={member.user?.image ?? ""}
                        alt={member.user?.name || ""}
                      />
                      <AvatarFallback className="text-xs font-medium border border-border/30">
                        {getInitials(member.user?.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span>{member.user?.name}</span>
                  </DropdownMenuCheckboxItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
                    {t("tasks:dueDate.label")}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                {[
                  {
                    label: DUE_DATE_FILTER_VALUES.dueThisWeek,
                    key: "dueThisWeek",
                  },
                  {
                    label: DUE_DATE_FILTER_VALUES.dueNextWeek,
                    key: "dueNextWeek",
                  },
                  {
                    label: DUE_DATE_FILTER_VALUES.noDueDate,
                    key: "noDueDate",
                  },
                ].map((item) => (
                  <DropdownMenuCheckboxItem
                    key={item.label}
                    checked={filters.dueDate === item.label}
                    onCheckedChange={(checked) =>
                      updateFilter("dueDate", checked ? item.label : null)
                    }
                    className="h-8 rounded-md text-sm"
                  >
                    <span>{t(`tasks:backlog.filters.${item.key}`)}</span>
                  </DropdownMenuCheckboxItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
                    {t("tasks:labels.label")}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                {uniqueLabels.length > 0 ? (
                  uniqueLabels.map(
                    (label: { id: string; name: string; color: string }) => (
                      <DropdownMenuCheckboxItem
                        key={label.id}
                        checked={isLabelGroupSelected(label)}
                        onCheckedChange={() => toggleLabelGroup(label)}
                        className="h-8 rounded-md text-sm"
                      >
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: resolveLabelColor(label.color),
                          }}
                        />
                        <span className="max-w-20 truncate">{label.name}</span>
                      </DropdownMenuCheckboxItem>
                    ),
                  )
                ) : (
                  <DropdownMenuItem
                    disabled
                    className="h-8 rounded-md text-sm text-muted-foreground"
                  >
                    <span>{t("tasks:labels.empty")}</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
