import { Link } from "react-router-dom"
import { PackageSearch } from "lucide-react"
import { Seo } from "@/components/seo/Seo"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useProducts } from "@/features/catalog/queries"
import { useShopFilters } from "@/features/catalog/useShopFilters"
import { ProductFilters } from "@/features/catalog/ProductFilters"
import { ProductCard } from "@/features/catalog/ProductCard"
import { Pagination } from "@/features/catalog/Pagination"
import { ApiRequestError } from "@/lib/api"

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

export function Shop() {
  const { filters, setFilters, apiQuery } = useShopFilters()
  const { data, isPending, isError, error, isPlaceholderData } = useProducts(apiQuery)

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <Seo
        title="Shop"
        description="Keyboards, switches, keycaps, and the odd accessory, all built to spec. Browse the full CLACKFORGE catalog."
      />
      <header className="mb-8 flex flex-col gap-1">
        <h1 className="font-heading text-3xl">Shop</h1>
        <p className="text-sm text-muted-foreground">
          Keyboards, switches, keycaps, and the odd accessory, all built to spec.
        </p>
      </header>

      <div className="mb-8">
        <ProductFilters filters={filters} onChange={setFilters} />
      </div>

      {isPending ? (
        <ProductGridSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-destructive/40 py-20 text-center">
          <p className="font-heading text-lg">The forge hit a snag.</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {error instanceof ApiRequestError ? error.message : "Couldn't load the catalog. Try again in a moment."}
          </p>
        </div>
      ) : data.total === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
          <PackageSearch className="size-8 text-muted-foreground" />
          <p className="font-heading text-lg">No gear matches those filters.</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Try widening the price range, turning off
            "in stock only", or clearing the type filter.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setFilters({ type: undefined, minPrice: undefined, maxPrice: undefined, inStock: false })
            }
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity duration-fast" : undefined}>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {data.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={(page) => setFilters({ page })}
          />
        </div>
      )}

      <p className="mt-10 text-center text-sm text-muted-foreground">
        Want something nobody else has?{" "}
        <Link to="/build" className="text-accent underline underline-offset-2">
          Start a custom build
        </Link>
        .
      </p>
    </div>
  )
}
