/**
 * schema.org `Product` JSON-LD. `ShopProduct.tsx`'s only caller - real
 * data pulled from the already-fetched product/variant the page is
 * already rendering, nothing hand-typed or duplicated here.
 *
 * Renders an inline `<script type="application/ld+json">` directly in the
 * component tree, not via `Seo.tsx`'s `<head>`-hoisting mechanism - React's
 * native metadata hoisting covers `<title>`/`<meta>`/`<link>` only, not
 * `<script>`. This is fine and standard: JSON-LD doesn't need to live in
 * `<head>` for crawlers to find it - Google's own structured-data docs
 * explicitly support `<body>` placement.
 */
export interface ProductJsonLdProps {
  name: string
  description: string
  images: string[]
  /** Integer cents (this project's money convention everywhere - see `CentsSchema`). */
  priceCents: number
  /** ISO 4217 currency code, any case - normalized to uppercase for `offers.priceCurrency`. */
  currency: string
  inStock: boolean
  /** Canonical absolute URL for this product's own PDP. */
  url: string
}

export function ProductJsonLd({ name, description, images, priceCents, currency, inStock, url }: ProductJsonLdProps) {
  const json = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image: images,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: currency.toUpperCase(),
      price: (priceCents / 100).toFixed(2),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  }

  return (
    <script
      type="application/ld+json"
      // Escape every "<" so a stray "</script"-like substring inside product
      // copy can never prematurely terminate this inline tag. < is a
      // valid JSON string escape and round-trips through JSON.parse cleanly.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, "\\u003c") }}
    />
  )
}
