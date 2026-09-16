import { useEffect, useRef } from 'preact/hooks'
import type { DisplayChoices, ToolbarScale } from '../platform/canvas/viewport'
import type { Display } from './useDisplay'

export interface DisplayDialogProps {
  display: Display
  onClose(): void
}

interface Choice<K extends keyof DisplayChoices> {
  key: K
  title: string
  /** Why this setting exists, in the terms somebody would complain in. */
  hint: string
  options: { value: DisplayChoices[K]; label: string }[]
}

const CHOICES: [Choice<'density'>, Choice<'inspector'>, Choice<'targets'>] = [
  {
    key: 'density',
    title: 'Cards',
    hint: 'Compact drops the rows that identify a ticket you have already found and keeps the ones you scan a board with.',
    options: [{ value: 'full', label: 'Full' }, { value: 'compact', label: 'Compact' }],
  },
  {
    key: 'inspector',
    title: 'Ticket panel',
    hint: 'Beside the board needs a board left over to sit beside. On a taller-than-wide window a side panel leaves a sliver.',
    options: [{ value: 'beside', label: 'Beside the board' }, { value: 'bottom', label: 'Along the bottom' },
      { value: 'over', label: 'Over the board' }],
  },
  {
    key: 'targets',
    title: 'Targets',
    hint: 'The drag handles and the card controls are sized for a mouse. A finger needs more.',
    options: [{ value: 'fine', label: 'Sized for a mouse' }, { value: 'coarse', label: 'Sized for a finger' }],
  },
]

const TOOLBAR_SIZES: { value: ToolbarScale; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'large', label: 'Large' },
  { value: 'larger', label: 'Larger' },
]

function labelOf<K extends keyof DisplayChoices>(choice: Choice<K>, value: DisplayChoices[K]): string {
  return choice.options.find(option => option.value === value)?.label ?? String(value)
}

/**
 * What the canvas chose from the shape of this window, and how to disagree.
 *
 * Separate from the account dialog deliberately. That one exists only where
 * somebody signed in, and a canvas on a desk needs this just as much. It is
 * also a different question: the account dialog answers who you are here, this
 * one answers what this window looks like, and only the second is about the
 * browser rather than the person.
 */
export function DisplayDialog({ display, onClose }: DisplayDialogProps) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => { close.current?.focus() }, [])
  const overridden = Object.keys(display.overrides).length

  return <div id="displayDialog" class="session-dialog" role="dialog" aria-modal="true" aria-label="Display"
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
    <div class="session-head">
      <div>
        <strong>Display</strong>
        {/* The measurement the choices were made from. Without it the answers
          * are assertions, and somebody who disagrees has nothing to argue
          * with. */}
        <span class="session-email display-facts">{display.facts.width} × {display.facts.height}
          {display.facts.coarse ? ', touch' : ', mouse'}</span>
      </div>
      <button type="button" class="tool" id="displayClose" ref={close} onClick={onClose}>Close</button>
    </div>

    <section class="session-section">
      <p class="session-hint">Chosen from the size and shape of this window. Every one of them can be
        set by hand, and what you set stays in this browser: nobody else reading this board sees it.</p>
      {CHOICES.map(choice => {
        const automatic = display.automatic[choice.key]
        const held = display.overrides[choice.key]
        return <div key={choice.key} class="display-choice" data-setting={choice.key}>
          <label for={`display-${choice.key}`}>{choice.title}</label>
          <select id={`display-${choice.key}`} class="tool" value={held ?? ''}
            onChange={event => display.choose(choice.key,
              (event.currentTarget.value || null) as never)}>
            <option value="">Automatic — {labelOf(choice, automatic)}</option>
            {choice.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <p class="session-hint display-hint">{choice.hint}</p>
        </div>
      })}
    </section>

    {/* Its own section, not a fourth row above, because it is a different kind
      * of setting: nothing about a window suggests an answer, so it has a
      * default rather than an automatic choice and says so. */}
    <section class="session-section">
      <h2>Toolbar</h2>
      <p class="session-hint">Nothing about a window says how big this row should be &mdash; a 27-inch
        screen and a 24-inch one report the same width &mdash; so this is yours to set. It changes the
        header bar only: the board, the cards and the ticket panel keep their own sizes.</p>
      <div class="display-scale" role="group" aria-label="Toolbar size">
        {TOOLBAR_SIZES.map(size => <button key={size.value} type="button" class="tool"
          id={`display-toolbar-${size.value}`} aria-pressed={display.toolbar === size.value}
          onClick={() => display.chooseToolbar(size.value)}>{size.label}</button>)}
      </div>
    </section>

    <section class="session-section">
      <button type="button" class="tool" id="displayReset" disabled={!overridden}
        onClick={() => display.reset()}>
        {overridden ? `Use automatic for all ${overridden === 1 ? '(1 set by hand)' : `(${overridden} set by hand)`}` : 'All automatic'}
      </button>
    </section>
  </div>
}
