import { useNavigate, useLocation, Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { RegisterInputSchema, type RegisterInput } from "@shared"
import { Seo } from "@/components/seo/Seo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRegisterMutation } from "@/lib/auth"
import { ApiRequestError, googleAuthUrl } from "@/lib/api"

/** Where to send the user after a successful register - same pattern as Login.tsx. */
function useRedirectTarget(): string {
  const location = useLocation()
  const state = location.state as { from?: { pathname: string; search: string } } | null
  return state?.from ? `${state.from.pathname}${state.from.search}` : "/account"
}

export function Register() {
  const navigate = useNavigate()
  const redirectTo = useRedirectTarget()
  const registerMutation = useRegisterMutation()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterInputSchema),
    defaultValues: { email: "", password: "", displayName: "" },
  })

  async function onSubmit(values: RegisterInput) {
    try {
      // Empty optional field submits as "" from the input - the server
      // derives a fallback from the email local-part only when the field is
      // actually omitted, so normalize "" to undefined here.
      const input: RegisterInput = {
        ...values,
        displayName: values.displayName ? values.displayName : undefined,
      }
      const { user } = await registerMutation.mutateAsync(input)
      toast.success("Account created", { description: `Welcome, ${user.displayName}.` })
      navigate(redirectTo, { replace: true })
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "EMAIL_TAKEN") {
        setError("email", { type: "server", message: err.message })
        return
      }
      toast.error("Couldn't create your account", {
        description: err instanceof ApiRequestError ? err.message : "Something went wrong talking to the server.",
      })
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-12">
      <Seo title="Create an account" description="Create a CLACKFORGE account to save builds, track orders, and pledge into group buys." />
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Save builds, track orders, and pledge into group buys.
        </p>
      </div>

      <Button type="button" variant="outline" size="lg" render={<a href={googleAuthUrl()} />}>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            type="text"
            autoComplete="name"
            aria-invalid={!!errors.displayName}
            {...register("displayName")}
          />
          <p className="text-xs text-muted-foreground">Defaults to your email name if left blank.</p>
          {errors.displayName && (
            <p className="text-xs text-destructive" role="alert">
              {errors.displayName.message}
            </p>
          )}
        </div>

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
            autoComplete="new-password"
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
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-accent underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  )
}
