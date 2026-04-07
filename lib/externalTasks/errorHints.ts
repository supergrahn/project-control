export interface AdapterError {
  source: string
  message: string
  hint: string
}

function getHint(message: string): string {
  if (message.includes('401')) return 'Your API token was rejected — check it in Settings.'
  if (message.includes('403')) return 'Your token lacks required permissions — check scopes in Settings.'
  if (message.includes('404')) return 'Resource not found — check your base URL or board IDs in Settings.'
  if (message.includes('429')) return 'Rate limited by the API — wait a moment then retry.'
  if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) return 'Cannot reach the server — check your network and base URL.'
  if (message.toLowerCase().includes('auth')) return 'Authentication failed — check your credentials in Settings.'
  return 'Check your credentials and settings, then retry.'
}

export function parseAdapterErrors(errors: string[]): AdapterError[] {
  return errors.map((e) => {
    const colonIdx = e.indexOf(':')
    const source  = colonIdx > 0 ? e.slice(0, colonIdx).trim() : 'Unknown'
    const message = colonIdx > 0 ? e.slice(colonIdx + 1).trim() : e
    return { source, message, hint: getHint(message) }
  })
}
