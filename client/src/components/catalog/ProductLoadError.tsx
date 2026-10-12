import { Link } from "react-router-dom"
import { ApiRequestError } from "@/lib/api"

export interface ProductLoadErrorProps {
  slug: string | undefined
  error: unknown
  backHref: string
  backLabel: string
}

/**
 * Shared not-found/error branch so `ShopProduct.tsx` and
 * `routes/SwitchDetail.tsx` render identical copy and layout and can never
 * drift apart. `backHref`/`backLabel` are the only thing that differs per
 * call site (shop goes back to `/shop`, the switch detail page goes back to
 * a switch-filtered shop view).
 */
export function ProductLoadError({ slug, error, backHref, backLabel }: ProductLoadErrorProps) {
  const notFound = error instanceof ApiRequestError && error.status === 404

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link to={backHref} className="text-sm text-accent underline underline-offset-2">
        {backLabel}
      </Link>
      <div className="mt-6 flex flex-col items-start gap-2 rounded-xl border border-dashed border-border p-8">
        <h1 className="font-heading text-2xl">{notFound ? "Product not found" : "Couldn't load this product"}</h1>
        <p className="text-sm text-muted-foreground">
          {notFound ? (
            <>
              <span className="font-mono">{slug}</span> isn't in the catalog. It may have been retired or the link
              is wrong.
            </>
          ) : error instanceof ApiRequestError ? (
            error.message
          ) : (
            "Something went wrong talking to the server."
          )}
        </p>
      </div>
    </div>
  )
}
