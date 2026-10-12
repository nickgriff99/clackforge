import { Link } from "react-router-dom"
import { ShoppingCart } from "lucide-react"
import { Seo } from "@/components/seo/Seo"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CartItemRow } from "@/features/cart/CartItemRow"
import { CartSummary } from "@/features/cart/CartSummary"
import { useCart } from "@/features/cart/useCart"
import { checkoutErrorMessage, useCreateCheckoutSessionMutation } from "@/features/checkout/useCheckout"
import { ProtectedRoute } from "@/lib/auth"

function CheckoutContent() {
  const { items, isLoading, serverNow, updateQuantity, removeItem } = useCart()
  const payMutation = useCreateCheckoutSessionMutation()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Skeleton className="mb-8 h-8 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="mb-8 font-heading text-3xl">Checkout</h1>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <ShoppingCart className="size-8 text-muted-foreground" />
          <p className="font-heading text-lg">Your cart is empty.</p>
          <p className="text-sm text-muted-foreground">Add something from the shop before checking out.</p>
          <Button render={<Link to="/shop" />}>Browse the shop</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 font-heading text-3xl">Checkout</h1>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col">
          {items.map((item) => (
            <CartItemRow
              key={item.id}
              item={item}
              serverNow={serverNow}
              onUpdateQuantity={(quantity) => updateQuantity(item.id, quantity)}
              onRemove={() => removeItem(item.id)}
            />
          ))}
        </div>

        <CartSummary items={items} />

        {payMutation.isError && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {checkoutErrorMessage(payMutation.error)}
          </div>
        )}

        <Button
          type="button"
          size="lg"
          disabled={payMutation.isPending}
          onClick={() => payMutation.mutate()}
        >
          {payMutation.isPending ? "Redirecting to Stripe…" : "Pay with Stripe"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Test mode only. Use card 4242 4242 4242 4242 on Stripe's hosted checkout page.
        </p>
      </div>
    </div>
  )
}

export function Checkout() {
  return (
    <ProtectedRoute>
      <Seo title="Checkout" description="Pay for your CLACKFORGE order securely via Stripe." />
      <CheckoutContent />
    </ProtectedRoute>
  )
}
