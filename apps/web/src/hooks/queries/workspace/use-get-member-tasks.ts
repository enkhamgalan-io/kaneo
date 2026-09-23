import { useQuery } from "@tanstack/react-query";
import getMemberTasks from "@/fetchers/workspace/get-member-tasks";

function useGetMemberTasks(workspaceId: string, userId: string) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "member-tasks", userId],
    queryFn: () => getMemberTasks(workspaceId, userId),
    enabled: !!workspaceId && !!userId,
  });
}

export default useGetMemberTasks;
