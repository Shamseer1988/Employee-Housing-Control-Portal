import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MockAdapter from "axios-mock-adapter";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { BedsPanel } from "./beds-panel";

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(api);
  // Stub a super-user so <Can perm="bed.manage"> always renders the Add row.
  useAuth.setState({
    user: {
      id: 1, username: "tester", email: "t@t", full_name: "Tester",
      is_active: true, is_super_user: true, roles: [], permissions: ["*"],
    },
    hydrated: true,
    bootstrapped: true,
  });
});

afterEach(() => {
  mock.restore();
  vi.restoreAllMocks();
  useAuth.setState({ user: null, hydrated: false, bootstrapped: false });
});

const sampleBed = (id: number) => ({
  id, bed_number: String(id), bed_code: `PROP-F1-R101-B${id}`,
  bed_type: "single", status: "empty", remarks: null,
});

describe("BedsPanel Add-bed gate (Phase 5 fix)", () => {
  it("enables the Add button when fetched bed count is below capacity", async () => {
    mock.onGet("/rooms/42/beds").reply(200, { data: [sampleBed(1), sampleBed(2)] });
    render(<BedsPanel room={{ id: 42, capacity: 3 }} onChanged={() => {}} onEditRoom={() => {}} />);
    const input = await screen.findByLabelText(/new bed number/i) as HTMLInputElement;
    await waitFor(() => expect(input.placeholder).toContain("capacity 2/3"));
    // Typing a bed number satisfies the non-empty rule; the capacity
    // check is the only remaining gate.
    await userEvent.type(input, "3");
    const btn = screen.getByRole("button", { name: /add bed/i });
    expect(btn).not.toBeDisabled();
  });

  it("disables the Add button when the fetched bed count equals capacity", async () => {
    mock.onGet("/rooms/42/beds").reply(200, {
      data: [sampleBed(1), sampleBed(2), sampleBed(3)],
    });
    render(<BedsPanel room={{ id: 42, capacity: 3 }} onChanged={() => {}} onEditRoom={() => {}} />);
    const btn = await screen.findByRole("button", { name: /add bed/i });
    await waitFor(() => expect(btn).toBeDisabled());
    expect(screen.getByText(/room at capacity/i)).toBeInTheDocument();
  });

  it("placeholder reflects beds.length, not the parent prop", async () => {
    // The whole bug was that the parent's stale room.bed_counts.total drove
    // the placeholder/disabled state. After the fix the count comes from
    // the panel's own fetched beds list — so a room prop without
    // bed_counts should still show the right number.
    mock.onGet("/rooms/7/beds").reply(200, { data: [sampleBed(1)] });
    render(<BedsPanel room={{ id: 7, capacity: 4 }} onChanged={() => {}} onEditRoom={() => {}} />);
    const input = await screen.findByLabelText(/new bed number/i) as HTMLInputElement;
    await waitFor(() => expect(input.placeholder).toContain("capacity 1/4"));
  });
});
