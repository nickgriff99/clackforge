import { Link } from "react-router-dom"
import { Seo } from "@/components/seo/Seo"
import { HeroSection } from "@/features/hero/HeroSection"

const FEATURES = [
  {
    title: "Built to spec",
    body: "Every switch, plate, and keycap set ships with a real spec sheet, no mystery parts.",
  },
  {
    title: "Configure it your way",
    body: "Pick a case, pick your switches, pick your keycaps. The build is yours end to end.",
  },
  {
    title: "Group-buy drops",
    body: "Limited runs, pledged in batches with the community, not a warehouse of leftovers.",
    // Hardcoded to the one seeded demo drop since there's exactly one drop
    // in this portfolio demo; a real multi-drop catalog would need a
    // GET /api/drops list route to drive this instead.
    href: "/drop/aurora-reserve",
  },
]

export function Home() {
  return (
    <div className="flex flex-col">
      <Seo
        raw
        title="CLACKFORGE | Build your clack."
        description="Custom mechanical keyboards, switch by switch. Configure a build in real 3D, shop real spec sheets, and join group-buy drops. A portfolio demo store."
      />
      <HeroSection />

      <section className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:grid-cols-3">
          {FEATURES.map((feature) =>
            feature.href ? (
              <Link key={feature.title} to={feature.href} className="group flex flex-col gap-2">
                <h2 className="font-heading text-xl group-hover:text-accent">{feature.title}</h2>
                <p className="text-sm text-muted-foreground">{feature.body}</p>
              </Link>
            ) : (
              <div key={feature.title} className="flex flex-col gap-2">
                <h2 className="font-heading text-xl">{feature.title}</h2>
                <p className="text-sm text-muted-foreground">{feature.body}</p>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  )
}
