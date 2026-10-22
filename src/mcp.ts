import { spawn, type ChildProcess } from 'node:child_process'
import type { McpServerConfig } from './types.js'
import type { Tool } from './tools/index.js'
import { truncate } from './tools/index.js'

/**
 * A small Model Context Protocol client: stdio servers (a command Croo starts) and remote servers over
 * Streamable HTTP. It speaks just what a coding agent needs: initialize, list tools, call tools, ping.
 * https://modelcontextprotocol.io/specification
 */

const PROTOCOL = '2025-06-18'
const INIT_TIMEOUT = 30_000
const CALL_TIMEOUT = 10 * 60_000

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, any>
  annotations?: { readOnlyHint?: boolean; title?: string }
}

interface Rpc {
  request(method: string, params?: unknown, signal?: AbortSignal, timeout?: number): Promise<any>
  notify(method: string, params?: unknown): Promise<void>
  close(): void
}

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void }

/** Answer requests a server sends us. We declare no client capabilities, so only ping is expected. */
const answerServer = (msg: any) => (msg.method === 'ping' ? { jsonrpc: '2.0', id: msg.id, result: {} } : { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } })

function withTimeout<T>(p: Promise<T>, ms: number, what: string, signal?: AbortSignal, onAbort?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => (onAbort?.(), reject(new Error(`${what} timed out after ${Math.round(ms / 1000)}s`))), ms)
    const abort = () => (clearTimeout(timer), onAbort?.(), reject(new Error('Cancelled')))
    if (signal?.aborted) return abort()
    signal?.addEventListener('abort', abort, { once: true })
    p.then(
      (v) => (clearTimeout(timer), signal?.removeEventListener('abort', abort), resolve(v)),
      (e) => (clearTimeout(timer), signal?.removeEventListener('abort', abort), reject(e)),
    )
  })
}

/** Newline-delimited JSON-RPC over a child process's stdin/stdout. */
function stdioRpc(cfg: McpServerConfig, onExit: (why: string) => void): Rpc {
  const child: ChildProcess = spawn(cfg.command!, cfg.args ?? [], {
    env: { ...process.env, ...(cfg.env ?? {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: cfg.cwd,
  })
  const pending = new Map<number, Pending>()
  let nextId = 1
  let buf = ''
  let stderr = ''
  let closed = false
  const fail = (why: string) => {
    if (closed) return
    closed = true
    for (const p of pending.values()) p.reject(new Error(why))
    pending.clear()
    onExit(why)
  }
  const write = (msg: unknown) => {
    if (closed || !child.stdin?.writable) throw new Error('The server is not running.')
    child.stdin.write(JSON.stringify(msg) + '\n')
  }
  child.stdout!.on('data', (d: Buffer) => {
    buf += d.toString()
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      let msg: any
      try {
        msg = JSON.parse(line)
      } catch {
        continue // servers sometimes log to stdout; skip anything that isn't JSON-RPC
      }
      if (msg.method && msg.id !== undefined) {
        try {
          write(answerServer(msg))
        } catch {}
      } else if (msg.id !== undefined && pending.has(msg.id)) {
        const p = pending.get(msg.id)!
        pending.delete(msg.id)
        if (msg.error) p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
        else p.resolve(msg.result)
      }
    }
  })
  child.stderr!.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-4000)))
  child.on('error', (e) => fail(`Could not start "${cfg.command}": ${e.message}`))
  child.on('exit', (code, sig) => {
    const tail = stderr.trim().split('\n').slice(-3).join('\n')
    fail(`The server exited (${sig ?? `code ${code}`})${tail ? `: ${tail}` : ''}`)
  })
  return {
    request(method, params, signal, timeout = CALL_TIMEOUT) {
      const id = nextId++
      const p = new Promise<any>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        try {
          write({ jsonrpc: '2.0', id, method, params })
        } catch (e: any) {
          pending.delete(id)
          reject(e)
        }
      })
      return withTimeout(p, timeout, method, signal, () => {
        pending.delete(id)
        try {
          write({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id } })
        } catch {}
      })
    },
    async notify(method, params) {
      write({ jsonrpc: '2.0', method, params })
    },
    close() {
      closed = true
      for (const p of pending.values()) p.reject(new Error('Closed'))
      pending.clear()
      child.kill()
    },
  }
}

/** Streamable HTTP: each message is a POST; the reply is JSON or an event stream that carries it. */
function httpRpc(cfg: McpServerConfig): Rpc {
  let session: string | undefined
  let nextId = 1
  const controllers = new Set<AbortController>()
  const post = async (msg: any, signal?: AbortSignal) => {
    const ac = new AbortController()
    controllers.add(ac)
    const onAbort = () => ac.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await fetch(cfg.url!, {
        method: 'POST',
        signal: ac.signal,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': PROTOCOL,
          ...(session ? { 'mcp-session-id': session } : {}),
          ...(cfg.headers ?? {}),
        },
        body: JSON.stringify(msg),
      })
      session = res.headers.get('mcp-session-id') ?? session
      if (!res.ok) {
        const text = (await res.text()).slice(0, 300)
        throw new Error(`HTTP ${res.status}${res.status === 401 ? ' (the server needs authorization: add a header such as Authorization: Bearer <token>)' : ''}${text ? `: ${text}` : ''}`)
      }
      if (msg.id === undefined) return undefined
      const type = res.headers.get('content-type') ?? ''
      if (type.includes('text/event-stream')) {
        // Read events until the response to our request arrives.
        const reader = res.body!.getReader()
        const dec = new TextDecoder()
        let buf = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n')
          let sep: number
          while ((sep = buf.indexOf('\n\n')) >= 0) {
            const event = buf.slice(0, sep)
            buf = buf.slice(sep + 2)
            const data = event
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trimStart())
              .join('\n')
            if (!data) continue
            let m: any
            try {
              m = JSON.parse(data)
            } catch {
              continue
            }
            if (m.id === msg.id && (m.result !== undefined || m.error)) {
              reader.cancel().catch(() => {})
              return m
            }
          }
        }
        throw new Error('The server closed the stream without answering.')
      }
      return await res.json()
    } finally {
      signal?.removeEventListener('abort', onAbort)
      controllers.delete(ac)
    }
  }
  return {
    async request(method, params, signal, timeout = CALL_TIMEOUT) {
      const id = nextId++
      const m: any = await withTimeout(post({ jsonrpc: '2.0', id, method, params }, signal), timeout, method, signal)
      if (m?.error) throw new Error(m.error.message ?? JSON.stringify(m.error))
      return m?.result
    },
    async notify(method, params) {
      await post({ jsonrpc: '2.0', method, params })
    },
    close() {
      for (const c of controllers) c.abort()
      if (session) fetch(cfg.url!, { method: 'DELETE', headers: { 'mcp-session-id': session, ...(cfg.headers ?? {}) } }).catch(() => {})
    },
  }
}

export type McpStatus = 'off' | 'connecting' | 'ready' | 'error'

/** One configured server: its connection, state and tools. */
export class McpServer {
  status: McpStatus = 'off'
  error = ''
  tools: McpTool[] = []
  serverName = ''
  private rpc?: Rpc

  constructor(
    public name: string,
    public cfg: McpServerConfig,
    private onChange: () => void,
    private clientVersion = '0',
  ) {}

  async start() {
    this.stop()
    if (this.cfg.disabled) return
    this.status = 'connecting'
    this.error = ''
    this.onChange()
    try {
      if (!this.cfg.command && !this.cfg.url) throw new Error('Needs a "command" or a "url".')
      this.rpc = this.cfg.url ? httpRpc(this.cfg) : stdioRpc(this.cfg, (why) => this.failed(why))
      const init = await this.rpc.request('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'croo', version: this.clientVersion } }, undefined, INIT_TIMEOUT)
      this.serverName = init?.serverInfo?.name ?? ''
      await this.rpc.notify('notifications/initialized')
      const tools: McpTool[] = []
      let cursor: string | undefined
      do {
        const page = await this.rpc.request('tools/list', cursor ? { cursor } : {}, undefined, INIT_TIMEOUT)
        tools.push(...(page?.tools ?? []))
        cursor = page?.nextCursor
      } while (cursor && tools.length < 1000)
      this.tools = tools
      this.status = 'ready'
    } catch (e: any) {
      this.failed(e?.message ?? String(e))
    }
    this.onChange()
  }

  private failed(why: string) {
    if (this.status === 'off') return
    this.status = 'error'
    this.error = why
    this.tools = []
    this.rpc?.close()
    this.rpc = undefined
    this.onChange()
  }

  stop() {
    this.rpc?.close()
    this.rpc = undefined
    this.status = 'off'
    this.tools = []
  }

  async call(tool: string, args: unknown, signal?: AbortSignal): Promise<string> {
    if (!this.rpc || this.status !== 'ready') throw new Error(`MCP server "${this.name}" is not connected${this.error ? `: ${this.error}` : ''}.`)
    const res = await this.rpc.request('tools/call', { name: tool, arguments: args ?? {} }, signal)
    const text = renderContent(res)
    if (res?.isError) throw new Error(text || 'The tool reported an error.')
    return text || '(no output)'
  }
}

/** Tool results as text: the model gets text parts verbatim and a note for anything it cannot read here. */
export function renderContent(res: any): string {
  const parts: string[] = []
  for (const c of res?.content ?? []) {
    if (c?.type === 'text') parts.push(c.text)
    else if (c?.type === 'resource' && typeof c.resource?.text === 'string') parts.push(c.resource.text)
    else if (c?.type === 'resource_link') parts.push(`[resource: ${c.name ?? ''} ${c.uri ?? ''}]`)
    else if (c?.type === 'image' || c?.type === 'audio') parts.push(`[${c.type}: ${c.mimeType ?? 'unknown type'}, ${Math.round(((c.data?.length ?? 0) * 3) / 4)} bytes]`)
    else if (c) parts.push(JSON.stringify(c))
  }
  if (!parts.length && res?.structuredContent) parts.push(JSON.stringify(res.structuredContent, null, 2))
  return parts.join('\n')
}

/** Tool names must match ^[a-zA-Z0-9_-]{1,64}$ for every provider. */
export function mcpToolName(server: string, tool: string): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `mcp__${clean(server)}__${clean(tool)}`.slice(0, 64)
}

export const isMcpTool = (name: string) => name.startsWith('mcp__')

/** Every configured server. Croo's agent tools come from `tools()`. */
export class McpManager {
  servers = new Map<string, McpServer>()

  constructor(
    private onChange: () => void,
    private clientVersion = '0',
  ) {}

  /** Apply a new configuration: start new or changed servers, stop removed ones. */
  configure(all: Record<string, McpServerConfig>) {
    for (const [name, s] of this.servers) {
      if (!all[name]) {
        s.stop()
        this.servers.delete(name)
      }
    }
    for (const [name, cfg] of Object.entries(all)) {
      const cur = this.servers.get(name)
      if (cur && JSON.stringify(cur.cfg) === JSON.stringify(cfg)) continue
      cur?.stop()
      const s = new McpServer(name, cfg, this.onChange, this.clientVersion)
      this.servers.set(name, s)
      void s.start()
    }
    this.onChange()
  }

  restart(name: string) {
    void this.servers.get(name)?.start()
  }

  stopAll() {
    for (const s of this.servers.values()) s.stop()
  }

  /** Read-only tools (by the server's own hint) need no approval in Auto mode and can run in parallel. */
  readOnly(name: string): boolean {
    for (const t of this.tools()) if (t.spec.name === name) return !!(t as McpAgentTool).readOnly
    return false
  }

  tools(): McpAgentTool[] {
    const out: McpAgentTool[] = []
    const seen = new Set<string>()
    for (const s of this.servers.values()) {
      if (s.status !== 'ready') continue
      for (const t of s.tools) {
        const name = mcpToolName(s.name, t.name)
        if (seen.has(name)) continue
        seen.add(name)
        out.push(toAgentTool(s, t, name))
      }
    }
    return out
  }
}

export type McpAgentTool = Tool & { readOnly: boolean }

function toAgentTool(server: McpServer, t: McpTool, name: string): McpAgentTool {
  const schema = t.inputSchema && typeof t.inputSchema === 'object' ? { ...t.inputSchema } : {}
  delete schema.$schema
  if (schema.type !== 'object') Object.assign(schema, { type: 'object', properties: schema.properties ?? {} })
  const title = t.annotations?.title
  return {
    readOnly: !!t.annotations?.readOnlyHint,
    spec: {
      name,
      description: `${(t.description || title || t.name).slice(0, 2000)}\n(From the "${server.name}" MCP server.)`,
      parameters: schema,
    },
    summarize: (a) => {
      const s = JSON.stringify(a ?? {})
      return s === '{}' ? '' : s.length > 120 ? s.slice(0, 119) + '…' : s
    },
    prepare: (a) => ({ kind: 'read', tool: name, summary: `${server.name} · ${t.name} ${JSON.stringify(a ?? {}).slice(0, 400)}` }),
    async run(a, ctx) {
      return truncate(await server.call(t.name, a, ctx.signal))
    },
  }
}

/** Split a command line on spaces, keeping quoted parts together. */
export function splitCommand(line: string): string[] {
  const out: string[] = []
  for (const m of line.matchAll(/"((?:\\.|[^"])*)"|'([^']*)'|(\S+)/g)) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : (m[2] ?? m[3]))
  return out
}

function normalize(raw: any): McpServerConfig {
  if (!raw || typeof raw !== 'object') throw new Error('Each server needs a "command" or a "url".')
  const url = raw.url ?? raw.serverUrl
  const strMap = (o: any) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) : undefined)
  if (typeof url === 'string' && url) {
    if (!/^https?:\/\//i.test(url)) throw new Error(`"${url}" is not an http(s) URL.`)
    return { url, headers: strMap(raw.headers), disabled: raw.disabled === true || undefined }
  }
  if (typeof raw.command !== 'string' || !raw.command.trim()) throw new Error('Each server needs a "command" or a "url".')
  // "command": "npx -y pkg" without args is common; split it.
  const parts = Array.isArray(raw.args) ? [raw.command, ...raw.args.map(String)] : splitCommand(raw.command)
  return { command: parts[0], args: parts.slice(1), env: strMap(raw.env), cwd: typeof raw.cwd === 'string' ? raw.cwd : undefined, disabled: raw.disabled === true || undefined }
}

const defaultName = (c: McpServerConfig) => {
  const base = c.url ? new URL(c.url).hostname.replace(/^(www|api|mcp)\./, '').split('.')[0] : (c.args?.find((a) => !a.startsWith('-')) ?? c.command ?? 'server').split('/').pop()!
  return base.replace(/^server-|-mcp$|^mcp-/, '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 30) || 'server'
}

/**
 * What the user pasted into Settings → MCP: the usual `{"mcpServers": {...}}` JSON (Claude, Cursor), VS Code's
 * `{"servers": {...}}`, a single server object, a bare command line, or a URL.
 */
export function parseMcpJson(text: string, name?: string): Record<string, McpServerConfig> {
  const t = text.trim()
  if (!t) throw new Error('Paste a command, a URL or a JSON config.')
  const nm = name?.trim().replace(/[^a-zA-Z0-9_-]/g, '-')
  if (!t.startsWith('{')) {
    const one = normalize(/^https?:\/\//i.test(t) ? { url: t } : { command: t })
    return { [nm || defaultName(one)]: one }
  }
  let data: any
  try {
    data = JSON.parse(t)
  } catch (e: any) {
    throw new Error(`That is not valid JSON: ${e.message}`)
  }
  const group = data.mcpServers ?? data.servers ?? data.mcp?.servers
  if (group && typeof group === 'object') return Object.fromEntries(Object.entries(group).map(([k, v]) => [k.replace(/[^a-zA-Z0-9_-]/g, '-'), normalize(v)]))
  if (data.command || data.url || data.serverUrl) {
    const one = normalize(data)
    return { [nm || defaultName(one)]: one }
  }
  // { "name": { "command": ... } }
  const entries = Object.entries(data)
  if (entries.length && entries.every(([, v]: any) => v && typeof v === 'object' && (v.command || v.url || v.serverUrl))) return Object.fromEntries(entries.map(([k, v]) => [k.replace(/[^a-zA-Z0-9_-]/g, '-'), normalize(v)]))
  throw new Error('Could not find a server in that JSON. Expected {"mcpServers": {"name": {"command": ...}}}.')
}
