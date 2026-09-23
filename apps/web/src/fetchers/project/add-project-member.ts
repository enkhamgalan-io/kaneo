import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function addProjectMember({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) {
  const response = await client.project[":id"].members.$post({
    param: { id: projectId },
    json: { userId },
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return response.json();
}

export default addProjectMember;
