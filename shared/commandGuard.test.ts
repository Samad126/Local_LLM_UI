import { describe, expect, it } from 'vitest'
import { isDangerous, killReason, killsApp, killTargets } from './commandGuard'

describe('killTargets', () => {
  it('skips the signal option', () => {
    expect(killTargets(' -9 1234')).toEqual([1234])
    expect(killTargets(' -TERM 1 2')).toEqual([1, 2])
    expect(killTargets(' -s KILL 55')).toEqual([55])
    expect(killTargets(' -- -77')).toEqual([-77])
    expect(killTargets(' 42')).toEqual([42])
  })
})

describe('killReason with own pids', () => {
  const self = new Set([1000, 999])
  it('allows killing an unrelated pid with a signal', () => expect(killReason('kill -9 1234', self)).toBeNull())
  it('refuses own pid, init and process-wide targets', () => {
    expect(killReason('kill 1000', self)).toMatch(/belongs to this app/)
    expect(killReason('kill -9 999', self)).toMatch(/belongs to this app/)
    expect(killReason('kill -1', self)).toBeNull() // "-1" alone is a signal flag with no target
    expect(killReason('kill -9 -1', self)).toMatch(/belongs to this app/)
    expect(killReason('kill 0', self)).toMatch(/belongs to this app/)
  })
  it('client-side check (no pids) matches the name/port rules', () => {
    expect(killsApp('pkill node')).toBe(true)
    expect(killsApp('kill 1000')).toBe(false)
  })
  it('isDangerous is exported from here too', () => expect(isDangerous('sudo x')).toBe(true))
})
