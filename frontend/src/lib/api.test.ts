import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MockAdapter from "axios-mock-adapter";
import { api } from "./api";

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(api);
});

afterEach(() => {
  mock.restore();
  vi.restoreAllMocks();
});

describe("api refresh race (Phase 7)", () => {
  it("shares ONE refresh between concurrent 401s and retries each request", async () => {
    let refreshCalls = 0;

    // First call to each protected endpoint returns 401. After the
    // refresh succeeds, the retry returns 200. Counting refresh hits
    // is the actual assertion — if the fix regresses, this jumps from
    // 1 to N (the number of concurrent calls).
    let firstAB = true;
    let firstCD = true;
    mock.onGet("/a/b").reply(() => (firstAB ? ((firstAB = false), [401, {}]) : [200, { ok: "ab" }]));
    mock.onGet("/c/d").reply(() => (firstCD ? ((firstCD = false), [401, {}]) : [200, { ok: "cd" }]));
    mock.onPost("/auth/refresh").reply(() => {
      refreshCalls += 1;
      return [200, { success: true, data: { user: { id: 1 } } }];
    });

    const [ab, cd] = await Promise.all([api.get("/a/b"), api.get("/c/d")]);
    expect(ab.data).toEqual({ ok: "ab" });
    expect(cd.data).toEqual({ ok: "cd" });
    expect(refreshCalls).toBe(1);
  });

  it("does not infinite-loop when /auth/refresh itself returns 401", async () => {
    mock.onPost("/auth/refresh").reply(401);
    mock.onGet("/protected").reply(401);
    await expect(api.get("/protected")).rejects.toBeTruthy();
  });
});
