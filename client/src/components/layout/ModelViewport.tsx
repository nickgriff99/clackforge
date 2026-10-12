import type { ReactNode } from "react"
import { cn } from "cn"
import { KeyboardPoster } from "@/components/layout/KeyboardPoster"
import { ModelViewportSkeleton } from "@/components/layout/ModelViewportSkeleton"

export type ModelViewportState = "skeleton" | "poster" | "canvas"

export interface ModelViewportProps {
  /**
   * Which visual occupies the slot. Defaults to `"poster"`.
   * - `"skeleton"` - brief pre-paint loading state (route just mounted, a
   *   chunk is still fetching, etc).
   * - `"poster"` - the static `<KeyboardPoster>` stand-in. This is also
   *   the **permanent** state for graceful 3D degradation: no WebGL,
   *   sustained low perf, or reduced-motion-at-the-performance-floor -
   *   that decision belongs to the caller's fallback logic, not this
   *   component.
   * - `"canvas"` - renders `children`, the live `<Canvas>` tree from
   *   `@react-three/fiber` (`components/three/*`).
   */
  state?: ModelViewportState
  /** Override the default `<KeyboardPoster>`. */
  poster?: ReactNode
  /** Override the default `<ModelViewportSkeleton>`. */
  skeleton?: ReactNode
  /** The `<Canvas>` tree - only rendered when `state === "canvas"`. */
  children?: ReactNode
  className?: string
}

/**
 * Responsive, aspect-ratio'd container that hosts the 3D configurator
 * canvas (`/build` page). This is the integration seam between whatever
 * drops a `<Canvas>` in as `children` + flips `state="canvas"` once
 * mounted, and the WebGL-detect / perf-monitor logic that decides which
 * `state` to pass - never hardcode that decision here.
 *
 * Mobile-first aspect ratio: `aspect-square` at the base (375px-wide phone
 * gets a 375px-tall viewport - sized, not squished or absurdly tall), widens
 * to `aspect-[4/3]` at `sm:`, and `aspect-video` at `lg:` once the
 * `Build.tsx` grid splits into a side-by-side viewport + step panel. Using
 * `aspect-*` (not a fixed height) means the box's size is resolved before
 * any content paints - zero CLS regardless of which `state` lands inside it.
 */
export function ModelViewport({
  state = "poster",
  poster,
  skeleton,
  children,
  className,
}: ModelViewportProps) {
  return (
    <div
      data-model-viewport
      data-model-viewport-state={state}
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-card sm:aspect-[4/3] lg:aspect-video",
        className
      )}
    >
      {state === "skeleton" && (skeleton ?? <ModelViewportSkeleton />)}
      {state === "poster" && (poster ?? <KeyboardPoster />)}
      {state === "canvas" && children}
    </div>
  )
}
