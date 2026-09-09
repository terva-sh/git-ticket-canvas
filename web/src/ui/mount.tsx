import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { Toolbar, type ToolbarProps } from './Toolbar'
import { Inspector } from './Inspector'
import { Composer, type ComposerPosition } from './Composer'
import type { Op, Ticket } from '../platform/tickets/types'

export interface Feedback { id: number; message: string; error: boolean }
export function FeedbackMessage({ feedback }: { feedback: Feedback | null }) {
  const [visible, setVisible] = useState(feedback?.id)
  useEffect(() => {
    setVisible(feedback?.id)
    if (!feedback) return
    const timer = setTimeout(() => setVisible(undefined), feedback.error ? 5200 : 2600)
    return () => clearTimeout(timer)
  }, [feedback])
  return <div id="toast" role={feedback?.error ? 'alert' : 'status'} class={(feedback && visible === feedback.id ? 'show' : '') + (feedback?.error ? ' err' : '')}>{feedback?.message}</div>
}
export interface FormsModel {
  toolbar: ToolbarProps; ticket: Ticket | null; tickets: ReadonlyMap<string, Ticket>
  composer: ComposerPosition | null; composerKey: number; feedback: Feedback | null
}
export interface FormsActions {
  patch(ticket: Ticket, ops: Op[]): Promise<unknown>; closeInspector(): void
  navigate(id: string): void; remove(ticket: Ticket): Promise<unknown>
  create(title: string, position: ComposerPosition): Promise<unknown>; closeComposer(position: ComposerPosition): void
}
// These two roots and their descendants belong only to Preact. The canvas
// adapter sends values/actions and never changes a form element's properties.
export function mountForms(toolbarRoot: HTMLElement, overlaysRoot: HTMLElement, actions: FormsActions) {
  return (model: FormsModel) => {
    render(<Toolbar {...model.toolbar} />, toolbarRoot)
    render(<>
      <Inspector ticket={model.ticket} config={model.toolbar.config} tickets={model.tickets}
        readOnly={model.toolbar.readOnly} onPatch={actions.patch} onClose={actions.closeInspector}
        onNavigate={actions.navigate} onDelete={actions.remove} />
      {model.composer && <Composer key={model.composerKey} position={model.composer} readOnly={model.toolbar.readOnly}
        onCreate={actions.create} onClose={() => actions.closeComposer(model.composer!)} />}
      <FeedbackMessage feedback={model.feedback} />
    </>, overlaysRoot)
  }
}
