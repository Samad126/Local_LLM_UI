import { describe, expect, it } from 'vitest'
import { isPrivateAddress } from './ssrf'

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '192.168.0.1',
    '172.16.0.1',
    '172.31.255.1',
    '169.254.1.1',
    '0.0.0.0',
    '100.64.0.1',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
  ])('private: %s', (ip) => expect(isPrivateAddress(ip)).toBe(true))
  it.each(['8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111', '::ffff:8.8.8.8'])('public: %s', (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  )
})
