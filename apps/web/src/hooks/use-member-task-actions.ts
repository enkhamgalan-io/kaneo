import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateTaskStatus } from "@/hooks/mutations/task/use-update-task-status";
import {
  type MemberBoard,
  memberBoardQueryKey,
} from "@/hooks/queries/task/use-get-member-boards";
import {
  buildTaskProjects,
  moveTaskInBoard,
  sharedColumns,
} from "@/lib/member-board";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

/**
 * What a member's cross-project views need to act on tasks: each task's own
 * project, a status-only move with an optimistic update, and the statuses a
 * bulk change across a selection may offer.
 */
export function useMemberTaskActions(userId: string, boards: MemberBoard[]) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutateAsync: updateTaskStatus } = useUpdateTaskStatus();

  const taskProjects = useMemo(() => buildTaskProjects(boards), [boards]);

  const projectIdByTaskId = useMemo(
    () =>
      new Map(
        boards.flatMap((board) =>
          [
            ...board.columns.flatMap((column) => column.tasks),
            ...board.plannedTasks,
            ...board.archivedTasks,
          ].map((task) => [task.id, board.id] as const),
        ),
      ),
    [boards],
  );

  const moveTask = useCallback(
    async (task: Task, status: string) => {
      const key = memberBoardQueryKey(task.projectId, userId);
      // Stop an in-flight poll from landing on top of the optimistic move.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MemberBoard>(key);
      queryClient.setQueryData<MemberBoard>(key, (board) =>
        board ? moveTaskInBoard(board, task.id, status) : board,
      );

      try {
        // Status only: a whole-task write would also send a position, and
        // positions here are this member's slice of a shared column.
        await updateTaskStatus({ ...task, status });
        return true;
      } catch (error) {
        queryClient.setQueryData(key, previous);
        toast.error(
          error instanceof Error ? error.message : t("tasks:update.error"),
        );
        return false;
      }
    },
    [queryClient, userId, updateTaskStatus, t],
  );

  const getSharedColumns = useCallback(
    (taskIds: string[]) => {
      const projectIds = new Set(
        taskIds.flatMap((taskId) => {
          const projectId = projectIdByTaskId.get(taskId);
          return projectId ? [projectId] : [];
        }),
      );
      return sharedColumns(
        [...projectIds].flatMap((projectId) => {
          const project = taskProjects.get(projectId);
          return project ? [project] : [];
        }),
      );
    },
    [projectIdByTaskId, taskProjects],
  );

  // Projects a task can be created in with this status: every project for the
  // backlog, otherwise only those that have the column.
  const projectIdsWithStatus = useCallback(
    (status: string) =>
      boards
        .filter(
          (board) =>
            status === "planned" ||
            board.columns.some((column) => column.slug === status),
        )
        .map((board) => board.id),
    [boards],
  );

  return { taskProjects, moveTask, getSharedColumns, projectIdsWithStatus };
}
