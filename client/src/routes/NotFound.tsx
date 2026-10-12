import { Link } from "react-router-dom"
import { Seo } from "@/components/seo/Seo"
import { Button } from "@/components/ui/button"

export function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
      <Seo title="Page not found" description="That page isn't here. Maybe it's filed under something else." />
      <span className="font-mono text-sm text-muted-foreground">404</span>
      <h1 className="font-heading text-2xl">Wrong drawer in the parts bin.</h1>
      <p className="text-sm text-muted-foreground">
        That page isn't here. Maybe it's filed under something else.
      </p>
      <Button render={<Link to="/" />}>Back to home</Button>
    </div>
  )
}
