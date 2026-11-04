import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

/** True for loopback, private, link-local, CGNAT, unspecified and IPv4-mapped IPv6 addresses. */
export function isPrivateAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  if (mapped) return isPrivateAddress(mapped[1])
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    )
  }
  const v6 = ip.toLowerCase()
  return v6 === '::1' || v6 === '::' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)
}

/** Throws unless the URL is http(s) and every address its host resolves to is public. */
export async function assertPublicUrl(u: URL): Promise<void> {
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address)
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new Error('Refusing to fetch private address')
}
