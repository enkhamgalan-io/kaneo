import { describe, expect, it } from "vitest";
import {
  humanizeStatus,
  isCompletedStatus,
} from "../../../apps/api/src/workspace/controllers/member-task-status";

describe("isCompletedStatus", () => {
  it("treats the archived status as complete regardless of the column", () => {
    expect(isCompletedStatus("archived", null)).toBe(true);
    expect(isCompletedStatus("archived", false)).toBe(true);
  });

  it("prefers the column's isFinal flag over the slug", () => {
    // A project can rename or re-flag its columns, so a slug called "done"
    // that is no longer final must not count as complete.
    expect(isCompletedStatus("done", false)).toBe(false);
    // ...and a custom final column counts even though its slug is not "done".
    expect(isCompletedStatus("shipped", true)).toBe(true);
  });

  it("falls back to the done slug only when no column row exists", () => {
    expect(isCompletedStatus("done", null)).toBe(true);
    expect(isCompletedStatus("in-progress", null)).toBe(false);
    expect(isCompletedStatus("planned", null)).toBe(false);
  });
});

describe("humanizeStatus", () => {
  it("renders slugs that have no column row behind them", () => {
    expect(humanizeStatus("planned")).toBe("Planned");
    expect(humanizeStatus("in-progress")).toBe("In Progress");
    expect(humanizeStatus("waiting_on_review")).toBe("Waiting On Review");
  });

  it("leaves an empty status empty rather than throwing", () => {
    expect(humanizeStatus("")).toBe("");
  });
});
