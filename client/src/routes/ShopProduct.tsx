import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Minus, Plus } from "lucide-react"
import type { ProductType, Variant } from "@shared"
import { Seo } from "@/components/seo/Seo"
import { ProductJsonLd } from "@/components/seo/ProductJsonLd"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { ProductLoadError } from "@/components/catalog/ProductLoadError"
import { ProductVisual } from "@/components/catalog/ProductVisual"
import { useProduct } from "@/features/catalog/queries"
import { useCart } from "@/features/cart/useCart"
import { PRODUCT_TYPE_LABELS } from "@/lib/constants"
import { formatCents } from "@/lib/utils"

function ProductMedia({
  images,
  slug,
  name,
  category,
  specs,
}: {
  images: string[]
  slug: string
  name: string
  category: ProductType
  specs: Record<string, string>
}) {
  if (images.length > 0) {
    return (
      <div className="grid gap-2">
        {images.map((src) => (
          <img
            key={src}
            src={src}
            alt=""
            className="aspect-square w-full rounded-xl border border-border object-cover"
          />
        ))}
      </div>
    )
  }
  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-card">
      <ProductVisual slug={slug} category={category} specs={specs} label={name} className="h-full w-full" />
    </div>
  )
}

function VariantPrice({ variant, currency }: { variant: Variant; currency: string }) {
  if (variant.priceDelta === 0) return null
  const sign = variant.priceDelta > 0 ? "+" : "−"
  return (
    <span className="font-specs text-xs text-muted-foreground">
      {sign}
      {formatCents(Math.abs(variant.priceDelta), currency)}
    </span>
  )
}

export function ShopProduct() {
  const { slug } = useParams<{ slug: string }>()
  const { data, isPending, isError, error } = useProduct(slug)
  const { addItem } = useCart()
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined)
  const [quantity, setQuantity] = useState(1)

  if (isPending) {
    return (
      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-12 sm:grid-cols-2">
        <Skeleton className="aspect-[4/3] w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  if (isError) {
    return <ProductLoadError slug={slug} error={error} backHref="/shop" backLabel="← Back to shop" />
  }

  const { product } = data
  const variants = product.variants
  const effectiveVariantId = selectedVariantId ?? variants[0]?.id
  const selectedVariant = variants.find((v) => v.id === effectiveVariantId)

  const lineInStock = variants.length === 0 ? product.inStock : (selectedVariant?.stock ?? 0) > 0
  const unitPrice = product.basePrice + (selectedVariant?.priceDelta ?? 0)
  const maxQuantity = selectedVariant ? Math.max(1, selectedVariant.stock) : 99

  function handleAddToCart() {
    if (variants.length > 0 && !selectedVariant) return
    const name = selectedVariant ? `${product.name} (${selectedVariant.name})` : product.name
    addItem({ productId: product.id, variantId: selectedVariant?.id, name, unitPrice, quantity })
    toast.success(`Added to cart`, { description: quantity > 1 ? `${name} × ${quantity}` : name })
    setQuantity(1)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Seo
        title={product.name}
        description={product.tagline || product.description}
        image={product.images[0]}
        type="product"
      />
      <ProductJsonLd
        name={product.name}
        description={product.description}
        images={product.images}
        priceCents={unitPrice}
        currency={product.currency}
        inStock={lineInStock}
        url={window.location.href}
      />
      <Link to="/shop" className="text-sm text-accent underline underline-offset-2">
        ← Back to shop
      </Link>

      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <ProductMedia
          images={product.images}
          slug={product.slug}
          name={product.name}
          category={product.category}
          specs={product.specs}
        />

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{PRODUCT_TYPE_LABELS[product.category]}</Badge>
            {!lineInStock && <Badge variant="secondary">Out of stock</Badge>}
          </div>

          <div>
            <h1 className="font-heading text-2xl">{product.name}</h1>
            <p className="text-sm text-muted-foreground">{product.tagline}</p>
          </div>

          <p className="font-specs text-xl">{formatCents(unitPrice, product.currency)}</p>

          <p className="text-sm text-foreground">{product.description}</p>

          {variants.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="variant-group">Options</Label>
              <RadioGroup
                id="variant-group"
                value={effectiveVariantId}
                onValueChange={(value) => {
                  if (typeof value === "string") setSelectedVariantId(value)
                }}
              >
                {variants.map((variant) => {
                  const outOfStock = variant.stock <= 0
                  return (
                    <Label
                      key={variant.id}
                      htmlFor={`variant-${variant.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 has-[[data-checked]]:border-primary has-disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2">
                        <RadioGroupItem id={`variant-${variant.id}`} value={variant.id} disabled={outOfStock} />
                        {variant.name}
                        {outOfStock && <span className="text-xs text-muted-foreground">(out of stock)</span>}
                      </span>
                      <VariantPrice variant={variant} currency={product.currency} />
                    </Label>
                  )
                })}
              </RadioGroup>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Label htmlFor="quantity" className="sr-only">
              Quantity
            </Label>
            <div className="flex items-center rounded-lg border border-input">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Decrease quantity"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus />
              </Button>
              <span id="quantity" className="font-specs w-8 text-center text-sm" aria-live="polite">
                {quantity}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Increase quantity"
                disabled={quantity >= maxQuantity}
                onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
              >
                <Plus />
              </Button>
            </div>

            <Button
              type="button"
              className="flex-1"
              disabled={!lineInStock}
              onClick={handleAddToCart}
            >
              {lineInStock ? "Add to cart" : "Out of stock"}
            </Button>
          </div>

          <dl className="font-specs divide-y divide-border rounded-xl border border-border text-sm">
            {Object.entries(product.specs).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-4 px-4 py-2">
                <dt className="text-muted-foreground">{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
