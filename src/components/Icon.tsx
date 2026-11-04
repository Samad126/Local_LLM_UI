import {
  Plus, X, SendHorizontal, Square, SlidersHorizontal, Copy, Pencil, Trash2, RefreshCw, Image, MessageSquare,
  Cpu, BookOpen, Settings, Pin, ChevronDown, ChevronRight, Brain, Download, Upload, Check, Globe, Paperclip,
  Folder, Terminal, Menu, type LucideIcon,
} from 'lucide-react'

const P: Record<string, LucideIcon> = {
  plus: Plus, x: X, send: SendHorizontal, stop: Square, sliders: SlidersHorizontal, copy: Copy, edit: Pencil,
  trash: Trash2, refresh: RefreshCw, image: Image, chat: MessageSquare, cpu: Cpu, book: BookOpen, gear: Settings,
  pin: Pin, down: ChevronDown, right: ChevronRight, brain: Brain, download: Download, upload: Upload, check: Check,
  globe: Globe, clip: Paperclip, folder: Folder, terminal: Terminal, menu: Menu,
}

export function Icon({ n, size = 16 }: { n: keyof typeof P | string; size?: number }) {
  const C = P[n] ?? Square
  return <C size={size} strokeWidth={1.8} />
}
