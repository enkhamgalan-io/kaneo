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
  hasError: boolean;
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
  if (input.errorStatus === 403) return "no-permission";
  if (input.errorStatus === 404) return "not-found";
  if (input.hasError || !input.hasData) return "load-error";
  return "ready";
}
