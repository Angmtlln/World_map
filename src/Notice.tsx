import './Notice.css'

export interface NoticeAction {
  label: string
  onClick: () => void
}

interface Props {
  text: string
  tone?: 'normal' | 'error'
  actions?: NoticeAction[]
}

// A message card at the top of the screen. Several stack in an .app-notices column.
export function Notice({ text, tone = 'normal', actions = [] }: Props) {
  return (
    <div className={`notice${tone === 'error' ? ' notice-error' : ''}`} role="status">
      <p>{text}</p>
      {actions.map((action) => (
        <button key={action.label} type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ))}
    </div>
  )
}
