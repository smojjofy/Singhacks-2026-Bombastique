import type { Product } from "../domain/types"

export const CATEGORIES = [
  "Phones",
  "Bicycles & E-Scooters",
  "Household Appliances",
  "Gaming & Audio",
] as const

/**
 * Recognizable catalog with stable product IDs and exact model/variants.
 * 15 products across phones, bicycles/e-scooters, and household appliances,
 * plus optional gaming/audio supplements.
 */
export const PRODUCTS: Product[] = [
  // Phones
  { id: "phone-iphone-13", title: "Apple iPhone 13 128GB", category: "Phones", emoji: "📱" },
  { id: "phone-pixel-9", title: "Google Pixel 9 128GB", category: "Phones", emoji: "📱" },
  { id: "phone-galaxy-s23", title: "Samsung Galaxy S23", category: "Phones", emoji: "📱" },
  // Bicycles & e-scooters
  { id: "bike-trek-fx", title: "Trek FX 2 Hybrid Bike", category: "Bicycles & E-Scooters", emoji: "🚲" },
  { id: "scooter-xiaomi", title: "Xiaomi Mi Electric Scooter 3", category: "Bicycles & E-Scooters", emoji: "🛴" },
  { id: "ebike-rad", title: "Rad Power RadRunner 2 E-Bike", category: "Bicycles & E-Scooters", emoji: "🛵" },
  // Household appliances
  { id: "vacuum-dyson", title: "Dyson V11 Cordless Vacuum", category: "Household Appliances", emoji: "🧹" },
  { id: "pot-instant", title: "Instant Pot Duo 7-in-1", category: "Household Appliances", emoji: "🍲" },
  { id: "airfryer-ninja", title: "Ninja Air Fryer AF101", category: "Household Appliances", emoji: "🍟" },
  { id: "microwave-panasonic", title: "Panasonic NN-SN686S Microwave", category: "Household Appliances", emoji: "♨️" },
  { id: "washer-compact", title: "Compact Portable Washing Machine", category: "Household Appliances", emoji: "🧺" },
  // Gaming & audio
  { id: "console-switch", title: "Nintendo Switch OLED", category: "Gaming & Audio", emoji: "🎮" },
  { id: "headphones-sony-xm5", title: "Sony WH-1000XM5", category: "Gaming & Audio", emoji: "🎧" },
  { id: "camera-fuji-x100v", title: "Fujifilm X100V", category: "Gaming & Audio", emoji: "📷" },
  { id: "console-ps5", title: "Sony PlayStation 5", category: "Gaming & Audio", emoji: "🕹️" },
]

export function productById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id)
}
