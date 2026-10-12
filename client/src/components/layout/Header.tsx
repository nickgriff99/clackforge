import { useEffect, useState } from "react"
import { Link, NavLink, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { LogOut, Menu, Search, Shield as ShieldIcon, ShoppingCart, User as UserIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { MuteToggle } from "@/components/layout/MuteToggle"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { ProductSearch } from "@/features/catalog/ProductSearch"
import { CartList } from "@/features/cart/CartList"
import { useCart } from "@/features/cart/useCart"
import { ApiRequestError } from "@/lib/api"
import { useAuth, useLogoutMutation } from "@/lib/auth"
import { BRAND_NAME, PRIMARY_NAV } from "@/lib/constants"

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors duration-fast ease-standard hover:text-accent ${
    isActive ? "text-accent" : "text-foreground"
  }`

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable
}

/** Signed-out link, signed-in dropdown, or a skeleton while the first `/me` response is in flight. */
function AccountMenu() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const logoutMutation = useLogoutMutation()

  async function handleLogout() {
    try {
      await logoutMutation.mutateAsync()
      toast.success("Signed out")
      navigate("/")
    } catch (err) {
      toast.error("Couldn't sign out", {
        description: err instanceof ApiRequestError ? err.message : "Something went wrong talking to the server.",
      })
    }
  }

  if (isLoading) {
    return <Skeleton className="size-8 rounded-full" />
  }

  if (!isAuthenticated || !user) {
    return (
      <Button type="button" variant="ghost" size="sm" render={<Link to="/login" />}>
        Sign in
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            aria-label={`Account menu, signed in as ${user.displayName}`}
          />
        }
      >
        <UserIcon />
        <span className="hidden max-w-24 truncate sm:inline">{user.displayName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/account" />}>
          <UserIcon /> Account
        </DropdownMenuItem>
        {/* Only entry point into /admin/* for an admin user - without this, those screens are only reachable by typing the URL directly. */}
        {user.role === "admin" && (
          <DropdownMenuItem render={<Link to="/admin/products" />}>
            <ShieldIcon /> Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleLogout} disabled={logoutMutation.isPending}>
          <LogOut /> {logoutMutation.isPending ? "Signing out…" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Header() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const { count: cartCount } = useCart()

  // `/` opens search - unless focus is already in a text field, so typing a
  // literal "/" into a search box or form input never gets hijacked.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      setSearchOpen(true)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          to="/"
          className="font-heading text-lg tracking-wide text-foreground"
        >
          {BRAND_NAME}
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
            <SheetTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Search products"
                />
              }
            >
              <Search />
            </SheetTrigger>
            <SheetContent side="top">
              <SheetHeader>
                <SheetTitle>Search products</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-4">
                <ProductSearch open={searchOpen} onNavigate={() => setSearchOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="relative"
                  aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
                />
              }
            >
              <ShoppingCart />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-mono text-primary-foreground">
                  {cartCount}
                </span>
              )}
            </SheetTrigger>
            <SheetContent side="right" className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Your cart</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-4">
                <CartList compact onNavigate={() => setCartOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <MuteToggle />

          <ThemeToggle />

          <AccountMenu />

          <Sheet>
            <SheetTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open menu"
                />
              }
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>{BRAND_NAME}</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4 pb-4">
                {PRIMARY_NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `rounded-md px-3 py-2 text-sm font-medium ${
                        isActive
                          ? "bg-muted text-accent"
                          : "text-foreground hover:bg-muted"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
