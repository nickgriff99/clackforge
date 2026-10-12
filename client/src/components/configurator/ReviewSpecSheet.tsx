import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Save, ShoppingCart, Share2 } from "lucide-react"
import { toast } from "sonner"
import type { BuildAccentKeys, BuildLayoutId, BuildSelections, PriceLineItem } from "@shared"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCreateBuildMutation } from "@/features/configurator/queries"
import { useCart } from "@/features/cart/useCart"
import { ApiRequestError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { formatCents } from "@/lib/utils"

export interface ReviewSpecSheetProps {
  lineItems: PriceLineItem[]
  subtotal: number
  /** `BuildConfig.version` - always `CURRENT_BUILD_CONFIG_VERSION` from the live store, never hand-typed per call site. */
  version: number
  productId: string
  layout: BuildLayoutId
  selections: BuildSelections
  accentKeys: BuildAccentKeys
  /**
   * The DB id from a save this session, iff the live `layout`/`selections`
   * still match what was saved - lets the Share button use the clean
   * `/b/:id` URL instead of the `?b=` codec fallback. `null` means "never
   * saved, or edited since" either way.
   */
  savedBuildId: string | null
  /** Fired with the new `CustomBuild.id` right after a successful save. */
  onSaved: (id: string) => void
}

/**
 * Save/Share/Add-to-cart for the Review step, next to the spec sheet they
 * describe.
 *
 * Add-to-cart silently calls `POST /api/builds` with no `label` - mints a
 * bare, unnamed `CustomBuild` row - then adds a cart line referencing that
 * new id. This is deliberately lighter than "Save build": adding to cart
 * doesn't name/list the build under Account > Saved builds. Every click
 * mints a fresh `CustomBuild` row even for an identical config, with no
 * dedup against a previous mint - an accepted orphan row, same as this
 * project's other recoverable-orphan patterns (abandoned carts, etc.).
 *
 * `POST /api/builds` requires auth, so unlike adding a regular shop product
 * (always allowed via the guest cart), a guest clicking Add-to-cart here
 * gets the same sign-in prompt as the Save button rather than a silent
 * failed request.
 */
export function ReviewSpecSheet({
  lineItems,
  subtotal,
  version,
  productId,
  layout,
  selections,
  accentKeys,
  savedBuildId,
  onSaved,
}: ReviewSpecSheetProps) {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const createBuildMutation = useCreateBuildMutation()
  // Separate instance (not reused from the Save dialog above) - React Query
  // gives each `useMutation()` call its own independent `isPending`, so
  // clicking Save never disables Add-to-cart (or shows "Saving…" on it) and
  // vice versa, even though both call the exact same `POST /api/builds`
  // mutation function.
  const addToCartBuildMutation = useCreateBuildMutation()
  const { addItem } = useCart()

  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false)
  const [label, setLabel] = useState("")

  function promptSignIn(message: string) {
    // The current build survives the trip to /login and back for free - the
    // `?b=` param is already synced to the live store on every change, and
    // `state: { from: location }` uses the same redirect-back contract
    // `<ProtectedRoute>` relies on, so signing in returns here automatically.
    toast(message, {
      description: "Your in-progress build stays right here while you do. Nothing is lost.",
      action: { label: "Sign in", onClick: () => navigate("/login", { state: { from: location } }) },
    })
  }

  function handleSaveClick() {
    if (!isAuthenticated) {
      promptSignIn("Sign in to save this build")
      return
    }
    setLabel("")
    setIsSaveDialogOpen(true)
  }

  async function handleAddToCart() {
    if (!isAuthenticated) {
      promptSignIn("Sign in to add this build to your cart")
      return
    }
    try {
      // No `label` - mints a bare, unnamed CustomBuild. `result.build.totalPrice`
      // is the server-recomputed price, never the local `subtotal` prop,
      // even though they should always agree.
      const result = await addToCartBuildMutation.mutateAsync({ version, productId, layout, selections, accentKeys })
      // Optimistic success toast; if the cart-add step fails, its own
      // mutation shows a separate error toast and the just-minted
      // CustomBuild row is left as an accepted orphan, same as elsewhere.
      addItem({
        productId,
        customBuildId: result.build.id,
        quantity: 1,
        name: "Custom build",
        unitPrice: result.build.totalPrice,
      })
      toast.success("Added to cart", { description: formatCents(result.build.totalPrice) })
    } catch (err) {
      toast.error("Couldn't add this build to your cart", {
        description: err instanceof ApiRequestError ? err.message : "Something went wrong talking to the server.",
      })
    }
  }

  async function handleConfirmSave() {
    const trimmed = label.trim()
    if (trimmed.length === 0) return
    try {
      const result = await createBuildMutation.mutateAsync({
        version,
        productId,
        layout,
        selections,
        accentKeys,
        label: trimmed,
      })
      onSaved(result.build.id)
      setIsSaveDialogOpen(false)
      toast.success("Build saved", { description: `"${trimmed}" is in your account now. Find it anytime.` })
    } catch (err) {
      toast.error("Couldn't save this build", {
        description: err instanceof ApiRequestError ? err.message : "Something went wrong talking to the server.",
      })
    }
  }

  async function handleShare() {
    // Clean `/b/:id` if this exact state was saved this session; otherwise
    // the `?b=` codec URL, which is kept up to date in the address bar.
    const url = savedBuildId ? `${window.location.origin}/b/${savedBuildId}` : window.location.href
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copied", { description: "Paste it anywhere. It opens exactly as configured." })
    } catch {
      toast.error("Couldn't copy the link", {
        description: "Your browser blocked clipboard access. Copy it from the address bar instead.",
      })
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-base">Review</h2>
      <dl className="font-specs flex flex-col gap-1.5 text-sm">
        {lineItems.map((item) => (
          <div key={`${item.slot}-${item.optionId ?? "base"}`} className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd>{formatCents(item.priceCents)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-medium">
          <dt>Total</dt>
          <dd>{formatCents(subtotal)}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" className="flex-1" onClick={handleShare}>
          <Share2 /> Share link
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={handleSaveClick}>
          <Save /> Save build
        </Button>
      </div>

      <Button type="button" size="lg" onClick={handleAddToCart} disabled={addToCartBuildMutation.isPending}>
        <ShoppingCart /> {addToCartBuildMutation.isPending ? "Adding…" : "Add to cart"}
      </Button>

      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this build</DialogTitle>
            <DialogDescription>
              Give it a name. You'll find it under Account &gt; Saved builds, ready to reopen or share.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="build-label">Build name</Label>
            <Input
              id="build-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              placeholder="e.g. Daily driver 65%"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void handleConfirmSave()
                }
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button
              type="button"
              onClick={handleConfirmSave}
              disabled={label.trim().length === 0 || createBuildMutation.isPending}
            >
              {createBuildMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
