import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/http-error";
import { defaultQueryRetry, retryServerErrors } from "./index";

describe("retryServerErrors", () => {
  it("does not retry a 4xx, whose answer will not change", () => {
    expect(retryServerErrors(0, new HttpError(403, "Could not load"))).toBe(
      false,
    );
    expect(retryServerErrors(0, new HttpError(404, "Could not load"))).toBe(
      false,
    );
  });

  it("retries a server error like the default policy", () => {
    const error = new HttpError(500, "Could not load");
    expect(retryServerErrors(0, error)).toBe(true);
    expect(retryServerErrors(1, error)).toBe(true);
    expect(retryServerErrors(2, error)).toBe(false);
    expect(retryServerErrors(1, error)).toBe(defaultQueryRetry(1, error));
  });

  it("keeps the default policy's exceptions for network and 401 errors", () => {
    expect(retryServerErrors(0, new TypeError("Failed to fetch"))).toBe(false);
    expect(retryServerErrors(0, new HttpError(401, "Unauthorized"))).toBe(
      false,
    );
  });
});
