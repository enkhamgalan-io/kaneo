import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function getMemberTaskCounts(workspaceId: string) {
  const response = await client.workspace[":workspaceId"].members[
    "task-counts"
  ].$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(response.status, "Could not load member task counts");
  }

  return response.json();
}

export type MemberTaskCount = Awaited<
  ReturnType<typeof getMemberTaskCounts>
>[number];

export default getMemberTaskCounts;
