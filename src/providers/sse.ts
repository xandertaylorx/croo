/** Yield the payload of each SSE `data:` line from a fetch Response. */
export async function* sseData(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new Error('Response has no body.')
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '')
      buf = buf.slice(nl + 1)
      if (line.startsWith('data:')) yield line.slice(5).trim()
    }
  }
  const last = buf.trim()
  if (last.startsWith('data:')) yield last.slice(5).trim()
}

export async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 600)
    throw new Error(`API error ${res.status} ${res.statusText}: ${text}`)
  }
  return res
}

export function parseArgs(raw: string): Record<string, any> {
  if (!raw.trim()) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
