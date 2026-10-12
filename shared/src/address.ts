import { z } from "zod"
import { IdSchema, IsoDateTimeSchema } from "./common"

export const AddressSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  label: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().nullable(),
  city: z.string().min(1),
  region: z.string().min(1),
  postalCode: z.string().min(1),
  /** ISO 3166-1 alpha-2. */
  country: z.string().length(2),
  isDefault: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
})
export type Address = z.infer<typeof AddressSchema>
