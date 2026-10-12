import type { ChangeEvent } from "react"
import { Link } from "react-router-dom"
import { getSwitchSpecBySlug, type SwitchSpec } from "@shared"
import type { ProductDetail } from "@shared"
import { Seo } from "@/components/seo/Seo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ForceCurveChart } from "@/components/switches/ForceCurveChart"
import { useProduct, useProducts } from "@/features/catalog/queries"
import { MAX_COMPARE_SWITCHES, useSwitchCompareSlugs } from "@/features/switches/useSwitchCompareSlugs"
import { formatCents } from "@/lib/utils"

interface ReadyEntry {
  slug: string
  product: ProductDetail
  spec: SwitchSpec
}

const SPEC_ROWS: { label: string; render: (e: ReadyEntry) => string }[] = [
  { label: "Feel", render: (e) => e.spec.feel },
  { label: "Price", render: (e) => formatCents(e.product.basePrice, e.product.currency) },
  { label: "Actuation force", render: (e) => `${e.spec.actuationForceG}g` },
  { label: "Bottom-out force", render: (e) => `${e.spec.bottomOutForceG}g` },
  { label: "Pre-travel", render: (e) => `${e.spec.preTravelMm}mm` },
  { label: "Total travel", render: (e) => `${e.spec.totalTravelMm}mm` },
]

/**
 * URL-synced via `useSwitchCompareSlugs` (`?slugs=`, comma-joined, max 3).
 *
 * Calls `useProduct` exactly 3 times, unconditionally, against
 * `slots[0..2]` (each `string | undefined`) - fixed call sites, never a
 * variable number of hook calls, honoring the rules of hooks even though
 * the number of switches actually being compared (0-3) varies every
 * render.
 *
 * 0/1/2/3 selected switches are all valid states, not errors: 0 shows a
 * picker-only prompt, 1-3 show whatever is resolved so far - a
 * slow/erroring slot doesn't block the others from rendering, it just
 * reports its own status inline.
 */
export function SwitchCompare() {
  const { slugs, slots, addSlug, removeSlug } = useSwitchCompareSlugs()

  // Fixed 3 call sites - see doc comment above.
  const q0 = useProduct(slots[0])
  const q1 = useProduct(slots[1])
  const q2 = useProduct(slots[2])
  const queries = [q0, q1, q2]

  const switchListQuery = useProducts({ type: "SWITCH", pageSize: 50 })
  const pickableSwitches = (switchListQuery.data?.products ?? []).filter((p) => !slugs.includes(p.slug))

  const ready: ReadyEntry[] = []
  const notices: { slug: string; message: string }[] = []

  slots.forEach((slug, index) => {
    if (!slug) return
    const query = queries[index]!
    if (query.isPending) {
      notices.push({ slug, message: `Loading ${slug}…` })
      return
    }
    if (query.isError) {
      notices.push({ slug, message: `Couldn't load "${slug}". It may not exist anymore.` })
      return
    }
    const product = query.data.product
    const spec = getSwitchSpecBySlug(product.slug)
    if (!spec) {
      notices.push({ slug, message: `${product.name} doesn't have a showpiece/force-curve yet.` })
      return
    }
    ready.push({ slug, product, spec })
  })

  function handlePick(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value
    if (value) addSlug(value)
    event.target.value = ""
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <Seo
        title="Compare switches"
        description={`Pick up to ${MAX_COMPARE_SWITCHES} switches to compare feel, force, travel, and sound side by side.`}
      />
      <Link to="/shop?type=SWITCH" className="text-sm text-accent underline underline-offset-2">
        ← Back to switches
      </Link>

      <header className="mt-6 flex flex-col gap-1">
        <h1 className="font-heading text-3xl">Compare switches</h1>
        <p className="text-sm text-muted-foreground">
          Pick up to {MAX_COMPARE_SWITCHES} switches to compare feel, force, travel, and sound.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <Label htmlFor="add-switch">Add a switch</Label>
          <select
            id="add-switch"
            defaultValue=""
            onChange={handlePick}
            disabled={slugs.length >= MAX_COMPARE_SWITCHES || pickableSwitches.length === 0}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <option value="" disabled>
              {slugs.length >= MAX_COMPARE_SWITCHES ? `Max ${MAX_COMPARE_SWITCHES} reached` : "Choose a switch…"}
            </option>
            {pickableSwitches.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <span className="font-specs text-xs text-muted-foreground">
          {slugs.length} / {MAX_COMPARE_SWITCHES} selected
        </span>
      </div>

      {notices.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1">
          {notices.map((n) => (
            <li key={n.slug} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              {n.message}
              <Button type="button" variant="ghost" size="sm" onClick={() => removeSlug(n.slug)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {slugs.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No switches selected yet. Add one above to start comparing.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {ready.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="font-specs w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th scope="col" className="px-4 py-2 font-normal text-muted-foreground">
                      &nbsp;
                    </th>
                    {ready.map((e) => (
                      <th key={e.slug} scope="col" className="px-4 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-heading text-base font-normal">{e.product.name}</span>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${e.product.name}`} onClick={() => removeSlug(e.slug)}>
                            ×
                          </Button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SPEC_ROWS.map((row) => (
                    <tr key={row.label} className="border-b border-border/50">
                      <th scope="row" className="px-4 py-2 text-left font-normal text-muted-foreground">
                        {row.label}
                      </th>
                      {ready.map((e) => (
                        <td key={e.slug} className="px-4 py-2">
                          {row.render(e)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {ready.length > 0 && (
            <ForceCurveChart series={ready.map((e) => ({ spec: e.spec, colorLabel: e.product.name }))} />
          )}

          {ready.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ready.map((e) => (
                <Badge key={e.slug} variant="outline">
                  <Link to={`/switches/${e.slug}`} className="hover:underline">
                    Open {e.product.name} →
                  </Link>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
