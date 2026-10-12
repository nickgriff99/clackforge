import { Seo } from "@/components/seo/Seo"
import { CartList } from "@/features/cart/CartList"

export function Cart() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Seo title="Cart" description="Review what's in your CLACKFORGE cart before checkout." />
      <h1 className="mb-8 font-heading text-3xl">Cart</h1>
      <CartList />
    </div>
  )
}
