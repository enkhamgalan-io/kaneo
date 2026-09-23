import { describe, expect, it } from "vitest";
import { resolveMemberPageState } from "./member-page-state";

const settled = {
  isLoadingMember: false,
  isMemberError: false,
  isCheckingPermissions: false,
  canViewTasks: true,
  isPending: false,
  errorStatus: undefined,
  hasError: false,
  hasData: true,
};

describe("resolveMemberPageState", () => {
  it("is ready once permissions and data have both arrived", () => {
    expect(resolveMemberPageState(settled)).toBe("ready");
  });

  it("waits while the caller's membership or capabilities are loading", () => {
    expect(
      resolveMemberPageState({
        ...settled,
        isLoadingMember: true,
        canViewTasks: false,
      }),
    ).toBe("loading");
    expect(
      resolveMemberPageState({
        ...settled,
        isCheckingPermissions: true,
        canViewTasks: false,
      }),
    ).toBe("loading");
  });

  it("does not wait forever when the caller's membership lookup failed", () => {
    // The regression this guards: an errored lookup leaves the member data
    // undefined, which used to read as "still loading" with nothing to retry it.
    expect(
      resolveMemberPageState({
        ...settled,
        isMemberError: true,
        canViewTasks: false,
        isPending: true,
        hasData: false,
      }),
    ).toBe("load-error");
  });

  it("does not wait forever when the membership lookup never ran", () => {
    // A disabled query is neither loading nor errored, and no role means no
    // task:read, so the page settles on the answer the API would give.
    expect(
      resolveMemberPageState({
        ...settled,
        canViewTasks: false,
        isPending: true,
        hasData: false,
      }),
    ).toBe("no-permission");
  });

  it("waits for the member-tasks query once it is allowed to run", () => {
    expect(
      resolveMemberPageState({ ...settled, isPending: true, hasData: false }),
    ).toBe("loading");
  });

  it("maps the API's answers to distinct states", () => {
    const failed = { ...settled, hasError: true, hasData: false };
    expect(resolveMemberPageState({ ...failed, errorStatus: 403 })).toBe(
      "no-permission",
    );
    expect(resolveMemberPageState({ ...failed, errorStatus: 404 })).toBe(
      "not-found",
    );
    expect(resolveMemberPageState({ ...failed, errorStatus: 500 })).toBe(
      "load-error",
    );
    // A network failure never produced a status at all.
    expect(resolveMemberPageState({ ...failed, errorStatus: undefined })).toBe(
      "load-error",
    );
  });
});
