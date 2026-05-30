"use client";

import * as React from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

/**
 * Thin wrapper around Radix Tooltip so feature components don't have to
 * wire up Provider + Root + Trigger + Content every time.
 *
 * Use for short, hover-only info — for action menus reach for a Modal or
 * Popover. The content is positioned above the trigger by default.
 */
export function Tooltip({
  children,
  content,
  side = "top",
  align = "center",
  delayDuration = 150,
  className,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayDuration?: number;
  className?: string;
}) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            align={align}
            sideOffset={6}
            className={
              "z-50 rounded-md border border-border bg-popover text-popover-foreground shadow-md px-3 py-2 text-xs " +
              "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out " +
              "data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 " +
              (className ?? "")
            }
          >
            {content}
            <RadixTooltip.Arrow className="fill-popover" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
