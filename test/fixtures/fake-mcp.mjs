// A tiny stdio MCP server for tests: tools "echo" (read-only), "fail", and "slow".
import readline from 'node:readline'
const rl = readline.createInterface({ input: process.stdin })
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n')
console.log('a log line that is not JSON-RPC')
rl.on('line', (line) => {
  const m = JSON.parse(line)
  if (m.method === 'initialize') send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } } })
  else if (m.method === 'tools/list' && !m.params?.cursor)
    send({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'echo', description: 'Echo text', inputSchema: { $schema: 'x', type: 'object', properties: { text: { type: 'string' } }, additionalProperties: false }, annotations: { readOnlyHint: true } }], nextCursor: 'p2' } })
  else if (m.method === 'tools/list') send({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'fail', inputSchema: { type: 'object' } }, { name: 'slow', inputSchema: { type: 'object' } }] } })
  else if (m.method === 'tools/call') {
    const { name, arguments: a } = m.params
    if (name === 'echo') send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: `echo: ${a.text}` }, { type: 'image', data: 'AAAA', mimeType: 'image/png' }] } })
    else if (name === 'fail') send({ jsonrpc: '2.0', id: m.id, result: { isError: true, content: [{ type: 'text', text: 'it broke' }] } })
    // slow never answers
  } else if (m.id !== undefined && m.method) send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'nope' } })
})
