import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WorkspaceUser,
  WorkspaceUserInvitation,
} from "@/types/workspace-user";
import MembersTable from "./members-table";

const copyToClipboard = vi.fn();
const success = vi.fn();
const error = vi.fn();

vi.mock("@/lib/copy-to-clipboard", () => ({
  copyToClipboard: (text: string) => copyToClipboard(text),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    success: (msg: string) => success(msg),
    error: (msg: string) => error(msg),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/format", () => ({
  formatDateMedium: () => "Sep 1, 2026",
}));

vi.mock("@/hooks/mutations/workspace-user/use-cancel-invitation", () => ({
  default: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/mutations/workspace-user/use-delete-workspace-user", () => ({
  default: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock(
  "@/hooks/mutations/workspace-user/use-update-workspace-user-role",
  () => ({
    default: () => ({ mutateAsync: vi.fn() }),
  }),
);

vi.mock("@/hooks/queries/workspace/use-workspace-roles", () => ({
  default: () => ({ data: [] }),
}));

const memberTaskCounts = vi.fn(
  (_workspaceId: string, _options?: { enabled?: boolean }) => ({
    data: [] as unknown[],
  }),
);

vi.mock("@/hooks/queries/workspace/use-get-member-task-counts", () => ({
  default: (workspaceId: string, options?: { enabled?: boolean }) =>
    memberTaskCounts(workspaceId, options),
}));

const navigate = vi.fn();

// Renders the route target into data attributes so a test can assert where
// the link points without a router.
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string;
    params: Record<string, string>;
    children: ReactNode;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href="#member"
      data-to={to}
      data-params={JSON.stringify(params)}
      {...rest}
    >
      {children}
    </a>
  ),
}));

const canInviteUsers = vi.fn(() => true);
const canReadTasks = vi.fn(() => true);

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canManageTeam: () => true,
    canRemoveMembers: () => true,
    canInviteUsers: () => canInviteUsers(),
    canReadTasks: () => canReadTasks(),
  }),
}));

vi.mock("../providers/auth-provider/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "current-user" } }),
}));

beforeEach(() => {
  canInviteUsers.mockReturnValue(true);
  canReadTasks.mockReturnValue(true);
  memberTaskCounts.mockReturnValue({ data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pendingInvitation = {
  id: "invite-1",
  email: "invitee@example.com",
  role: "member",
  status: "pending",
  expiresAt: "2026-09-01T00:00:00.000Z",
} as unknown as WorkspaceUserInvitation;

describe("MembersTable pending invitation row menu", () => {
  it("copies the invitation link for that invitation when 'Copy link' is clicked", async () => {
    copyToClipboard.mockResolvedValue(true);

    render(
      <MembersTable
        workspaceId="workspace-1"
        invitations={[pendingInvitation]}
        users={[] as WorkspaceUser[]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "team:membersTable.ariaInvitationActions",
      }),
    );

    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: "team:invitations.copyLink",
      }),
    );

    expect(copyToClipboard).toHaveBeenCalledWith(
      `${window.location.origin}/invitation/accept/invite-1`,
    );
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith("team:invitations.linkCopied"),
    );
  });

  it("still opens the cancel confirmation dialog instead of cancelling directly", async () => {
    render(
      <MembersTable
        workspaceId="workspace-1"
        invitations={[pendingInvitation]}
        users={[] as WorkspaceUser[]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "team:membersTable.ariaInvitationActions",
      }),
    );

    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: "team:membersTable.cancelInvitation",
      }),
    );

    expect(
      await screen.findByText("team:membersTable.cancelDialogTitle"),
    ).toBeVisible();
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it("hides the row menu entirely when the user lacks canInvite", () => {
    canInviteUsers.mockReturnValue(false);

    render(
      <MembersTable
        workspaceId="workspace-1"
        invitations={[pendingInvitation]}
        users={[] as WorkspaceUser[]}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: "team:membersTable.ariaInvitationActions",
      }),
    ).toBeNull();
  });
});

const member = {
  id: "membership-1",
  userId: "user-1",
  role: "member",
  createdAt: "2026-09-01T00:00:00.000Z",
  user: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    image: null,
  },
} as unknown as WorkspaceUser;

describe("MembersTable member rows", () => {
  it("opens the member's task page keyed on the user id, not the membership id", () => {
    render(
      <MembersTable
        workspaceId="workspace-1"
        invitations={[]}
        users={[member]}
      />,
    );

    // Anywhere on the row outside the name link, e.g. the email line.
    fireEvent.click(screen.getByText("ada@example.com"));

    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/members/$userId",
      params: { workspaceId: "workspace-1", userId: "user-1" },
    });
  });

  it("renders the member's name as a real link to the same page", () => {
    render(
      <MembersTable
        workspaceId="workspace-1"
        invitations={[]}
        users={[member]}
      />,
    );

    const link = screen.getByRole("link", { name: "Ada Lovelace" });

    expect(link).toHaveAttribute(
      "data-to",
      "/dashboard/workspace/$workspaceId/members/$userId",
    );
    expect(JSON.parse(link.getAttribute("data-params") ?? "{}")).toEqual({
      workspaceId: "workspace-1",
      userId: "user-1",
    });
  });

  it("does not also navigate through the row when the name link is clicked", () => {
    render(
      <MembersTable
        workspaceId="workspace-1"
        invitations={[]}
        users={[member]}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "Ada Lovelace" }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it("hides the Tasks column and the drill-down without task:read", () => {
    canReadTasks.mockReturnValue(false);
    memberTaskCounts.mockReturnValue({
      data: [{ userId: "user-1", openCount: 4, overdueCount: 2 }],
    });

    render(
      <MembersTable
        workspaceId="workspace-1"
        invitations={[]}
        users={[member]}
      />,
    );

    // The counts query is not allowed to fire, so it never 403s.
    expect(memberTaskCounts).toHaveBeenCalledWith("workspace-1", {
      enabled: false,
    });
    expect(screen.queryByText("team:membersTable.columns.tasks")).toBeNull();
    expect(screen.queryByText("team:membersTable.openTasks")).toBeNull();
    expect(screen.queryByRole("link", { name: "Ada Lovelace" })).toBeNull();

    fireEvent.click(screen.getByText("ada@example.com"));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not navigate when the row action menu is opened", async () => {
    render(
      <MembersTable
        workspaceId="workspace-1"
        invitations={[]}
        users={[member]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "team:membersTable.ariaRemoveMember",
      }),
    );

    expect(
      await screen.findByRole("menuitem", {
        name: "team:membersTable.removeMember",
      }),
    ).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not navigate when the role select is opened", () => {
    render(
      <MembersTable
        workspaceId="workspace-1"
        invitations={[]}
        users={[member]}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));

    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows open and overdue counts for the member", () => {
    memberTaskCounts.mockReturnValue({
      data: [{ userId: "user-1", openCount: 4, overdueCount: 2 }],
    });

    render(
      <MembersTable
        workspaceId="workspace-1"
        invitations={[]}
        users={[member]}
      />,
    );

    expect(screen.getByText("team:membersTable.openTasks")).toBeVisible();
    expect(screen.getByText("team:membersTable.overdueTasks")).toBeVisible();
  });

  it("shows a placeholder when the member has no open or overdue work", () => {
    render(
      <MembersTable
        workspaceId="workspace-1"
        invitations={[]}
        users={[member]}
      />,
    );

    expect(screen.queryByText("team:membersTable.openTasks")).toBeNull();
  });
});
