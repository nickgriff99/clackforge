import { useNavigate } from "react-router-dom"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useProducts } from "@/features/catalog/queries"
import { productHref } from "@/lib/constants"
import { formatCents } from "@/lib/utils"

/**
 * Page-local product search, not a global site search. Lazily fetches up
 * to 100 products (the whole catalog comfortably fits) only while the
 * search sheet is open, then lets cmdk's built-in fuzzy filter match
 * against each item's `name + tagline` value - no server round-trip per
 * keystroke.
 */
export function ProductSearch({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const navigate = useNavigate()
  const { data, isPending } = useProducts(
    { page: 1, pageSize: 100, sort: "newest" },
    { enabled: open },
  )

  return (
    <Command>
      <CommandInput placeholder="Search products by name…" autoFocus />
      <CommandList>
        <CommandEmpty>{isPending ? "Loading…" : "No products match."}</CommandEmpty>
        <CommandGroup heading="Products">
          {(data?.products ?? []).map((product) => (
            <CommandItem
              key={product.id}
              value={`${product.name} ${product.tagline}`}
              onSelect={() => {
                navigate(productHref(product))
                onNavigate()
              }}
            >
              <span className="flex flex-1 flex-col overflow-hidden">
                <span className="truncate">{product.name}</span>
                <span className="truncate text-xs text-muted-foreground">{product.tagline}</span>
              </span>
              <span className="font-specs shrink-0 text-xs text-muted-foreground">
                {formatCents(product.basePrice, product.currency)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
