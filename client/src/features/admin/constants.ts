import type { ProductStatus } from "@shared"

/** Display copy + badge variant for `ProductStatusSchema`'s lowercase wire values - same convention as `features/orders/constants.ts`'s `ORDER_STATUS_LABELS`/`ORDER_STATUS_BADGE_VARIANT`. */
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
}

export const PRODUCT_STATUS_BADGE_VARIANT: Record<ProductStatus, "default" | "secondary" | "outline"> = {
  active: "default",
  draft: "secondary",
  archived: "outline",
}
