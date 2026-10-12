import { toast } from "sonner"
import { Seo } from "@/components/seo/Seo"
import { Button } from "@/components/ui/button"
import { ApiRequestError } from "@/lib/api"
import { useTryAsAdminMutation } from "@/lib/auth"

const REPO_URL = import.meta.env.VITE_REPO_URL ?? "https://github.com/nickgriff99"
const LIVE_URL = import.meta.env.VITE_LIVE_URL

const HIGHLIGHTS = [
  {
    title: "The server never trusts a price",
    body: "The configurator prices a build locally for speed. Every save, cart add and checkout recomputes it on the server with the same shared pricing function, and rejects any mismatch.",
  },
  {
    title: "Oversell protection under real concurrency",
    body: "Group-buy reservations take a row lock inside a database transaction. A Playwright test races several independent browser sessions for the last unit, and exactly one wins.",
  },
  {
    title: "Everything 3D is also text",
    body: "Each spec, price and selection the canvas shows is mirrored as labeled, screen-reader-friendly markup. Reduced-motion users get instant cuts instead of animation.",
  },
  {
    title: "One schema, both sides",
    body: "Request and response shapes live once in a shared Zod package that the client and the server both import, so the two cannot drift apart.",
  },
]

/**
 * About page: project summary, source/demo links, engineering highlights,
 * and the "Try as admin" shortcut for reviewers.
 */
export function About() {
  const tryAsAdminMutation = useTryAsAdminMutation()

  async function handleTryAsAdmin() {
    try {
      const { user } = await tryAsAdminMutation.mutateAsync()
      toast.success("Signed in as demo admin", { description: user.displayName })
    } catch (err) {
      toast.error("Couldn't start the demo admin session", {
        description:
          err instanceof ApiRequestError && err.code === "RATE_LIMITED"
            ? "Too many tries from this connection. Wait a minute and try again."
            : err instanceof ApiRequestError
              ? err.message
              : "Something went wrong talking to the server.",
      })
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12">
      <Seo
        title="About"
        description="The real stack behind CLACKFORGE: a 3D configurator, live cart and checkout, and a working admin surface, not a static mockup. Portfolio demo, honestly labeled."
      />
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-3xl">About CLACKFORGE</h1>
        <p className="text-muted-foreground">
          CLACKFORGE is a fictional mechanical-keyboard store built to demonstrate a real,
          deployable full-stack system: a 3D configurator, live cart and checkout, and a working
          admin surface, not just a static mockup.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" render={<a href={REPO_URL} target="_blank" rel="noopener noreferrer" />}>
          View source on GitHub
        </Button>
        {LIVE_URL && (
          <Button variant="outline" render={<a href={LIVE_URL} target="_blank" rel="noopener noreferrer" />}>
            Open the live demo
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-xl">How this was built</h2>
        <p className="text-sm text-muted-foreground">
          The client is a React and TypeScript Vite SPA using React Router. The API is a Node.js and
          Express REST server backed by PostgreSQL via Prisma. Auth is Passport-based sessions
          (email/password and Google OAuth). Checkout runs through Stripe in test mode. The 3D hero
          and configurator are built with three.js, via{" "}
          <span className="font-mono text-xs">@react-three/fiber</span> and{" "}
          <span className="font-mono text-xs">drei</span>.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-xl">Engineering highlights</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          {HIGHLIGHTS.map((item) => (
            <div key={item.title} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
              <dt className="font-heading text-base">{item.title}</dt>
              <dd className="text-sm text-muted-foreground">{item.body}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-5">
        <h2 className="font-heading text-lg">Try it as an admin</h2>
        <Button
          type="button"
          size="lg"
          className="w-fit"
          disabled={tryAsAdminMutation.isPending}
          onClick={handleTryAsAdmin}
        >
          {tryAsAdminMutation.isPending ? "Signing in…" : "Try as admin"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Skips the login form and signs you into a live demo admin account with full
          catalog, order and dashboard access. Nothing here is permanent. The admin dashboard's
          "Reset demo data" button restores the original seed data at any time.
        </p>
      </div>
    </div>
  )
}
