import { useQuery } from "@tanstack/react-query";
import getTasks from "@/fetchers/task/get-tasks";
import { isClientError } from "@/lib/http-error";
import { retryServerErrors } from "@/query-client";

export function useGetTasks(projectId: string) {
  return useQuery({
    queryKey: ["tasks", projectId],
    queryFn: () => getTasks(projectId),
    // A 4xx (signed out, or a project the user cannot reach) will not change
    // by polling.
    refetchInterval: (query) =>
      isClientError(query.state.error) ? false : 30000,
    retry: retryServerErrors,
    enabled: !!projectId,
  });
}
