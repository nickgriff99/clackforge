import type { OrderStatus } from "@shared"

/**
 * Display copy for the Placed → Building → Shipped → Delivered timeline
 * (PROJECT_SPECS.md §5 Account). No admin controls to advance status yet -
 * that's a later phase - this is read-only display.
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  Placed: "Placed",
  Building: "Building",
  Shipped: "Shipped",
  Delivered: "Delivered",
}

/** Badge variant per status - matches `components/ui/badge.tsx`'s variant set. */
export const ORDER_STATUS_BADGE_VARIANT: Record<OrderStatus, "secondary" | "outline" | "default"> = {
  Placed: "secondary",
  Building: "outline",
  Shipped: "outline",
  Delivered: "default",
}
