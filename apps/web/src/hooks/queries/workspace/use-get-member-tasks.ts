import { useQuery } from "@tanstack/react-query";
import getMemberTasks from "@/fetchers/workspace/get-member-tasks";
import { retryServerErrors } from "@/query-client";

function useGetMemberTasks(
  workspaceId: string,
  userId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "member-tasks", userId],
    queryFn: () => getMemberTasks(workspaceId, userId),
    enabled: enabled && !!workspaceId && !!userId,
    // The app defaults refetchOnMount to false, and task mutations invalidate
    // per-project keys this workspace-wide view is not under. Without this, a
    // task moved on a board stays stale here until a full reload.
    refetchOnMount: "always",
    retry: retryServerErrors,
  });
}

export default useGetMemberTasks;
