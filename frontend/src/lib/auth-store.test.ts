import { beforeEach, describe, expect, it } from "vitest";
import { useAuth } from "./auth-store";

function makeUser(overrides: Partial<{ is_super_user: boolean; permissions: string[] }> = {}) {
  return {
    id: 1,
    username: "alice",
    email: "alice@example.com",
    full_name: "Alice",
    is_active: true,
    is_super_user: false,
    roles: [],
    permissions: [],
    ...overrides,
  };
}

describe("auth store", () => {
  beforeEach(() => {
    useAuth.getState().clear();
  });

  it("returns false when no user is signed in", () => {
    expect(useAuth.getState().has("property.view")).toBe(false);
  });

  it("super users pass every permission check", () => {
    useAuth.setState({ user: makeUser({ is_super_user: true, permissions: ["*"] }) });
    expect(useAuth.getState().has("anything.at.all")).toBe(true);
  });

  it("wildcard permission entry grants everything", () => {
    useAuth.setState({ user: makeUser({ permissions: ["*"] }) });
    expect(useAuth.getState().has("user.manage")).toBe(true);
  });

  it("matches an explicit code", () => {
    useAuth.setState({ user: makeUser({ permissions: ["property.view", "employee.view"] }) });
    expect(useAuth.getState().has("property.view")).toBe(true);
    expect(useAuth.getState().has("employee.view")).toBe(true);
    expect(useAuth.getState().has("settings.manage")).toBe(false);
  });

  it("setSession stores tokens and user atomically", () => {
    useAuth.getState().setSession({
      user: makeUser({ permissions: ["property.view"] }),
      access_token: "a.b.c",
      refresh_token: "r.t.k",
    });
    const s = useAuth.getState();
    expect(s.accessToken).toBe("a.b.c");
    expect(s.refreshToken).toBe("r.t.k");
    expect(s.user?.username).toBe("alice");
    expect(s.has("property.view")).toBe(true);
  });
});
