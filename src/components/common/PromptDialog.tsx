import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface Props {
  title: string
  description?: string
  label?: string
  initial?: string
  placeholder?: string
  action?: string
  onSubmit: (value: string) => void
  /** The element that opens the dialog. Omit to control it with `open`/`onOpenChange`. */
  children?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** In-app replacement for window.prompt(), which Electron does not support. */
export function PromptDialog({
  title,
  description,
  label,
  initial = '',
  placeholder,
  action = 'OK',
  onSubmit,
  children,
  open,
  onOpenChange,
}: Props) {
  const [inner, setInner] = useState(false)
  const [value, setValue] = useState(initial)
  const isOpen = open ?? inner
  const setOpen = (o: boolean) => {
    if (o) setValue(initial)
    onOpenChange?.(o)
    setInner(o)
  }
  const submit = () => {
    const v = value.trim()
    if (!v) return
    setOpen(false)
    onSubmit(v)
  }
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {label && <label className="text-sm">{label}</label>}
        <Input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!value.trim()} onClick={submit}>
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
