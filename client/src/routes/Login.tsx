import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { LoginInputSchema, type LoginInput } from "@shared"
import { Seo } from "@/components/seo/Seo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLoginMutation } from "@/lib/auth"
import { ApiRequestError, googleAuthUrl } from "@/lib/api"

const GENERIC_AUTH_ERROR = "Email or password is incorrect."

/** Where to send the user after a successful login - set by `<ProtectedRoute>` when it redirected here. */
function useRedirectTarget(): string {
  const location = useLocation()
  const state = location.state as { from?: { pathname: string; search: string } } | null
  return state?.from ? `${state.from.pathname}${state.from.search}` : "/account"
}

export function Login() {
  const navigate = useNavigate()
  const redirectTo = useRedirectTarget()
  const loginMutation = useLoginMutation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)

  // `GET /api/auth/google/callback` redirects failures here as
  // `?authError=GOOGLE_AUTH_FAILED`. Render it with the same generic
  // treatment as INVALID_CREDENTIALS, then strip the param so a refresh
  // doesn't re-show it.
  useEffect(() => {
    if (searchParams.get("authError") === "GOOGLE_AUTH_FAILED") {
      setFormError("Google sign-in didn't go through. Try again, or sign in with your password.")
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete("authError")
          return next
        },
        { replace: true },
      )
    }
  }, [searchParams, setSearchParams])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginInputSchema),
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(values: LoginInput) {
    setFormError(null)
    try {
      const { user } = await loginMutation.mutateAsync(values)
      toast.success("Welcome back", { description: user.displayName })
      navigate(redirectTo, { replace: true })
    } catch (err) {
      // Deliberately one generic message on the whole form, never split
      // per-field - INVALID_CREDENTIALS covers "no account" and "wrong
      // password" alike so the form can't be used to enumerate registered
      // emails.
      if (err instanceof ApiRequestError && err.code === "INVALID_CREDENTIALS") {
        setFormError(GENERIC_AUTH_ERROR)
        return
      }
      toast.error("Couldn't sign in", {
        description: err instanceof ApiRequestError ? err.message : "Something went wrong talking to the server.",
      })
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-12">
      <Seo title="Sign in" description="Sign in to your CLACKFORGE account to check out, reserve drops, and track orders." />
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl">Sign in</h1>
        <p className="text-sm text-muted-foreground">Pick up where you left off.</p>
      </div>

      <Button type="button" variant="outline" size="lg" render={<a href={googleAuthUrl()} />}>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </div>
      )}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-destructive" role="alert">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Need an account?{" "}
        <Link to="/register" className="text-accent underline underline-offset-2">
          Create one
        </Link>
      </p>
    </div>
  )
}
