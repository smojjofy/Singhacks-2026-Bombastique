import { CATEGORIES, PRODUCTS } from "../data/catalog"
import { CONDITIONS } from "../domain/config"
import type { Condition } from "../domain/types"

export function ProductSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {CATEGORIES.map((cat) => (
        <optgroup key={cat} label={cat}>
          {PRODUCTS.filter((p) => p.category === cat).map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji} {p.title}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export function ConditionSelect({
  value,
  onChange,
}: {
  value: Condition
  onChange: (c: Condition) => void
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Condition)}>
      {CONDITIONS.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  )
}
