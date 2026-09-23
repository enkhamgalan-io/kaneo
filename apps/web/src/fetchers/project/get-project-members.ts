import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function getProjectMembers(projectId: string) {
  const response = await client.project[":id"].members.$get({
    param: { id: projectId },
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return response.json();
}

export type ProjectMember = Awaited<
  ReturnType<typeof getProjectMembers>
>[number];

export default getProjectMembers;
