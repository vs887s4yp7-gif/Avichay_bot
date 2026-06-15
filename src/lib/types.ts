// ================================================================
// src/lib/types.ts
// ================================================================
export type Product = {
  id: string
  name: string
  description: string | null
  category: string | null
  subcategory: string | null
  tags: string[]
  price: number | null
  cartonQty: number | null
  stock: string | null
  image: string | null
}
