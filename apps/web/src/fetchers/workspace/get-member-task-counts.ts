import { client } from "@kaneo/libs";

async function getMemberTaskCounts(workspaceId: string) {
  const response = await client.workspace[":workspaceId"].members[
    "task-counts"
  ].$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export type MemberTaskCount = Awaited<
  ReturnType<typeof getMemberTaskCounts>
>[number];

export default getMemberTaskCounts;
