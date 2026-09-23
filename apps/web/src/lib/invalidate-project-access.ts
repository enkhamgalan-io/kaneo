import type { QueryClient } from "@tanstack/react-query";

/**
 * Refetches everything that depends on which projects the user can reach,
 * after their project memberships, their role or a role's permissions change.
 * A project that is no longer reachable then answers 404: its page shows as
 * not available and it drops out of every list.
 */
export function invalidateProjectAccess(queryClient: QueryClient) {
  for (const queryKey of [
    ["projects"],
    ["tasks"],
    ["task"],
    ["task-relations"],
    ["project-members"],
    ["workspace"],
    ["search"],
    ["workspace-capabilities"],
    ["workspace-user"],
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
