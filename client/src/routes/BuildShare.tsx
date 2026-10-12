import { useEffect, useRef } from "react"
import { Link, useParams } from "react-router-dom"
import { Info } from "lucide-react"
import { LAYOUT_LABELS } from "@shared"
import { Build } from "@/routes/Build"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useBuildDetail } from "@/features/configurator/queries"
import { useConfiguratorStore } from "@/features/configurator/store"
import { ApiRequestError } from "@/lib/api"

/**
 * `/b/:id` - backed by the public `GET /api/builds/:id` (no auth, no
 * private-build mode at all).
 *
 * Deliberately reuses `routes/Build.tsx` wholesale rather than a parallel
 * read-only view component, hydrating the same Zustand store the `?b=`
 * restore path already uses (`store.ts`'s `hydrate()`). Editing from here
 * is just... editing - no fork mechanics, the banner below says so.
 */
const BUILD_SHARE_SEO_DESCRIPTION =
  "A shared CLACKFORGE build: see the exact configuration, spec sheet, and price, and start your own from this point."

export function BuildShare() {
  const { id } = useParams<{ id: string }>()
  const { data, isPending, isError, error } = useBuildDetail(id)
  const hasHydratedRef = useRef(false)

  // Hydrate once, the instant this build's detail first arrives. Guarded by
  // a ref (not just keyed on `data`) so a background refetch of this public
  // query (e.g. tab refocus, if that's ever re-enabled) never clobbers edits
  // the visitor has already made locally - same spirit as `Build.tsx`'s own
  // `hasAttemptedHydrationRef` guard on the `?b=` restore path.
  useEffect(() => {
    if (!data || hasHydratedRef.current) return
    hasHydratedRef.current = true
    useConfiguratorStore.getState().hydrate({ layout: data.build.layout, selections: data.build.selections })
  }, [data])

  if (isPending) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <Skeleton className="mb-6 h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const notFound = isError && error instanceof ApiRequestError && error.status === 404

  if (isError) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
        {notFound && <span className="font-mono text-sm text-muted-foreground">404</span>}
        <h1 className="font-heading text-2xl">{notFound ? "This build isn't here." : "Couldn't load this build"}</h1>
        <p className="text-sm text-muted-foreground">
          {notFound
            ? "The link may be mistyped, or the build it pointed to was deleted."
            : error instanceof ApiRequestError
              ? error.message
              : "Something went wrong talking to the server."}
        </p>
        <Button render={<Link to="/build" />}>Start a new build</Button>
      </div>
    )
  }

  // `build.name` is set whenever this build was ever saved with a label,
  // null for a mint-without-save share link. Falls back to the layout
  // label (e.g. "TKL custom build") rather than a generic "Shared build" so
  // distinct `/b/:id` links at least differ by layout when no name exists.
  const buildTitle = data.build.name ?? `${LAYOUT_LABELS[data.build.layout]} custom build`

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:pt-8">
        <div className="flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <p>
            You&apos;re viewing a shared build. The 3D model, spec sheet, and price below are exactly as its owner
            left them. Change any option to start your own configuration from this point; nothing here gets
            overwritten.
          </p>
        </div>
      </div>
      {/*
       * `seoOverride` (not a second sibling `<Seo>`) - two `<Seo>` instances
       * rendered in the same commit by a parent and the plain, non-lazy
       * child it synchronously renders don't resolve by JSX/mount order:
       * the child's `<title>` lands first in DOM and wins regardless of
       * where the parent's own `<Seo>` sits in the tree. See `Build.tsx`'s
       * `BuildProps.seoOverride` doc comment for the full explanation -
       * this prop is the fix (exactly one `<Seo>` ever renders for this page).
       */}
      <Build seoOverride={{ title: buildTitle, description: BUILD_SHARE_SEO_DESCRIPTION }} />
    </>
  )
}
