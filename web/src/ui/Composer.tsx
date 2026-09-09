import { useLayoutEffect, useRef, useState } from 'preact/hooks'

export interface ComposerPosition { x: number; y: number; sceneX: number; sceneY: number; board: string; generation: number }
export interface ComposerProps {
  position: ComposerPosition; readOnly: boolean
  onCreate(title: string, position: ComposerPosition): Promise<unknown>; onClose(): void
}
export function Composer({ position, readOnly, onCreate, onClose }: ComposerProps) {
  const [title, setTitle] = useState(''), [pending, setPending] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => { input.current?.focus() }, [])
  async function submit() {
    if (pending || readOnly) return
    if (!title.trim()) { onClose(); return }
    setPending(true)
    try { await onCreate(title.trim(), position); onClose() }
    catch { /* The application reports errors; retain the draft for correction. */ }
    finally { setPending(false) }
  }
  return <div id="composer" style={{ left: position.x, top: position.y }}>
    <input id="composerInput" ref={input} placeholder="Title, then Enter" autoComplete="off" value={title}
      disabled={readOnly} readOnly={pending} onInput={e => setTitle(e.currentTarget.value)}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose() }
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void submit() }
      }} />
    <span class="muted">{pending ? 'Filing ticket...' : 'Enter to file as draft · Esc to cancel'}</span>
  </div>
}
