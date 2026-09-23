import { useMemo } from "react";
import useGetProjectMembers from "./use-get-project-members";

/**
 * The people a task in the project can be assigned to (its members, and
 * those whose role reaches every project), shaped like the workspace member
 * list the assignee pickers read, so a picker only swaps its data source.
 * Display-only lookups keep the workspace list: a task can still be assigned
 * to someone who has since left the project.
 */
export function useAssignableUsers(projectId: string | undefined) {
  const query = useGetProjectMembers(projectId);

  const data = useMemo(
    () =>
      query.data
        ? {
            members: query.data.map((member) => ({
              userId: member.id,
              user: {
                id: member.id,
                name: member.name,
                email: member.email,
                image: member.image ?? undefined,
              },
            })),
          }
        : undefined,
    [query.data],
  );

  return { data, isPending: query.isPending, isError: query.isError };
}
