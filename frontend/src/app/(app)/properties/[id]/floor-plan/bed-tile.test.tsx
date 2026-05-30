import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BedTile } from "./bed-tile";

const occupiedBed = {
  id: 1,
  bed_code: "PROP-0001-F1-R101-B1",
  bed_number: "1",
  bed_type: "single",
  status: "occupied",
  current_employee: {
    id: 7,
    code: "EMP-00007",
    full_name: "Jane Doe",
    division_name: "Operations",
    designation: "Carpenter",
  },
};

const emptyBed = {
  id: 2,
  bed_code: "PROP-0001-F1-R101-B2",
  bed_number: "2",
  bed_type: "bunk_lower",
  status: "empty",
  current_employee: null,
};

describe("FloorPlan BedTile", () => {
  it("renders the employee code as the visible label when occupied", () => {
    render(<BedTile bed={occupiedBed} onSelect={() => {}} />);
    expect(screen.getByText("EMP-00007")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /occupied by jane doe/i }),
    ).toBeInTheDocument();
  });

  it("falls back to bed_number for empty tiles and fires onSelect on click", async () => {
    const onSelect = vi.fn();
    const userEvent = (await import("@testing-library/user-event")).default;
    render(<BedTile bed={emptyBed} onSelect={onSelect} />);
    const btn = screen.getByRole("button", { name: /bed prop-0001-f1-r101-b2/i });
    expect(btn).toHaveTextContent("2");
    await userEvent.click(btn);
    expect(onSelect).toHaveBeenCalledWith(emptyBed);
  });
});
