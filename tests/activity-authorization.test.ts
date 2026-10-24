import { describe, expect, it } from "vitest";
import { authorizationCounts, authorizationState } from "../src/lib/activityAuthorization";

describe("respuesta explícita de autorización", () => {
  it("no infiere consentimiento de participación automática o registros antiguos", () => {
    expect(authorizationState()).toBe("pending");
    expect(authorizationState({ participating: true })).toBe("pending");
    expect(authorizationState({ participating: false })).toBe("pending");
    expect(authorizationState({ authorizationResponse: true })).toBe("pending");
  });
  it("distingue no respuesta de una negativa con autor y fecha", () => {
    const receipt = { authorizationBy: "guardian", authorizationAt: "2026-10-24T12:00:00Z" };
    expect(authorizationState({ ...receipt, authorizationResponse: false })).toBe("declined");
    expect(authorizationState({ ...receipt, authorizationResponse: true })).toBe("authorized");
    expect(authorizationCounts([
      undefined, { participating: true },
      { ...receipt, authorizationResponse: false },
      { ...receipt, authorizationResponse: true },
    ])).toEqual({ pending: 2, responded: 2, authorized: 1, declined: 1 });
  });
});
