import { describe, expect, it } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { UpdateProgress } from '../src/shared/ipc.js'
import { download } from '../src/main/updates.js'

describe('update download', () => {
  it('streams to disk and reports progress up to the full size', async () => {
    const data = Buffer.alloc(3 * 1024 * 1024, 7)
    const server = http.createServer(async (_req, res) => {
      res.writeHead(200, { 'content-length': String(data.length) })
      // Send in slices with pauses so more than one progress step is seen.
      for (let i = 0; i < data.length; i += 512 * 1024) {
        res.write(data.subarray(i, i + 512 * 1024))
        await new Promise((r) => setTimeout(r, 40))
      }
      res.end()
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'croo-dl-')), 'u.zip')
    const seen: UpdateProgress[] = []
    try {
      await download(`http://127.0.0.1:${(server.address() as AddressInfo).port}/u.zip`, dest, (p) => seen.push(p))
    } finally {
      server.close()
    }
    expect(fs.statSync(dest).size).toBe(data.length)
    expect(seen.length).toBeGreaterThan(1)
    expect(seen.every((p) => p.phase === 'download' && p.total === data.length)).toBe(true)
    expect(seen.at(-1)).toEqual({ phase: 'download', received: data.length, total: data.length })
  })
})
