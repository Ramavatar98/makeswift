import { Viewport } from 'csstype'

import {
  ResponsiveValue as PropControllerResponsiveValue,
  DeviceOverride as PropControllerDeviceOverride,
  Device as DeviceId,
} from '../../prop-controllers'
import shallowMerge from '../../utils/shallowMerge'
import { Action, ActionTypes } from '../actions'

export type DeviceOverride<T> = PropControllerDeviceOverride<T>
export type ResponsiveValue<T> = PropControllerResponsiveValue<T>
export type BreakpointId = DeviceId

export type Breakpoint = {
  id: BreakpointId
  label: string
  viewportWidth?: number
  minWidth?: number
  maxWidth?: number
}

export type Breakpoints = Breakpoint[]

export type State = Breakpoints

export const DEFAULT_BREAKPOINT_ID_DESKTOP = 'desktop'
export const DEFAULT_BREAKPOINT_ID_TABLET = 'tablet'
export const DEFAULT_BREAKPOINT_ID_MOBILE = 'mobile'

export const DEFAULT_BREAKPOINTS: Breakpoints = [
  {
    id: DEFAULT_BREAKPOINT_ID_DESKTOP,
    label: 'Desktop',
    minWidth: 769,
  },
  {
    id: DEFAULT_BREAKPOINT_ID_TABLET,
    label: 'Tablet',
    minWidth: 576,
    maxWidth: 768,
    viewportWidth: 760,
  },
  {
    id: DEFAULT_BREAKPOINT_ID_MOBILE,
    label: 'Mobile',
    maxWidth: 575,
    viewportWidth: 390,
  },
]

export function getInitialState(): State {
  return DEFAULT_BREAKPOINTS
}

export function reducer(state: State = getInitialState(), action: Action): State {
  switch (action.type) {
    case ActionTypes.SET_BREAKPOINTS: {
      const breakpoints = action.payload.breakpoints

      if (breakpoints.length === 0) throw new Error('Breakpoints cannot be empty.')

      return breakpoints
    }

    default:
      return state
  }
}

export type BreakpointsInput = Record<
  string,
  { label?: string; min?: number; max?: number; viewport?: number }
>

export function parseBreakpointsInput(input: BreakpointsInput): Breakpoints {
  const breakpoints = Object.entries(input).map(([id, { label, min, max, viewport }]) => ({
    id,
    label: label ?? id,
    minWidth: min,
    maxWidth: max,
    viewportWidth: viewport,
  }))

  return sortBreakpoints(breakpoints)
}

// Sort breakpoints by minWidth in descending order
function sortBreakpoints(breakpoints: Breakpoints): Breakpoints {
  return breakpoints.sort((a, b) => (b?.minWidth ?? 0) - (a?.minWidth ?? 0))
}

export const getBreakpoint = (state: State, breakpointId: Breakpoint['id']): Breakpoint => {
  const breakpoint = state.find(({ id }) => id === breakpointId)

  if (breakpoint == null) throw new Error(`Unrecognized breakpoint ID: "${breakpointId}".`)

  return breakpoint
}

export const getBaseBreakpoint = (breakpoints: Breakpoints): Breakpoint => {
  const breakpoint = sortBreakpoints(breakpoints)[0]

  if (breakpoint == null) throw new Error(`Cannot get base breakpoint.`)

  return breakpoint
}

export function findBreakpointOverride<S>(
  breakpoints: Breakpoints,
  values: ResponsiveValue<S> = [],
  deviceId: string,
  strategy: FallbackStrategy<S> = defaultStrategy,
): DeviceOverride<S> | undefined {
  const value = values.find(({ deviceId: d }) => d === deviceId)
  const fallbacks = breakpoints
    .slice(0, breakpoints.findIndex(d => d.id === deviceId) + 1)
    .reverse()
    .map(d => values.find(v => v.deviceId === d.id))
    .filter((override): override is DeviceOverride<S> => Boolean(override))

  return value != null || fallbacks.length > 0 ? strategy(value, fallbacks) : undefined
}

export type FallbackStrategy<V> = (
  arg0: DeviceOverride<V> | undefined,
  arg1: ResponsiveValue<V>,
) => DeviceOverride<V> | undefined

function defaultStrategy<V>(
  value: DeviceOverride<V> | undefined,
  fallbacks: ResponsiveValue<V>,
): DeviceOverride<V> | undefined {
  return value || fallbacks[0]
}

export function shallowMergeFallbacks<V extends Record<string, unknown>>(
  value: DeviceOverride<V> | undefined,
  fallbacks: ResponsiveValue<V>,
): DeviceOverride<V> | undefined {
  return [value, ...fallbacks]
    .filter((override): override is DeviceOverride<V> => Boolean(override))
    .reduce((a, b) => ({
      deviceId: a.deviceId || b.deviceId,
      value: shallowMerge(a.value, b.value),
    }))
}

export type ExtractResponsiveValue<T> = T extends ResponsiveValue<infer V> ? V : never

export function join<V, A extends ReadonlyArray<ResponsiveValue<V> | null | undefined>, R>(
  breakpoints: Breakpoints,
  responsiveValues: A,
  joinFn: (values: { [I in keyof A]: ExtractResponsiveValue<A[I]> | undefined }) => R,
  strategy?: FallbackStrategy<V>,
): ResponsiveValue<R> {
  return breakpoints
    .map(({ id }) => id)
    .map(deviceId => {
      const value = joinFn(
        responsiveValues.map(responsiveValue => {
          const deviceValue =
            responsiveValue &&
            findBreakpointOverride(breakpoints, responsiveValue, deviceId, strategy)

          return deviceValue == null ? undefined : deviceValue.value
        }) as unknown as { [I in keyof A]: ExtractResponsiveValue<A[I] | undefined> },
      )

      if (value == null) return null

      return { deviceId, value }
    })
    .filter((override): override is DeviceOverride<R> => Boolean(override))
}

export const getBreakpointMediaQuery = (breakpoint: Breakpoint): string => {
  const parts = ['@media only screen']

  if (breakpoint.minWidth != null) {
    parts.push(`(min-width: ${breakpoint.minWidth}px)`)
  }

  if (breakpoint.maxWidth != null) {
    parts.push(`(max-width: ${breakpoint.maxWidth}px)`)
  }

  return parts.join(' and ')
}

export const getViewportStyle = (
  state: State,
  deviceId: string,
): Viewport<string | number> | null | undefined => {
  const device = getBreakpoint(state, deviceId)

  return (
    device && {
      width: device.viewportWidth != null ? device.viewportWidth : '100%',
      minWidth: device.minWidth,
    }
  )
}

export function findNextFallback<V>(
  breakpoints: Breakpoints,
  value: ResponsiveValue<V>,
  deviceId: BreakpointId,
  activeDeviceId: BreakpointId,
  fallbackStrategy?: FallbackStrategy<V>,
): Breakpoint | null {
  const deviceOverride = findBreakpointOverride(
    breakpoints,
    value.filter(v => v.deviceId !== activeDeviceId),
    deviceId,
    fallbackStrategy,
  )

  return (deviceOverride && getBreakpoint(breakpoints, deviceOverride.deviceId)) ?? null
}

export const mergeResponsiveValues = <A>(
  breakpoints: Breakpoints,
  source: DeviceOverride<A>[],
  override: DeviceOverride<A>[],
): DeviceOverride<A>[] => {
  const devices = [
    ...new Set(
      source.map(({ deviceId }) => deviceId).concat(override.map(({ deviceId }) => deviceId)),
    ),
  ]

  return devices.map(deviceId => ({
    deviceId,
    value: {
      ...(findBreakpointOverride(breakpoints, source, deviceId) || { value: {} }).value,
      ...(findBreakpointOverride(breakpoints, override, deviceId, v => v) || { value: {} }).value,
    },
  })) as DeviceOverride<A>[]
}
