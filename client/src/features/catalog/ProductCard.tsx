import { Link } from "react-router-dom"
import type { ProductSummary } from "@shared"
import { ProductVisual } from "@/components/catalog/ProductVisual"
import { Badge } from "@/components/ui/badge"
import { PRODUCT_TYPE_LABELS, productHref } from "@/lib/constants"
import { formatCents } from "@/lib/utils"

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link
      to={productHref(product)}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow duration-base ease-standard hover:shadow-elevated"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-border">
        <ProductVisual
          slug={product.slug}
          category={product.category}
          specs={product.specs}
          label={product.name}
          className="h-full w-full transition-transform duration-slow ease-standard group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <Badge variant="outline" className="bg-background/80 backdrop-blur-sm">
            {PRODUCT_TYPE_LABELS[product.category]}
          </Badge>
          {!product.inStock && <Badge variant="secondary">Out of stock</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="font-heading text-lg">{product.name}</span>
        <span className="line-clamp-2 text-sm text-muted-foreground">{product.tagline}</span>
        <span className="font-specs mt-auto text-sm">{formatCents(product.basePrice, product.currency)}</span>
      </div>
    </Link>
  )
}
