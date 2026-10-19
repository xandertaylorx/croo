import { describe, expect, it } from 'vitest'
import { Permissions } from '../src/permissions.js'

describe('Permissions', () => {
  it('lets read-only tools run freely', () => {
    const p = new Permissions()
    for (const t of ['read_file', 'list_files', 'grep']) expect(p.needsApproval(t)).toBe(false)
  })
  it('asks for write and exec tools', () => {
    const p = new Permissions()
    for (const t of ['write_file', 'edit_file', 'bash']) expect(p.needsApproval(t)).toBe(true)
  })
  it('"always" is remembered per tool', () => {
    const p = new Permissions()
    p.allowAlways('bash')
    expect(p.needsApproval('bash')).toBe(false)
    expect(p.needsApproval('edit_file')).toBe(true)
  })
  it('yolo skips every prompt', () => {
    expect(new Permissions(true).needsApproval('bash')).toBe(false)
  })
})
