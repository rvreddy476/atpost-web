const moduleHomes = [
  '/shop', '/admin', '/match', '/social', '/community', '/creator',
  '/messenger', '/live', '/memories', '/apps',
] as const

export function moduleHome(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'
  return moduleHomes.find((home) => value === home || value.startsWith(`${home}/`) || value.startsWith(`${home}?`)) ?? '/'
}
