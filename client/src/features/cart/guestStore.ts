import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { CartItemSnapshot } from "@shared"

/**
 * Guest-only cart. Logged-in users get a real DB-backed cart (see
 * `features/cart/serverCart.ts`) - this store only backs browsing before
 * sign-in. `features/cart/useCart.ts` is the seam that picks between this
 * and the server cart; nothing outside `features/cart/` should import
 * this file directly.
 *
 * Several seeded products ship with zero variants, so this store
 * legitimately adds lines with neither `variantId` nor `customBuildId`
 * set - matches `CartItemSnapshotSchema`'s "both unset is valid" rule
 * (see shared/src/cart.ts).
 */
interface AddCartItemInput {
  productId: string
  variantId?: string
  /** Pre-composed display name, e.g. "Monolith 60 - Graphite Aluminum". */
  name: string
  /** Cents. */
  unitPrice: number
  quantity: number
}

interface GuestCartState {
  items: CartItemSnapshot[]
  addItem: (input: AddCartItemInput) => void
  updateQuantity: (itemId: string, quantity: number) => void
  removeItem: (itemId: string) => void
  /** Called once, right after a successful `POST /api/cart/merge` - see `useCartMergeOnSignIn`. */
  clear: () => void
}

function sameLine(a: CartItemSnapshot, productId: string, variantId: string | undefined): boolean {
  return a.productId === productId && a.variantId === variantId
}

export const useGuestCartStore = create<GuestCartState>()(
  persist(
    (set) => ({
      items: [],

      addItem: (input) => {
        set((state) => {
          const existingIndex = state.items.findIndex((item) =>
            sameLine(item, input.productId, input.variantId),
          )
          if (existingIndex === -1) {
            const newItem: CartItemSnapshot = {
              id: crypto.randomUUID(),
              productId: input.productId,
              variantId: input.variantId,
              name: input.name,
              quantity: input.quantity,
              unitPrice: input.unitPrice,
              lineTotal: input.unitPrice * input.quantity,
            }
            return { items: [...state.items, newItem] }
          }

          const items = [...state.items]
          const existing = items[existingIndex]
          if (!existing) return state
          const quantity = existing.quantity + input.quantity
          items[existingIndex] = { ...existing, quantity, lineTotal: quantity * existing.unitPrice }
          return { items }
        })
      },

      updateQuantity: (itemId, quantity) => {
        const safeQuantity = Math.max(1, Math.trunc(quantity))
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId
              ? { ...item, quantity: safeQuantity, lineTotal: safeQuantity * item.unitPrice }
              : item,
          ),
        }))
      },

      removeItem: (itemId) => {
        set((state) => ({ items: state.items.filter((item) => item.id !== itemId) }))
      },

      clear: () => set({ items: [] }),
    }),
    {
      name: "clackforge:cart",
      partialize: (state) => ({ items: state.items }),
    },
  ),
)
