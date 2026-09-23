import { useMutation, useQueryClient } from "@tanstack/react-query";
import addProjectMember from "@/fetchers/project/add-project-member";
import removeProjectMember from "@/fetchers/project/remove-project-member";
import { projectMembersQueryKey } from "@/hooks/queries/project/use-get-project-members";

// Both answer with the project's updated member list, which replaces the
// cached one; the person whose access changed is told over their own socket.
export function useAddProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => addProjectMember({ projectId, userId }),
    onSuccess: (members) => {
      queryClient.setQueryData(projectMembersQueryKey(projectId), members);
    },
  });
}

export function useRemoveProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeProjectMember({ projectId, userId }),
    onSuccess: (members) => {
      queryClient.setQueryData(projectMembersQueryKey(projectId), members);
    },
  });
}
