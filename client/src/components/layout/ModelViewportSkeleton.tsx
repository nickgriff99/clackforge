import { Skeleton } from "@/components/ui/skeleton"

/**
 * Loading state for `<ModelViewport>`, shown for the brief gap between
 * route mount and the poster/canvas actually being ready to paint. The
 * outer wrapper dimensions (`h-[72%] w-[88%] max-w-[560px]`) intentionally
 * match `<KeyboardPoster>`'s inner frame exactly, so swapping skeleton ->
 * poster/canvas never shifts layout - only what's painted inside that
 * fixed frame changes.
 *
 * `<Skeleton>` already disables its pulse via `motion-reduce:animate-none`
 * (client/src/components/ui/skeleton.tsx), so this inherits reduced-motion
 * compliance for free.
 */
export function ModelViewportSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex h-[72%] w-[88%] max-w-[560px] items-center justify-center">
        <Skeleton className="h-full w-full rounded-2xl" />
      </div>
    </div>
  )
}
