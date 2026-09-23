import { HTTPException } from "hono/http-exception";
import { usersWithProjectAccess } from "./project-access";

const NOT_ASSIGNABLE = "Assignee is not a member of this project";

// A task can be assigned only to someone who can open it: a member of its
// project, or a workspace member whose role reaches every project (and
// instance admins).
export async function filterAssignableUsers(
  userIds: string[],
  projectId: string,
): Promise<Set<string>> {
  return usersWithProjectAccess(projectId, userIds);
}

export async function assertAssignableUser(
  userId: string,
  projectId: string,
): Promise<void> {
  const assignable = await filterAssignableUsers([userId], projectId);

  if (!assignable.has(userId)) {
    throw new HTTPException(403, { message: NOT_ASSIGNABLE });
  }
}
