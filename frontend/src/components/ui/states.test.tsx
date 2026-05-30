import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, Skeleton, SkeletonRow, SkeletonTable } from "./states";

describe("state components", () => {
  it("renders EmptyState with title and hint", () => {
    render(<EmptyState title="Nothing here" hint="Try a different filter" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Try a different filter")).toBeInTheDocument();
  });

  it("ErrorState shows message and invokes retry", async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Could not load report" onRetry={onRetry} />);
    expect(screen.getByText("Could not load report")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("Skeleton applies extra className", () => {
    const { container } = render(<Skeleton className="h-8 w-32" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/skeleton/);
    expect(el.className).toMatch(/h-8/);
    expect(el.className).toMatch(/w-32/);
  });

  it("SkeletonTable emits the requested number of rows and cells", () => {
    render(
      <table>
        <SkeletonTable rows={3} columns={4} />
      </table>,
    );
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelectorAll("td")).toHaveLength(4);
  });

  it("SkeletonRow respects the column count", () => {
    render(
      <table>
        <tbody>
          <SkeletonRow columns={5} />
        </tbody>
      </table>,
    );
    expect(screen.getByRole("row").querySelectorAll("td")).toHaveLength(5);
  });
});
