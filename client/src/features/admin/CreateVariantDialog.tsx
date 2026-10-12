import { useState } from "react"
import { useForm } from "react-hook-form"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { dollarsInputToCents } from "@/lib/utils"
import { ApiRequestError } from "@/lib/api"
import { useCreateAdminVariantMutation } from "@/features/admin/queries"

interface FormValues {
  name: string
  sku: string
  priceDeltaDollars: string
  stock: string
  image: string
}

const DEFAULT_VALUES: FormValues = { name: "", sku: "", priceDeltaDollars: "0", stock: "0", image: "" }

/**
 * "Add variant" trigger + dialog, scoped to `CreateVariantInputSchema`'s
 * fields minus `attributes` (left at the schema default `{}` - same
 * plain-text-vs-rich-widget scoping call as `productForm.ts`'s doc
 * comment).
 */
export function CreateVariantDialog({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false)
  const createMutation = useCreateAdminVariantMutation(productId)

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: DEFAULT_VALUES })

  async function onSubmit(values: FormValues) {
    // Trim BEFORE the sign check/strip - a leading space (e.g. " -5") must
    // still be recognized as negative, not silently treated as an invalid
    // magnitude because the un-trimmed string doesn't start with "-".
    const trimmedPriceDelta = values.priceDeltaDollars.trim()
    const sign = trimmedPriceDelta.startsWith("-") ? -1 : 1
    const priceDelta = dollarsInputToCents(trimmedPriceDelta.replace(/^-/, ""))
    if (priceDelta === undefined) {
      setError("priceDeltaDollars", { type: "manual", message: "Enter a valid price delta (can be negative)" })
      return
    }
    const stock = Number(values.stock)
    if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
      setError("stock", { type: "manual", message: "Enter a non-negative whole number" })
      return
    }

    try {
      await createMutation.mutateAsync({
        name: values.name.trim(),
        sku: values.sku.trim(),
        priceDelta: priceDelta * sign,
        stock,
        attributes: {},
        image: values.image.trim() || undefined,
      })
      reset(DEFAULT_VALUES)
      setOpen(false)
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "SKU_TAKEN") {
        setError("sku", { type: "server", message: err.message })
        return
      }
      // Other failures already toasted by the mutation's onError.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset(DEFAULT_VALUES)
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>Add variant</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add variant</DialogTitle>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-variant-name">Name</Label>
            <Input id="new-variant-name" aria-invalid={!!errors.name} {...register("name", { required: "Name is required" })} />
            {errors.name && (
              <p className="text-xs text-destructive" role="alert">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-variant-sku">SKU</Label>
            <Input id="new-variant-sku" aria-invalid={!!errors.sku} {...register("sku", { required: "SKU is required" })} />
            {errors.sku && (
              <p className="text-xs text-destructive" role="alert">
                {errors.sku.message}
              </p>
            )}
          </div>

          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="new-variant-price-delta">Price delta (USD)</Label>
              <Input
                id="new-variant-price-delta"
                type="text"
                inputMode="decimal"
                placeholder="0 or -5"
                aria-invalid={!!errors.priceDeltaDollars}
                {...register("priceDeltaDollars")}
              />
              {errors.priceDeltaDollars && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.priceDeltaDollars.message}
                </p>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="new-variant-stock">Stock</Label>
              <Input
                id="new-variant-stock"
                type="number"
                inputMode="numeric"
                min={0}
                step="1"
                aria-invalid={!!errors.stock}
                {...register("stock")}
              />
              {errors.stock && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.stock.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-variant-image">Image URL (optional)</Label>
            <Input id="new-variant-image" type="url" placeholder="https://…" {...register("image")} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding…" : "Add variant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
