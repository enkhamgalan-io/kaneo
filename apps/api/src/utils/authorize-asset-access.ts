import type { Context } from "hono";
import { resolveAssetBearerOrCookie } from "./authenticate-api-request";
import { authorizeProjectAccess } from "./project-access";

type AssetAccessTarget = {
  projectId: string;
  isPublic: boolean | null;
};

/**
 * Authorizes a request for a stored asset: readable by anyone when its project
 * is public, otherwise by whoever can reach the project (workspace, then
 * project access).
 *
 * The credential check must be skipped entirely for public projects:
 * `resolveAssetBearerOrCookie` throws a 401 for anonymous callers rather than
 * returning an empty user, so calling it first makes the public case
 * unreachable.
 */
export async function authorizeAssetAccess(
  c: Context,
  asset: AssetAccessTarget,
): Promise<void> {
  if (asset.isPublic) {
    return;
  }

  const { userId, apiKeyId, apiKeyPermissions } =
    await resolveAssetBearerOrCookie(c);
  await authorizeProjectAccess({
    userId,
    projectId: asset.projectId,
    apiKeyId,
    apiKeyPermissions,
    notFoundMessage: "Asset not found",
  });
}
