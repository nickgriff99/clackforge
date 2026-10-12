import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DEMO_BANNER_MESSAGE, DEMO_BANNER_STORAGE_KEY } from "@/lib/constants"

/**
 * Required demo-honesty banner. Dismissal persists per browser session
 * (sessionStorage - reappears in a fresh tab/session, unlike a permanent
 * localStorage dismissal) and is present on every route via RootLayout.
 */
export function DemoBanner() {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DEMO_BANNER_STORAGE_KEY) === "1")
  }, [])

  if (dismissed) return null

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 border-b border-border bg-accent px-4 py-2 text-center text-sm font-medium text-accent-foreground"
    >
      <span className="font-mono">{DEMO_BANNER_MESSAGE}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-accent-foreground hover:bg-accent-foreground/10"
        aria-label="Dismiss demo notice"
        onClick={() => {
          sessionStorage.setItem(DEMO_BANNER_STORAGE_KEY, "1")
          setDismissed(true)
        }}
      >
        <X />
      </Button>
    </div>
  )
}
