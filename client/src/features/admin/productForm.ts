/**
 * Plain-text <-> structured-value helpers shared by the "New product"
 * dialog and `AdminProductEdit.tsx`'s edit form. `specs` and `images` are
 * deliberately edited as plain text (one `key: value` per line /
 * comma-separated URLs) rather than a dynamic add/remove-row widget - a
 * real, intentional simplification over building a rich media/spec-sheet
 * editor.
 */

export function parseSpecsText(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim()
    if (!line) continue
    const idx = line.indexOf(":")
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key) result[key] = value
  }
  return result
}

export function specsToText(specs: Record<string, string>): string {
  return Object.entries(specs)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
}

export function parseImagesText(text: string): string[] {
  return text
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
}

export function imagesToText(images: string[]): string {
  return images.join(", ")
}
