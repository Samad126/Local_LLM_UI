import Dexie, { type Table } from 'dexie'
import type { Chat, Preset, Prompt } from '@/types'

class AppDB extends Dexie {
  chats!: Table<Chat, string>
  presets!: Table<Preset, string>
  prompts!: Table<Prompt, string>
  constructor() {
    super('local-llm-ui')
    this.version(1).stores({ chats: 'id,updatedAt', presets: 'id', prompts: 'id' })
  }
}

export const db = new AppDB()
