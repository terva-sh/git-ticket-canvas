// Compile-only contracts for the toolchain, not components mounted in the MVP.
export function TypedLabel(props: { text: string }) {
  return <span>{props.text}</span>
}

export const valid = <TypedLabel text="Preact JSX is configured" />
// @ts-expect-error Component props must remain type checked.
export const invalidProp = <TypedLabel text={42} />
// @ts-expect-error strictNullChecks must remain enabled.
export const invalidNull: string = null
