import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function getTasks(
  projectId: string,
  { assigneeId }: { assigneeId?: string } = {},
) {
  const response = await client.task.tasks[":projectId"].$get({
    param: { projectId },
    // No pagination: the route returns the whole board on a single page. The
    // assignee filter keeps every column, empty ones included, so a filtered
    // board has the same shape as the full one.
    query: assigneeId ? { assigneeId } : {},
  });

  if (!response.ok) {
    throw new HttpError(response.status, "Failed to fetch tasks");
  }

  const json = await response.json();

  return json.data;
}

export default getTasks;
