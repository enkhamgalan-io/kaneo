export type MemberPageState =
  | "loading"
  | "no-permission"
  | "not-found"
  | "load-error"
  | "ready";

type MemberPageInput = {
  // The caller's own membership and capability checks.
  isLoadingMember: boolean;
  isMemberError: boolean;
  isCheckingPermissions: boolean;
  canViewTasks: boolean;
  // The member-tasks query. Only consulted once it is enabled, so "pending"
  // (no data yet) cannot mean a query that will never run.
  isPending: boolean;
  errorStatus: number | undefined;
  hasData: boolean;
};

// Every branch must settle: a pending state is only reported while a query is
// actually in flight, never merely because data is absent, or a failed or
// disabled membership lookup would leave the page on a skeleton forever.
export function resolveMemberPageState(
  input: MemberPageInput,
): MemberPageState {
  if (input.isLoadingMember || input.isCheckingPermissions) return "loading";
  // Without our own membership we cannot tell what the caller may see.
  if (input.isMemberError) return "load-error";
  // Also covers a membership lookup that never ran: the API would refuse too.
  if (!input.canViewTasks) return "no-permission";
  if (input.isPending) return "loading";
  // 403 and 404 are answers, even on a background refetch: access was revoked
  // or the member left the workspace.
  if (input.errorStatus === 403) return "no-permission";
  if (input.errorStatus === 404) return "not-found";
  // Any other failure only matters without data. A failed refetch keeps the
  // last good summary, so the views (and any open dialog) stay put instead of
  // being swapped for an error panel.
  if (!input.hasData) return "load-error";
  return "ready";
}
