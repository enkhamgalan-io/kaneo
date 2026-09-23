import { useQuery } from "@tanstack/react-query";
import getMemberTaskCounts from "@/fetchers/workspace/get-member-task-counts";
import { retryServerErrors } from "@/query-client";

function useGetMemberTaskCounts(
  workspaceId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "member-task-counts"],
    queryFn: () => getMemberTaskCounts(workspaceId),
    enabled: enabled && !!workspaceId,
    // See use-get-member-tasks: task edits elsewhere never invalidate this key.
    refetchOnMount: "always",
    retry: retryServerErrors,
  });
}

export default useGetMemberTaskCounts;
