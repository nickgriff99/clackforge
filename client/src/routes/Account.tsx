import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Seo } from "@/components/seo/Seo"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SavedBuildsList } from "@/features/configurator/SavedBuildsList"
import { OrderHistoryList } from "@/features/orders/OrderHistoryList"
import { ProtectedRoute, useAuth, useLogoutMutation } from "@/lib/auth"
import { ApiRequestError } from "@/lib/api"

function AccountDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const logoutMutation = useLogoutMutation()

  async function handleLogout() {
    try {
      await logoutMutation.mutateAsync()
      toast.success("Signed out")
      navigate("/", { replace: true })
    } catch (err) {
      toast.error("Couldn't sign out", {
        description: err instanceof ApiRequestError ? err.message : "Something went wrong talking to the server.",
      })
    }
  }

  // ProtectedRoute guarantees `user` is set by the time this branch renders.
  if (!user) return null

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl">Account</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-specs text-foreground">{user.email}</span>
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="font-heading text-lg">{user.displayName}</p>
          <p className="font-specs text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Button type="button" variant="outline" onClick={handleLogout} disabled={logoutMutation.isPending}>
          {logoutMutation.isPending ? "Signing out…" : "Log out"}
        </Button>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg">Order history</h2>
        <OrderHistoryList />
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg">Saved builds</h2>
        <SavedBuildsList />
      </div>
    </div>
  )
}

export function Account() {
  return (
    <ProtectedRoute>
      <Seo title="Account" description="Your CLACKFORGE order history and saved builds." />
      <AccountDashboard />
    </ProtectedRoute>
  )
}
