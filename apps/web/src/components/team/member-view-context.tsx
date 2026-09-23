import { createContext, type ReactNode, useContext } from "react";
import type { MemberTasksResponse } from "@/fetchers/workspace/get-member-tasks";

type MemberViewContextValue = {
  workspaceId: string;
  userId: string;
  data: MemberTasksResponse;
  // Projects the view tabs load boards for: every project the member has a
  // task in, minus archived ones, which project views hide as well.
  projectIds: string[];
  openTask: (taskId: string) => void;
  // Refetches the summary (and the members table's counts), e.g. after a task
  // was created in a project the member had no tasks in yet, which the views
  // only start loading once the summary lists it.
  refreshSummary: () => void;
  // Refetches the summary only if a task was edited since it was loaded. The
  // views' edits (drags, bulk changes, Gantt, the context menu) go through
  // mutations that never touch the summary's key.
  refreshSummaryIfStale: () => void;
};

const MemberViewContext = createContext<MemberViewContextValue | null>(null);

// The member layout loads the summary once and hands it to whichever tab is
// open. Reading it through a second query observer would refetch it on every
// tab switch, since that query refetches on mount.
export function MemberViewProvider({
  value,
  children,
}: {
  value: MemberViewContextValue;
  children: ReactNode;
}) {
  return (
    <MemberViewContext.Provider value={value}>
      {children}
    </MemberViewContext.Provider>
  );
}

export function useMemberView(): MemberViewContextValue {
  const value = useContext(MemberViewContext);
  if (!value) {
    throw new Error("useMemberView must be used inside the member layout");
  }
  return value;
}
