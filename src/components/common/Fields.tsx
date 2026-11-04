import type { ThinkMode } from '@/types'
import type { ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'

const NONE = '__none__'

// shadcn Select with a flat options list. value '' shows the placeholder (Radix forbids empty item values).
export function Pick({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: ReactNode }[]
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <Select
      value={value === '' ? undefined : value}
      onValueChange={(v) => v !== NONE && onChange(v)}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || NONE} value={o.value || NONE}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <label className="check">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} /> {children}
    </label>
  )
}

export function Range({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <Slider className="my-2" value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
  )
}

export const THINK_OPTIONS: { value: ThinkMode; label: string }[] = [
  { value: 'default', label: 'Model default' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off (faster)' },
]
export const SEARCH_ENGINE_OPTIONS = [
  { value: 'ddg', label: 'DuckDuckGo (no key)' },
  { value: 'searxng', label: 'SearXNG (self-hosted)' },
]
