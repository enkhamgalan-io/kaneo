import { useQuery } from "@tanstack/react-query";
import getMemberTaskCounts from "@/fetchers/workspace/get-member-task-counts";

function useGetMemberTaskCounts(workspaceId: string) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "member-task-counts"],
    queryFn: () => getMemberTaskCounts(workspaceId),
    enabled: !!workspaceId,
  });
}

export default useGetMemberTaskCounts;
