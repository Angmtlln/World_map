import { ru } from './ru'

// Every locale must provide the same keys as the Russian dictionary.
export type MessageKey = keyof typeof ru
export type Messages = Record<MessageKey, string>

const messages: Messages = ru

export function t(key: MessageKey): string {
  return messages[key]
}
