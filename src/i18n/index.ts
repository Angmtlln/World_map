import { ru } from './ru'

// Every locale must provide the same keys as the Russian dictionary.
export type MessageKey = keyof typeof ru
export type Messages = Record<MessageKey, string>

const messages: Messages = ru

// Replaces {name} placeholders with values from `params`.
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const message = messages[key]
  if (!params) return message
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

// Territory names come with the map data, one field per language.
export function territoryName(p: { name_ru: string; name_en: string }): string {
  return p.name_ru
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  // Dates taken are camera wall-clock time stored as UTC; show them as they are.
  timeZone: 'UTC',
})

export function formatDate(ms: number): string {
  return dateFormat.format(ms)
}
