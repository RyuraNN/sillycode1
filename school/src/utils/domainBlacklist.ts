const BLACKLISTED_DOMAINS = [
  'sillytarven.top',
]

export function isBlacklistedDomain(): boolean {
  const host = window.location.hostname
  let parentHost = ''
  if (window.self !== window.top && document.referrer) {
    try { parentHost = new URL(document.referrer).hostname } catch {}
  }
  return BLACKLISTED_DOMAINS.some(d =>
    host === d || host.endsWith('.' + d) ||
    parentHost === d || parentHost.endsWith('.' + d)
  )
}
