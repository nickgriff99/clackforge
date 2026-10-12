import { Link } from "react-router-dom"
import { ShoppingCart } from "lucide-react"
import { toast } from "sonner"
import type { CartItemSnapshot } from "@shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCart } from "@/features/cart/useCart"
import { CartItemRow } from "@/features/cart/CartItemRow"
import { CartSummary } from "@/features/cart/CartSummary"

/** `compact` renders the slide-over variant (header Sheet); full variant is the `/cart` page. */
export function CartList({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { items, isLoading, serverNow, addItem, updateQuantity, removeItem } = useCart()

  function handleRemove(item: CartItemSnapshot) {
    removeItem(item.id)
    toast(`Removed ${item.name}`, {
      action: {
        // Undo re-adds rather than reinserting at the original index, so it
        // works the same whether the cart is local or server-synced - both
        // add-item paths dedup/merge by productId+variantId.
        label: "Undo",
        onClick: () =>
          addItem({
            productId: item.productId,
            variantId: item.variantId,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
          }),
      },
    })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <ShoppingCart className="size-8 text-muted-foreground" />
        <p className="font-heading text-lg">Your cart is empty.</p>
        <Button render={<Link to="/shop" onClick={onNavigate} />}>Browse the shop</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        {items.map((item) => (
          <CartItemRow
            key={item.id}
            item={item}
            serverNow={serverNow}
            onUpdateQuantity={(quantity) => updateQuantity(item.id, quantity)}
            onRemove={() => handleRemove(item)}
          />
        ))}
      </div>

      <CartSummary items={items} />

      {compact ? (
        <Button render={<Link to="/cart" onClick={onNavigate} />} variant="outline">
          View full cart
        </Button>
      ) : (
        <Button render={<Link to="/checkout" onClick={onNavigate} />} size="lg">
          Checkout
        </Button>
      )}
    </div>
  )
}
