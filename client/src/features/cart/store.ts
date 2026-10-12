/**
 * This file used to be the cart's only store (guest-only). Now that
 * logged-in carts are DB-backed, nothing outside `features/cart/` should
 * reach for a single "the" cart store directly - components read through
 * `features/cart/useCart.ts`'s `useCart()` instead, which picks between
 * the guest store (`features/cart/guestStore.ts`) and the server-synced
 * cart (`features/cart/serverCart.ts`) based on `useAuth()`. Left as a
 * no-op rather than deleted, so a stale import fails loudly at compile
 * time instead of silently resurrecting a second, out-of-sync guest cart.
 */
export {}
