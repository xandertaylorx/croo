import { afterAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { McpManager, mcpToolName, parseMcpJson, renderContent, splitCommand } from '../src/mcp.js'
import { Permissions } from '../src/permissions.js'
import { runTurn } from '../src/agent.js'
import { geminiSchema } from '../src/providers/gemini.js'
import type { ChatRequest, Msg, Provider } from '../src/types.js'

const fake = path.resolve('test/fixtures/fake-mcp.mjs')

/** Wait until every server has finished connecting. */
async function ready(m: McpManager) {
  for (let i = 0; i < 100; i++) {
    if ([...m.servers.values()].every((s) => s.status !== 'connecting')) return
    await new Promise((r) => setTimeout(r, 30))
  }
}

const managers: McpManager[] = []
const manager = () => {
  const m = new McpManager(() => {}, 'test')
  managers.push(m)
  return m
}
afterAll(() => managers.forEach((m) => m.stopAll()))

describe('MCP over stdio', () => {
  it('connects, pages through tools and calls them', async () => {
    const m = manager()
    m.configure({ fake: { command: process.execPath, args: [fake] } })
    await ready(m)
    const s = m.servers.get('fake')!
    expect(s.status).toBe('ready')
    expect(s.serverName).toBe('fake')
    const tools = m.tools()
    expect(tools.map((t) => t.spec.name)).toEqual(['mcp__fake__echo', 'mcp__fake__fail', 'mcp__fake__slow'])
    const echo = tools[0]
    expect(echo.spec.parameters.$schema).toBeUndefined()
    expect(echo.spec.description).toContain('"fake" MCP server')
    expect(await echo.run({ text: 'hi' }, { cwd: '.' })).toBe('echo: hi\n[image: image/png, 3 bytes]')
    await expect(tools[1].run({}, { cwd: '.' })).rejects.toThrow('it broke')
    expect(m.readOnly('mcp__fake__echo')).toBe(true)
    expect(m.readOnly('mcp__fake__fail')).toBe(false)
  })

  it('cancels a call when the turn is stopped', async () => {
    const m = manager()
    m.configure({ fake: { command: process.execPath, args: [fake] } })
    await ready(m)
    const ac = new AbortController()
    const p = m.tools().find((t) => t.spec.name === 'mcp__fake__slow')!.run({}, { cwd: '.', signal: ac.signal })
    setTimeout(() => ac.abort(), 50)
    await expect(p).rejects.toThrow('Cancelled')
  })

  it('reports a server that fails to start', async () => {
    const m = manager()
    m.configure({ bad: { command: 'definitely-not-a-command-croo' } })
    await ready(m)
    expect(m.servers.get('bad')!.status).toBe('error')
    expect(m.servers.get('bad')!.error).toMatch(/Could not start|exited/)
    expect(m.tools()).toEqual([])
  })

  it('leaves disabled servers off and drops removed ones', async () => {
    const m = manager()
    m.configure({ fake: { command: process.execPath, args: [fake], disabled: true } })
    await ready(m)
    expect(m.servers.get('fake')!.status).toBe('off')
    m.configure({})
    expect(m.servers.size).toBe(0)
  })

  it('lets read-only MCP tools run unasked in Auto mode, and asks for the rest', async () => {
    const m = manager()
    m.configure({ fake: { command: process.execPath, args: [fake] } })
    await ready(m)
    const p = new Permissions('auto', (t) => m.readOnly(t))
    expect(p.needsApproval('mcp__fake__echo')).toBe(false)
    expect(p.needsApproval('mcp__fake__fail')).toBe(true)

    // And the agent can call it.
    let n = 0
    const provider: Provider = {
      async chat(req: ChatRequest) {
        n++
        if (n === 1) {
          expect(req.tools.some((t) => t.name === 'mcp__fake__echo')).toBe(true)
          return { text: '', toolCalls: [{ id: '1', name: 'mcp__fake__echo', args: { text: 'yo' } }], usage: { input: 1, output: 1 } }
        }
        return { text: 'done', toolCalls: [], usage: { input: 1, output: 1 } }
      },
    }
    const messages: Msg[] = [{ role: 'user', content: 'go' }]
    const hooks = { onThinking() {}, onText() {}, onTextEnd() {}, onToolRunning() {}, onToolDone() {}, confirm: async () => 'n' as const, onUsage() {} }
    await runTurn({ provider, system: '', messages, cwd: '.', permissions: p, hooks, signal: new AbortController().signal, tools: m.tools() })
    expect(messages[2]).toMatchObject({ role: 'tool', content: expect.stringContaining('echo: yo') })
  })
})

describe('MCP over HTTP', () => {
  let server: http.Server
  let url = ''
  const seen: { session?: string; method: string }[] = []
  afterAll(() => server?.close())

  it('handles JSON and event-stream replies and keeps the session', async () => {
    server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (d) => (body += d))
      req.on('end', () => {
        const m = JSON.parse(body)
        seen.push({ session: req.headers['mcp-session-id'] as string | undefined, method: m.method })
        if (req.headers.authorization !== 'Bearer t0k') return res.writeHead(401).end('no')
        if (m.id === undefined) return res.writeHead(202).end()
        if (m.method === 'initialize') {
          res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'S1' })
          return res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { serverInfo: { name: 'remote' } } }))
        }
        // Reply as an event stream with a notification first.
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: {} })}\n\n`)
        const result = m.method === 'tools/list' ? { tools: [{ name: 'search docs', inputSchema: { type: 'object' } }] } : { content: [{ type: 'text', text: `found ${m.params.arguments.q}` }] }
        res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: m.id, result })}\n\n`)
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`

    const m = manager()
    m.configure({ remote: { url, headers: { Authorization: 'Bearer t0k' } } })
    await ready(m)
    expect(m.servers.get('remote')!.status).toBe('ready')
    const [tool] = m.tools()
    expect(tool.spec.name).toBe('mcp__remote__search_docs')
    expect(await tool.run({ q: 'x' }, { cwd: '.' })).toBe('found x')
    expect(seen.slice(1).every((s) => s.session === 'S1')).toBe(true)

    const noAuth = manager()
    noAuth.configure({ remote: { url } })
    await ready(noAuth)
    expect(noAuth.servers.get('remote')!.error).toMatch(/401.*authorization/)
  })
})

describe('MCP config parsing', () => {
  it('reads the common formats', () => {
    expect(parseMcpJson('{"mcpServers": {"gh": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": {"T": 1}}}}')).toEqual({
      gh: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { T: '1' }, cwd: undefined, disabled: undefined },
    })
    expect(Object.keys(parseMcpJson('{"servers": {"a": {"type": "http", "url": "https://x.dev/mcp"}}}'))).toEqual(['a'])
    expect(parseMcpJson('npx -y @modelcontextprotocol/server-filesystem "/My Docs"')).toEqual({
      filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/My Docs'], env: undefined, cwd: undefined, disabled: undefined },
    })
    expect(Object.keys(parseMcpJson('https://mcp.linear.app/mcp'))).toEqual(['linear'])
    expect(Object.keys(parseMcpJson('{"command": "uvx mcp-server-git"}', 'my git'))).toEqual(['my-git'])
    expect(Object.keys(parseMcpJson('{"a": {"command": "x"}, "b": {"url": "http://localhost:3000/mcp"}}'))).toEqual(['a', 'b'])
    expect(() => parseMcpJson('{"nope": 1}')).toThrow(/Could not find/)
    expect(() => parseMcpJson('{bad')).toThrow(/not valid JSON/)
  })

  it('splits commands and names tools safely', () => {
    expect(splitCommand(`node "a b.js" --x='1 2' c`)).toEqual(['node', 'a b.js', "--x='1", "2'", 'c'])
    expect(mcpToolName('my.server', 'do thing')).toBe('mcp__my_server__do_thing')
    expect(mcpToolName('s', 'x'.repeat(100))).toHaveLength(64)
    expect(renderContent({ content: [], structuredContent: { a: 1 } })).toBe('{\n  "a": 1\n}')
  })

  it('trims schemas to what Gemini accepts', () => {
    expect(
      geminiSchema({ $schema: 'x', type: 'object', additionalProperties: false, properties: { a: { type: ['string', 'null'], default: 'q' }, b: { type: 'array', items: { type: 'object', $ref: '#' } } } }),
    ).toEqual({ type: 'object', properties: { a: { type: 'string', nullable: true }, b: { type: 'array', items: { type: 'object', properties: {} } } } })
  })
})
