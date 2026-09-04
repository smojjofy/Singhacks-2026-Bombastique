export type Listing = {
  id: string
  title: string
  category: string
  price: number
  mma: number
  seller: string
  condition: string
  emoji: string
}

export const listings: Listing[] = [
  { id: "switch", title: "Nintendo Switch OLED", category: "Gaming", price: 245, mma: 252, seller: "Maya L.", condition: "Great condition", emoji: "🎮" },
  { id: "camera", title: "Fujifilm X100V", category: "Cameras", price: 1420, mma: 1395, seller: "Ben T.", condition: "Lightly used", emoji: "📷" },
  { id: "headphones", title: "Sony WH-1000XM5", category: "Audio", price: 280, mma: 295, seller: "Claire Y.", condition: "Like new", emoji: "🎧" },
]
