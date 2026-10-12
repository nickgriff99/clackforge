import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { Link, useParams } from "react-router-dom"
import type { AdminProductDetail, ProductStatus, ProductType } from "@shared"
import { AdminTitle } from "@/components/seo/AdminTitle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { PRODUCT_TYPE_LABELS } from "@/lib/constants"
import { ApiRequestError } from "@/lib/api"
import { centsToDollarsInputValue, dollarsInputToCents } from "@/lib/utils"
import { PRODUCT_STATUS_LABELS } from "@/features/admin/constants"
import { imagesToText, parseImagesText, parseSpecsText, specsToText } from "@/features/admin/productForm"
import { useAdminProduct, useUpdateAdminProductMutation } from "@/features/admin/queries"
import { VariantsTable } from "@/features/admin/VariantsTable"

const ALL_PRODUCT_TYPES: ProductType[] = ["KIT", "SWITCH", "KEYCAP_SET", "ACCESSORY", "CUSTOM_BUILD"]
const STATUS_OPTIONS: ProductStatus[] = ["active", "draft", "archived"]

interface FormValues {
  name: string
  tagline: string
  description: string
  category: ProductType
  basePriceDollars: string
  images: string
  specs: string
  status: ProductStatus
}

function toFormValues(product: AdminProductDetail): FormValues {
  return {
    name: product.name,
    tagline: product.tagline,
    description: product.description,
    category: product.category,
    basePriceDollars: centsToDollarsInputValue(product.basePrice),
    images: imagesToText(product.images),
    specs: specsToText(product.specs),
    status: product.status,
  }
}

function EditSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-8 w-1/2" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    </div>
  )
}

function ProductEditForm({ product }: { product: AdminProductDetail }) {
  const updateMutation = useUpdateAdminProductMutation()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ defaultValues: toFormValues(product) })

  // Re-sync the form once per product LOAD (keyed on id), not on every
  // background refetch - a plain `values:` prop on `useForm` would reset
  // (and lose) in-progress edits every time this query revalidates (e.g. on
  // window focus), which is the wrong trade-off for a form this size.
  // (Deliberately keyed on `product.id` only, not the whole `product`
  // object or `reset` - see this function's doc comment above.)
  useEffect(() => {
    reset(toFormValues(product))
  }, [product.id])

  const category = watch("category")
  const status = watch("status")

  async function onSubmit(values: FormValues) {
    const basePrice = dollarsInputToCents(values.basePriceDollars)
    if (basePrice === undefined) {
      setError("basePriceDollars", { type: "manual", message: "Enter a valid non-negative price" })
      return
    }

    await updateMutation.mutateAsync({
      id: product.id,
      input: {
        name: values.name.trim(),
        tagline: values.tagline.trim(),
        description: values.description.trim(),
        category: values.category,
        basePrice,
        images: parseImagesText(values.images),
        specs: parseSpecsText(values.specs),
        status: values.status,
      },
    })
  }

  return (
    <form className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-product-name">Name</Label>
        <Input id="edit-product-name" aria-invalid={!!errors.name} {...register("name", { required: "Name is required" })} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-product-tagline">Tagline</Label>
        <Input
          id="edit-product-tagline"
          aria-invalid={!!errors.tagline}
          {...register("tagline", { required: "Tagline is required" })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-product-description">Description</Label>
        <Textarea
          id="edit-product-description"
          className="min-h-28"
          aria-invalid={!!errors.description}
          {...register("description", { required: "Description is required" })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-product-images">Images (comma-separated URLs)</Label>
        <Textarea id="edit-product-images" {...register("images")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-product-specs">Specs (one "key: value" per line)</Label>
        <Textarea id="edit-product-specs" className="min-h-28 font-specs" {...register("specs")} />
      </div>

      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="edit-product-category">Type</Label>
          <Select value={category} onValueChange={(value) => value && setValue("category", value as ProductType, { shouldDirty: true })}>
            <SelectTrigger id="edit-product-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_PRODUCT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {PRODUCT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="edit-product-price">Price (USD)</Label>
          <Input
            id="edit-product-price"
            type="number"
            inputMode="decimal"
            min={0}
            step="1"
            aria-invalid={!!errors.basePriceDollars}
            {...register("basePriceDollars", { required: "Price is required" })}
          />
          {errors.basePriceDollars && (
            <p className="text-xs text-destructive" role="alert">
              {errors.basePriceDollars.message}
            </p>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="edit-product-status">Status</Label>
          <Select value={status} onValueChange={(value) => value && setValue("status", value as ProductStatus, { shouldDirty: true })}>
            <SelectTrigger id="edit-product-status" className="w-full">
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
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}

export function AdminProductEdit() {
  const { id } = useParams<{ id: string }>()
  const { data, isPending, isError, error } = useAdminProduct(id)

  if (isPending) {
    return (
      <>
        <AdminTitle title="Products" />
        <EditSkeleton />
      </>
    )
  }

  if (isError) {
    const notFound = error instanceof ApiRequestError && error.status === 404
    return (
      <>
        <AdminTitle title="Products" />
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="font-heading text-lg">{notFound ? "Product not found." : "Couldn't load this product."}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {error instanceof ApiRequestError ? error.message : "Try again in a moment."}
          </p>
          <Button type="button" variant="outline" render={<Link to="/admin/products" />}>
            Back to products
          </Button>
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <AdminTitle title={data.product.name} />
      <div>
        <Link to="/admin/products" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to products
        </Link>
        <h2 className="mt-1 font-heading text-xl">{data.product.name}</h2>
      </div>

      <ProductEditForm product={data.product} />

      <Separator />

      <VariantsTable productId={data.product.id} variants={data.product.variants} />
    </div>
  )
}
