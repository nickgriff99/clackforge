import { useEffect } from "react"
import { useForm } from "react-hook-form"
import type { GroupBuyDrop, AdminUpdateDropInput } from "@shared"
import { AdminTitle } from "@/components/seo/AdminTitle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useAdminDrop, useUpdateAdminDropMutation } from "@/features/admin/queries"
import { useDropState } from "@/features/drops/queries"
import { ApiRequestError } from "@/lib/api"

/**
 * `DROP_SLUG` is hardcoded - this demo only ever seeds one group buy drop
 * (`aurora-reserve`, server/prisma/seed.ts). A real `GET /api/admin/drops`
 * list route would be needed the moment a second drop ships, so a
 * dropdown/table of drops can replace this constant; not built since
 * there's nothing to list yet.
 */
const DROP_SLUG = "aurora-reserve"

interface FormValues {
  totalStock: string
  isManuallyClosed: boolean
  openAtLocal: string
  closeAtLocal: string
}

/**
 * `<input type="datetime-local">` has no timezone designator - a date-time
 * string with no "Z"/offset is parsed/produced in the browser's local
 * timezone, not UTC. These two helpers are the seam where that local-time
 * input format meets the UTC ISO 8601 wire format the API expects.
 */
function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datetimeLocalValueToIso(value: string): string {
  return new Date(value).toISOString()
}

function toFormValues(drop: GroupBuyDrop): FormValues {
  return {
    totalStock: String(drop.totalStock),
    isManuallyClosed: drop.isManuallyClosed,
    openAtLocal: isoToDatetimeLocalValue(drop.openAt),
    closeAtLocal: isoToDatetimeLocalValue(drop.closeAt),
  }
}

/**
 * Computed status/availableStock context reads the existing public
 * `GET /api/drops/:slug` rather than reimplementing the derivation here.
 * The admin-only drop route returns the raw row (soldCount/
 * isManuallyClosed/totalStock) but has no computed status/availableStock
 * field - re-deriving the closed>upcoming>sold_out>live precedence rule a
 * second time client-side would risk drifting from the server's logic.
 */
function DropStatusContext({ slug }: { slug: string }) {
  const { data, isPending, isError } = useDropState(slug)

  if (isPending) return <Skeleton className="h-16 w-full" />
  if (isError || !data) {
    return <p className="text-sm text-muted-foreground">Couldn't load the live status right now.</p>
  }

  const statusLabel: Record<typeof data.status, string> = {
    upcoming: "Opens soon",
    live: "Live now",
    sold_out: "Sold out",
    closed: "Closed",
  }
  const percentRemaining = data.totalStock === 0 ? 0 : Math.round((data.availableStock / data.totalStock) * 100)

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <Badge variant={data.status === "live" ? "default" : "secondary"}>{statusLabel[data.status]}</Badge>
        <span className="font-specs text-xs text-muted-foreground">as computed by the public drop route</span>
      </div>
      <Progress value={percentRemaining} aria-label="Stock remaining" />
      <p className="font-specs text-xs text-muted-foreground">
        {data.availableStock} of {data.totalStock} units available right now (accounts for active customer holds)
      </p>
    </div>
  )
}

function GroupBuyForm({ drop }: { drop: GroupBuyDrop }) {
  const updateMutation = useUpdateAdminDropMutation(drop.slug)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ defaultValues: toFormValues(drop) })

  // Re-sync once per load, not on every background refetch - keyed on a
  // value that only changes when a genuinely new drop row lands
  // (updatedAt), so in-progress edits never get silently reset.
  useEffect(() => {
    reset(toFormValues(drop))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drop.updatedAt])

  const isManuallyClosed = watch("isManuallyClosed")

  async function onSubmit(values: FormValues) {
    const totalStock = Number(values.totalStock)
    if (!Number.isFinite(totalStock) || totalStock <= 0) {
      setError("totalStock", { type: "manual", message: "Enter a positive whole number" })
      return
    }

    let openAt: string
    let closeAt: string
    try {
      openAt = datetimeLocalValueToIso(values.openAtLocal)
      closeAt = datetimeLocalValueToIso(values.closeAtLocal)
    } catch {
      setError("openAtLocal", { type: "manual", message: "Enter valid dates" })
      return
    }

    const input: AdminUpdateDropInput = {
      totalStock: Math.round(totalStock),
      isManuallyClosed: values.isManuallyClosed,
      openAt,
      closeAt,
    }

    await updateMutation.mutateAsync(input)
  }

  return (
    <form className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="drop-total-stock">Total stock</Label>
        <Input
          id="drop-total-stock"
          type="number"
          inputMode="numeric"
          min={1}
          step="1"
          aria-invalid={!!errors.totalStock}
          {...register("totalStock", { required: "Total stock is required" })}
        />
        <p className="text-xs text-muted-foreground">Already sold ({drop.soldCount}) plus any active holds set the real floor. The server rejects a value below that.</p>
        {errors.totalStock && (
          <p className="text-xs text-destructive" role="alert">
            {errors.totalStock.message}
          </p>
        )}
      </div>

      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="drop-open-at">Opens at</Label>
          <Input id="drop-open-at" type="datetime-local" {...register("openAtLocal", { required: true })} />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="drop-close-at">Closes at</Label>
          <Input id="drop-close-at" type="datetime-local" {...register("closeAtLocal", { required: true })} />
        </div>
      </div>

      <div className="flex items-center gap-2 py-1">
        <Checkbox
          id="drop-manually-closed"
          checked={isManuallyClosed}
          onCheckedChange={(checked) => setValue("isManuallyClosed", checked === true, { shouldDirty: true })}
        />
        <Label htmlFor="drop-manually-closed">Manually closed</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        This is the real "close the drop" action: setting Total stock to the sold count without checking this box leaves the
        drop reading as "sold out," not "closed" (see the contract's own documented reasoning for why those are kept distinct).
      </p>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}

function GroupBuySkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-1/2" />
    </div>
  )
}

export function AdminGroupBuy() {
  const { data, isPending, isError, error } = useAdminDrop(DROP_SLUG)

  if (isPending) return <GroupBuySkeleton />

  if (isError) {
    const notFound = error instanceof ApiRequestError && error.status === 404
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="font-heading text-lg">{notFound ? "Drop not found." : "Couldn't load this drop."}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {error instanceof ApiRequestError ? error.message : "Try again in a moment."}
        </p>
      </div>
    )
  }

  const drop = data.drop

  return (
    <div className="flex flex-col gap-6">
      <AdminTitle title="Group Buy" />
      <div>
        <h2 className="font-heading text-xl">{drop.title}</h2>
        <p className="text-sm text-muted-foreground">{drop.description}</p>
      </div>

      <DropStatusContext slug={drop.slug} />

      <div className="flex flex-wrap gap-6 rounded-xl border border-border bg-card p-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Sold so far</p>
          <p className="font-specs text-lg">{drop.soldCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total stock</p>
          <p className="font-specs text-lg">{drop.totalStock}</p>
        </div>
      </div>

      <GroupBuyForm drop={drop} />
    </div>
  )
}

