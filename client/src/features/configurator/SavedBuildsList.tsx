import { useState } from "react"
import { Link } from "react-router-dom"
import { Boxes, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { LAYOUT_LABELS, type SavedBuildSummary } from "@shared"
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
import { Skeleton } from "@/components/ui/skeleton"
import { useDeleteSavedBuildMutation, useRenameSavedBuildMutation, useSavedBuilds } from "@/features/configurator/queries"
import { ApiRequestError } from "@/lib/api"
import { formatCents } from "@/lib/utils"

function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

function SavedBuildRow({ build }: { build: SavedBuildSummary }) {
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [label, setLabel] = useState(build.label)
  const renameMutation = useRenameSavedBuildMutation()
  const deleteMutation = useDeleteSavedBuildMutation()

  async function handleRename() {
    const trimmed = label.trim()
    if (trimmed.length === 0) return
    try {
      await renameMutation.mutateAsync({ id: build.id, input: { label: trimmed } })
      toast.success("Build renamed")
      setIsRenameOpen(false)
    } catch (err) {
      toast.error("Couldn't rename this build", {
        description: err instanceof ApiRequestError ? err.message : "Something went wrong talking to the server.",
      })
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(build.id)
      toast.success("Build deleted")
      setIsDeleteOpen(false)
    } catch (err) {
      toast.error("Couldn't delete this build", {
        description: err instanceof ApiRequestError ? err.message : "Something went wrong talking to the server.",
      })
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <Link to={`/b/${build.id}`} className="flex flex-1 flex-col gap-1 overflow-hidden hover:underline">
        <span className="truncate text-sm">{build.label}</span>
        <span className="font-specs text-xs text-muted-foreground">
          {LAYOUT_LABELS[build.layout]} · {formatCents(build.totalPrice)} · Saved {formatSavedAt(build.createdAt)}
        </span>
      </Link>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Rename "${build.label}"`}
          onClick={() => {
            setLabel(build.label)
            setIsRenameOpen(true)
          }}
        >
          <Pencil />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete "${build.label}"`}
          onClick={() => setIsDeleteOpen(true)}
        >
          <Trash2 />
        </Button>
      </div>

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename build</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`rename-${build.id}`}>Build name</Label>
            <Input
              id={`rename-${build.id}`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void handleRename()
                }
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button
              type="button"
              onClick={handleRename}
              disabled={label.trim().length === 0 || renameMutation.isPending}
            >
              {renameMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{build.label}&quot;?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. The build is removed from your account for good. Anyone who already has
              its link will see a not-found page instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** `GET /api/builds` - real list, no stub. Used by `routes/Account.tsx`, same shape/pattern as `OrderHistoryList`. */
export function SavedBuildsList() {
  const { data, isPending, isError, error } = useSavedBuilds()

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof ApiRequestError ? error.message : "Couldn't load your saved builds right now."}
      </p>
    )
  }

  if (data.builds.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
        <Boxes className="size-7 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No saved builds yet. Save one from the Review step in the configurator.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {data.builds.map((build) => (
        <SavedBuildRow key={build.id} build={build} />
      ))}
    </div>
  )
}
