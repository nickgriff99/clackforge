import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getSwitchSpecBySlug } from "@shared"
import { Seo } from "@/components/seo/Seo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ProductLoadError } from "@/components/catalog/ProductLoadError"
import { ForceCurveChart } from "@/components/switches/ForceCurveChart"
import { SwitchPressButton } from "@/components/switches/SwitchPressButton"
import { SwitchDetailCanvasHost } from "@/components/three/SwitchDetailCanvasHost"
import { useProduct } from "@/features/catalog/queries"
import { PRODUCT_TYPE_LABELS } from "@/lib/constants"
import { formatCents } from "@/lib/utils"

/**
 * Reuses the existing `useProduct(slug)` fetch hook/pattern (same one
 * `ShopProduct.tsx` uses). The switch-specific exploded-geometry/force-curve
 * data layered on top (`getSwitchSpecBySlug`) is static shared data, not a
 * second network call.
 *
 * Guard states, in order:
 * 1. pending -> skeleton
 * 2. fetch error (incl. real 404) -> `ProductLoadError`
 * 3. product found but not a speced switch (wrong category, or a SWITCH
 *    product with no `SwitchSpec` entry yet) -> a clean, non-crashing empty
 *    state, not a 404 - the product is real, it just has no showpiece yet.
 * 4. success -> exploded 3D view + explode slider + press button + force
 *    curve chart/table + specs summary + a link back into the real shop PDP
 *    for actually buying it (no add-to-cart logic duplicated here).
 */
export function SwitchDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { data, isPending, isError, error } = useProduct(slug)
  const [explodeFactor, setExplodeFactor] = useState(0.5)
  const [pressed, setPressed] = useState(false)

  if (isPending) {
    return (
      <div className="mx-auto grid max-w-4xl gap-6 px-4 py-12 sm:grid-cols-2">
        <Skeleton className="aspect-square w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  if (isError) {
    return <ProductLoadError slug={slug} error={error} backHref="/shop?type=SWITCH" backLabel="← Back to switches" />
  }

  const { product } = data
  const spec = getSwitchSpecBySlug(product.slug)

  if (!spec) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/shop?type=SWITCH" className="text-sm text-accent underline underline-offset-2">
          ← Back to switches
        </Link>
        <div className="mt-6 flex flex-col items-start gap-2 rounded-xl border border-dashed border-border p-8">
          <h1 className="font-heading text-2xl">Not available as a showpiece yet</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{product.name}</span> doesn't have an exploded-view/force-curve showpiece
            built yet. You can still view and buy it from the shop page.
          </p>
          <Button render={<Link to={`/shop/${product.slug}`} />} variant="outline">
            View in shop
          </Button>
        </div>
      </div>
    )
  }

  const ariaLabel = `Interactive 3D exploded view of the ${product.name} switch (${spec.feel} feel). Drag to rotate, scroll to zoom.`

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Seo
        title={`${product.name} switch`}
        description={`${product.name}: a ${spec.feel} switch. ${product.tagline || product.description}`}
        image={product.images[0]}
        type="product"
      />
      <Link to="/shop?type=SWITCH" className="text-sm text-accent underline underline-offset-2">
        ← Back to switches
      </Link>

      <header className="mt-6 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{PRODUCT_TYPE_LABELS[product.category]}</Badge>
          <Badge variant="secondary">{spec.feel}</Badge>
        </div>
        <h1 className="font-heading text-3xl">{product.name}</h1>
        <p className="text-sm text-muted-foreground">{product.tagline}</p>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="flex flex-col gap-4">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-card sm:aspect-[4/3]">
            <SwitchDetailCanvasHost
              parts={spec.explodedParts}
              explodeFactor={explodeFactor}
              pressed={pressed}
              ariaLabel={ariaLabel}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
            <Label htmlFor="explode-factor">Exploded view</Label>
            <input
              id="explode-factor"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={explodeFactor}
              onChange={(event) => setExplodeFactor(Number(event.target.value))}
              className="accent-[var(--color-primary)]"
              aria-valuetext={`${Math.round(explodeFactor * 100)}% exploded`}
            />
            <span className="font-specs text-xs text-muted-foreground">{Math.round(explodeFactor * 100)}% exploded</span>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <SwitchPressButton feel={spec.feel} pressed={pressed} onPressedChange={setPressed} />
            <p className="text-xs text-muted-foreground">Press and hold to hear this switch actuate.</p>
          </div>

          <Button render={<Link to={`/shop/${product.slug}`} />}>Shop this switch</Button>
        </div>

        <div className="flex flex-col gap-6">
          <dl className="font-specs divide-y divide-border rounded-xl border border-border text-sm">
            <div className="flex items-center justify-between gap-4 px-4 py-2">
              <dt className="text-muted-foreground">Price</dt>
              <dd>{formatCents(product.basePrice, product.currency)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-2">
              <dt className="text-muted-foreground">Actuation force</dt>
              <dd>{spec.actuationForceG}g</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-2">
              <dt className="text-muted-foreground">Bottom-out force</dt>
              <dd>{spec.bottomOutForceG}g</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-2">
              <dt className="text-muted-foreground">Pre-travel</dt>
              <dd>{spec.preTravelMm}mm</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-2">
              <dt className="text-muted-foreground">Total travel</dt>
              <dd>{spec.totalTravelMm}mm</dd>
            </div>
            {Object.entries(product.specs).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-4 px-4 py-2">
                <dt className="text-muted-foreground">{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <ForceCurveChart series={[{ spec, colorLabel: product.name }]} />

          <Link to="/switches/compare" className="text-sm text-accent underline underline-offset-2">
            Compare with other switches →
          </Link>
        </div>
      </div>
    </div>
  )
}
