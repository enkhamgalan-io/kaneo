import { useEffect, useRef } from "react";
import { useGetMemberBoards } from "@/hooks/queries/task/use-get-member-boards";
import { useMemberView } from "./member-view-context";

/**
 * The boards behind a member's view tabs. When a project's board starts
 * failing, the summary is refreshed once: the likeliest cause is a project
 * deleted or archived since it loaded, and a fresh summary drops it from the
 * projects the views load.
 */
export function useMemberBoards() {
  const { userId, projectIds, refreshSummary } = useMemberView();
  const result = useGetMemberBoards(userId, projectIds);

  const previousFailedCountRef = useRef(0);
  useEffect(() => {
    if (result.failedCount > previousFailedCountRef.current) {
      refreshSummary();
    }
    previousFailedCountRef.current = result.failedCount;
  }, [result.failedCount, refreshSummary]);

  return result;
}
