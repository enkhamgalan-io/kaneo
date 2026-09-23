import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import getTasks from "@/fetchers/task/get-tasks";
import { isUnauthorizedError } from "@/lib/http-error";

export type MemberBoard = Awaited<ReturnType<typeof getTasks>>;

// Nested under the project's own ["tasks", projectId] key on purpose: every
// task mutation, bulk operation, label sync and project socket already
// invalidates that prefix, so these boards stay in step with no extra wiring.
// It must hold the same board shape as the full project query, because some of
// those callers rewrite every ["tasks", ...] entry in place.
export function memberBoardQueryKey(projectId: string, userId: string) {
  return ["tasks", projectId, "assignee", userId] as const;
}

function combineBoards(results: UseQueryResult<MemberBoard>[]) {
  // A board whose refetch failed keeps its last data and keeps showing; only
  // one with nothing to show counts as failed.
  const failedCount = results.filter(
    (result) => result.isError && result.data === undefined,
  ).length;

  return {
    boards: results.flatMap((result) => (result.data ? [result.data] : [])),
    // Every board has to arrive before a merged view renders, or columns and
    // rows would reshuffle as each project lands.
    isPending: results.some((result) => result.isPending),
    // Only when nothing could load; otherwise the views show what did, with a
    // notice for the rest.
    isError: results.length > 0 && failedCount === results.length,
    failedCount,
  };
}

/**
 * One assignee-filtered board per project, in the order given. These are full
 * board tasks (description, assignee, position, labels), which the shared
 * task components and the whole-task update rely on; the member summary
 * endpoint's trimmed tasks are not safe to write back.
 */
export function useGetMemberBoards(
  userId: string,
  projectIds: string[],
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: memberBoardQueryKey(projectId, userId),
      queryFn: () => getTasks(projectId, { assigneeId: userId }),
      enabled: enabled && !!userId,
      // Fresh for a poll interval, so switching between the member's views
      // reuses the boards instead of refetching every project each time. An
      // invalidated board is stale regardless and refetches on mount.
      staleTime: 30_000,
      refetchOnMount: true,
      refetchInterval: (query: { state: { error: unknown } }) =>
        isUnauthorizedError(query.state.error) ? false : 30_000,
    })),
    combine: combineBoards,
  });
}
