import { useQuery } from "@tanstack/react-query";
import getProjectMembers from "@/fetchers/project/get-project-members";
import { retryServerErrors } from "@/query-client";

export function projectMembersQueryKey(projectId: string) {
  return ["project-members", projectId] as const;
}

// Everyone who can reach the project: its members plus the people whose role
// reaches every project. Also the people a task in it can be assigned to.
function useGetProjectMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: projectMembersQueryKey(projectId ?? ""),
    queryFn: () => getProjectMembers(projectId ?? ""),
    enabled: !!projectId,
    retry: retryServerErrors,
  });
}

export default useGetProjectMembers;
