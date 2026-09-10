import type { SampleControl } from './committedSampling'

/** Registrations refer to the actual frame owner, not an inferred selector. */
export class ControlMeasurements {
  private registrations = new Map<string, { element: HTMLButtonElement; frame: HTMLDivElement; owner: symbol; origin: () => { x: number; y: number } }>()
  register(id: string, element: HTMLButtonElement, frame: HTMLDivElement, origin: () => { x: number; y: number }): () => void {
    const registration = { element, frame, origin, owner: Symbol(id) }
    this.registrations.set(id, registration)
    return () => { if (this.registrations.get(id) === registration) this.registrations.delete(id) }
  }
  sample(): SampleControl[] {
    return [...this.registrations].map(([id, { element, frame, owner, origin }]) => {
      const point = origin()
      return { id, owner, connected: element.isConnected && frame.isConnected && element.offsetParent === frame,
        rect: { x: point.x + frame.clientLeft + element.offsetLeft, y: point.y + frame.clientTop + element.offsetTop,
          w: element.offsetWidth, h: element.offsetHeight } }
    })
  }
  clear(): void { this.registrations.clear() }
}
