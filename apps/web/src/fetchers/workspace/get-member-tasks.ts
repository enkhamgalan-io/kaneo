import { client } from "@kaneo/libs";

async function getMemberTasks(workspaceId: string, userId: string) {
  const response = await client.workspace[":workspaceId"].members[
    ":userId"
  ].tasks.$get({
    param: { workspaceId, userId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export type MemberTasksResponse = Awaited<ReturnType<typeof getMemberTasks>>;
export type MemberTaskProject = MemberTasksResponse["projects"][number];
export type MemberTask = MemberTaskProject["tasks"][number];

export default getMemberTasks;
