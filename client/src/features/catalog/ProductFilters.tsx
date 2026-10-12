import { useEffect, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BROWSABLE_PRODUCT_TYPES, PRODUCT_TYPE_LABELS } from "@/lib/constants"
import type { ShopFilters } from "@/features/catalog/useShopFilters"

const SORT_LABELS: Record<ShopFilters["sort"], string> = {
  newest: "Newest",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
}

/** Sentinel for the Select - base-ui's Select item values can't be empty strings. */
const ALL_TYPES = "all"

export function ProductFilters({
  filters,
  onChange,
}: {
  filters: ShopFilters
  onChange: (partial: Partial<ShopFilters>) => void
}) {
  // Local text-input mirrors so typing doesn't re-fetch per keystroke - the
  // URL (and therefore the query) only updates on blur/Enter.
  const [minInput, setMinInput] = useState(centsToDollarsInput(filters.minPrice))
  const [maxInput, setMaxInput] = useState(centsToDollarsInput(filters.maxPrice))

  useEffect(() => {
    setMinInput(centsToDollarsInput(filters.minPrice))
  }, [filters.minPrice])

  useEffect(() => {
    setMaxInput(centsToDollarsInput(filters.maxPrice))
  }, [filters.maxPrice])

  function commitMin() {
    onChange({ minPrice: dollarsInputToCents(minInput) })
  }

  function commitMax() {
    onChange({ maxPrice: dollarsInputToCents(maxInput) })
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-type">Type</Label>
        <Select
          value={filters.type ?? ALL_TYPES}
          onValueChange={(value) => {
            // `value` only ever comes from the two SelectItems below (ALL_TYPES
            // sentinel or a BROWSABLE_PRODUCT_TYPES entry), so this cast is safe.
            const type = value !== null && value !== ALL_TYPES ? (value as ShopFilters["type"]) : undefined
            onChange({ type })
          }}
        >
          <SelectTrigger id="filter-type" className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>All types</SelectItem>
            {BROWSABLE_PRODUCT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {PRODUCT_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-min-price">Min price</Label>
        <Input
          id="filter-min-price"
          type="number"
          inputMode="decimal"
          min={0}
          step="1"
          placeholder="$0"
          className="w-full sm:w-28"
          value={minInput}
          onChange={(e) => setMinInput(e.target.value)}
          onBlur={commitMin}
          onKeyDown={(e) => e.key === "Enter" && commitMin()}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-max-price">Max price</Label>
        <Input
          id="filter-max-price"
          type="number"
          inputMode="decimal"
          min={0}
          step="1"
          placeholder="Any"
          className="w-full sm:w-28"
          value={maxInput}
          onChange={(e) => setMaxInput(e.target.value)}
          onBlur={commitMax}
          onKeyDown={(e) => e.key === "Enter" && commitMax()}
        />
      </div>

      <div className="flex items-center gap-2 py-1.5">
        <Checkbox
          id="filter-in-stock"
          checked={filters.inStock}
          onCheckedChange={(checked) => onChange({ inStock: checked === true })}
        />
        <Label htmlFor="filter-in-stock">In stock only</Label>
      </div>

      <div className="flex flex-col gap-1.5 sm:ml-auto">
        <Label htmlFor="filter-sort">Sort</Label>
        <Select
          value={filters.sort}
          onValueChange={(value) => {
            // `value` only ever comes from the SORT_LABELS-keyed items below.
            if (value !== null) onChange({ sort: value as ShopFilters["sort"] })
          }}
        >
          <SelectTrigger id="filter-sort" className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as ShopFilters["sort"][]).map((sort) => (
              <SelectItem key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function centsToDollarsInput(cents: number | undefined): string {
  return cents === undefined ? "" : String(cents / 100)
}

function dollarsInputToCents(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === "") return undefined
  const dollars = Number(trimmed)
  if (!Number.isFinite(dollars) || dollars < 0) return undefined
  return Math.round(dollars * 100)
}
