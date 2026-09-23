import { createFileRoute } from "@tanstack/react-router";
import { addMonths, startOfMonth, subMonths } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CalendarToolbar from "@/components/calendar/calendar-toolbar";
import MonthGrid from "@/components/calendar/month-grid";
import { buildMonthWeeks } from "@/components/calendar/month-grid-model";
import PageTitle from "@/components/page-title";
import { MemberPartialLoadNotice } from "@/components/team/member-partial-load-notice";
import { useMemberView } from "@/components/team/member-view-context";
import { useMemberBoards } from "@/components/team/use-member-boards";
import { useIsMobile } from "@/hooks/use-mobile";
import { toScheduledTasks } from "@/lib/task-schedule";
import { useUserPreferencesStore } from "@/store/user-preferences";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/members/$userId/calendar",
)({
  component: RouteComponent,
});

// Same caps as the project calendar, so a busy week reads the same way.
const MAX_LANES_DESKTOP = 3;
const MAX_LANES_MOBILE = 2;

function RouteComponent() {
  const { t } = useTranslation();
  const { data, openTask } = useMemberView();
  const { boards, isPending, isError, failedCount } = useMemberBoards();
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const isMobile = useIsMobile();
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(new Date()),
  );

  // One calendar across every project, so each bar carries its own project's
  // key instead of the single slug a project calendar shows.
  const scheduledTasks = useMemo(
    () =>
      boards
        .flatMap((board) =>
          toScheduledTasks(board).map((task) => ({
            ...task,
            projectSlug: board.slug,
          })),
        )
        .sort(
          (left, right) =>
            left.scheduleStart.getTime() - right.scheduleStart.getTime(),
        ),
    [boards],
  );

  const weeks = useMemo(
    () => buildMonthWeeks(visibleMonth, weekStartsOn),
    [visibleMonth, weekStartsOn],
  );

  const handlePreviousMonth = useCallback(() => {
    setVisibleMonth((current) => subMonths(current, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setVisibleMonth((current) => addMonths(current, 1));
  }, []);

  const handleToday = useCallback(() => {
    setVisibleMonth(startOfMonth(new Date()));
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <PageTitle
        title={t("tasks:calendar.pageTitle", {
          name: data.member.name || data.member.email,
        })}
        hideAppName
      />
      <CalendarToolbar
        visibleMonth={visibleMonth}
        onPreviousMonth={handlePreviousMonth}
        onNextMonth={handleNextMonth}
        onToday={handleToday}
      />
      <MemberPartialLoadNotice failedCount={failedCount} />

      {isPending ? (
        <div className="border-b border-border/80 px-4 py-3 text-center">
          <p className="text-sm text-muted-foreground">
            {t("common:empty.loading")}
          </p>
        </div>
      ) : isError ? (
        <div className="border-b border-border/80 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-destructive">
            {t("tasks:calendar.loadError")}
          </p>
        </div>
      ) : scheduledTasks.length === 0 ? (
        <div className="border-b border-border/80 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-foreground">
            {t("tasks:calendar.noTasks")}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("tasks:calendar.noTasksSubtitle")}
          </p>
        </div>
      ) : null}

      <MonthGrid
        weeks={weeks}
        tasks={isPending ? [] : scheduledTasks}
        visibleMonth={visibleMonth}
        maxLanes={isMobile ? MAX_LANES_MOBILE : MAX_LANES_DESKTOP}
        onOpenTask={openTask}
      />
    </div>
  );
}
