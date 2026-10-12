import { useState } from "react"
import { useForm } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import type { ProductStatus, ProductType } from "@shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { PRODUCT_TYPE_LABELS } from "@/lib/constants"
import { dollarsInputToCents } from "@/lib/utils"
import { ApiRequestError } from "@/lib/api"
import { PRODUCT_STATUS_LABELS } from "@/features/admin/constants"
import { useCreateAdminProductMutation } from "@/features/admin/queries"

const CREATABLE_TYPES: ProductType[] = ["KIT", "SWITCH", "KEYCAP_SET", "ACCESSORY", "CUSTOM_BUILD"]
const STATUS_OPTIONS: ProductStatus[] = ["active", "draft", "archived"]

interface FormValues {
  slug: string
  name: string
  tagline: string
  description: string
  category: ProductType
  basePriceDollars: string
  isConfigurable: boolean
  status: ProductStatus
}

const DEFAULT_VALUES: FormValues = {
  slug: "",
  name: "",
  tagline: "",
  description: "",
  category: "KIT",
  basePriceDollars: "",
  isConfigurable: false,
  status: "active",
}

/**
 * "New product" trigger + dialog. Deliberately scoped to
 * `CreateProductInputSchema`'s REQUIRED fields + `status` - `images`/`specs`
 * stay at their schema defaults (`[]`/`{}`) here, editable afterward via
 * `AdminProductEdit.tsx`'s fuller form (see `features/admin/productForm.ts`'s
 * doc comment on why those two fields are plain-text, not a rich widget,
 * even on that fuller form).
 */
export function CreateProductDialog() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const createMutation = useCreateAdminProductMutation()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: DEFAULT_VALUES })

  const category = watch("category")
  const status = watch("status")
  const isConfigurable = watch("isConfigurable")

  async function onSubmit(values: FormValues) {
    const basePrice = dollarsInputToCents(values.basePriceDollars)
    if (basePrice === undefined) {
      setError("basePriceDollars", { type: "manual", message: "Enter a valid non-negative price" })
      return
    }

    try {
      const { product } = await createMutation.mutateAsync({
        slug: values.slug.trim(),
        name: values.name.trim(),
        tagline: values.tagline.trim(),
        description: values.description.trim(),
        category: values.category,
        basePrice,
        isConfigurable: values.isConfigurable,
        status: values.status,
        currency: "usd",
        images: [],
        specs: {},
      })
      reset(DEFAULT_VALUES)
      setOpen(false)
      navigate(`/admin/products/${product.id}`)
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "SLUG_TAKEN") {
        setError("slug", { type: "server", message: err.message })
        return
      }
      // Any other failure already surfaced as a toast by the mutation's onError.
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
      <DialogTrigger render={<Button type="button" />}>New product</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>
            Images and specs can be added after creation from the product's edit page.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-product-slug">Slug</Label>
            <Input
              id="new-product-slug"
              autoComplete="off"
              placeholder="aurora-65-kit"
              aria-invalid={!!errors.slug}
              {...register("slug", { required: "Slug is required" })}
            />
            {errors.slug && (
              <p className="text-xs text-destructive" role="alert">
                {errors.slug.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-product-name">Name</Label>
            <Input id="new-product-name" aria-invalid={!!errors.name} {...register("name", { required: "Name is required" })} />
            {errors.name && (
              <p className="text-xs text-destructive" role="alert">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-product-tagline">Tagline</Label>
            <Input
              id="new-product-tagline"
              aria-invalid={!!errors.tagline}
              {...register("tagline", { required: "Tagline is required" })}
            />
            {errors.tagline && (
              <p className="text-xs text-destructive" role="alert">
                {errors.tagline.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-product-description">Description</Label>
            <Textarea
              id="new-product-description"
              aria-invalid={!!errors.description}
              {...register("description", { required: "Description is required" })}
            />
            {errors.description && (
              <p className="text-xs text-destructive" role="alert">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="new-product-category">Type</Label>
              <Select value={category} onValueChange={(value) => value && setValue("category", value as ProductType)}>
                <SelectTrigger id="new-product-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATABLE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PRODUCT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="new-product-price">Price (USD)</Label>
              <Input
                id="new-product-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                placeholder="129"
                aria-invalid={!!errors.basePriceDollars}
                {...register("basePriceDollars", { required: "Price is required" })}
              />
              {errors.basePriceDollars && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.basePriceDollars.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="new-product-status">Status</Label>
              <Select value={status} onValueChange={(value) => value && setValue("status", value as ProductStatus)}>
                <SelectTrigger id="new-product-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PRODUCT_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-1 items-center gap-2 pt-6">
              <Checkbox
                id="new-product-configurable"
                checked={isConfigurable}
                onCheckedChange={(checked) => setValue("isConfigurable", checked === true)}
              />
              <Label htmlFor="new-product-configurable">Configurable</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
