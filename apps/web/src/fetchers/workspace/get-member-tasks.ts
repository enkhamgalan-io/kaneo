import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function getMemberTasks(workspaceId: string, userId: string) {
  const response = await client.workspace[":workspaceId"].members[
    ":userId"
  ].tasks.$get({
    param: { workspaceId, userId },
  });

  if (!response.ok) {
    throw new HttpError(response.status, "Could not load member tasks");
  }

  return response.json();
}

export type MemberTasksResponse = Awaited<ReturnType<typeof getMemberTasks>>;
export type MemberTaskProject = MemberTasksResponse["projects"][number];
export type MemberTask = MemberTaskProject["tasks"][number];

export default getMemberTasks;
