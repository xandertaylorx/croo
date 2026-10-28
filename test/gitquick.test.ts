import { describe, expect, it } from 'vitest'
import { quickAction, totals } from '../src/renderer/gitquick.js'
import type { GitFile, GitStatus } from '../src/shared/ipc.js'

const file = (path: string, add?: number, del?: number): GitFile => ({ path, index: ' ', work: 'M', add, del })
const repo = (over: Partial<GitStatus> = {}): GitStatus => ({ repo: true, branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0, files: [], remotes: ['origin'], gh: false, defaultBranch: 'main', hasCommits: true, ...over })

describe('the header git button', () => {
  it('is hidden outside a repository', () => {
    expect(quickAction(null)).toBeNull()
    expect(quickAction(repo({ repo: false }))).toBeNull()
  })
  it('commits and pushes changes when there is a remote', () => {
    expect(quickAction(repo({ files: [file('a.ts')] }))?.kind).toBe('commit-push')
    expect(quickAction(repo({ files: [file('a.ts')], remotes: [] }))?.kind).toBe('commit')
  })
  it('only commits when the remote is ahead, so the push cannot be rejected', () => {
    expect(quickAction(repo({ files: [file('a.ts')], behind: 2 }))?.kind).toBe('commit')
  })
  it('pulls, pushes or publishes when there is nothing to commit', () => {
    expect(quickAction(repo({ behind: 3 }))?.kind).toBe('pull')
    expect(quickAction(repo({ ahead: 1 }))?.kind).toBe('push')
    expect(quickAction(repo({ upstream: undefined }))?.kind).toBe('push')
    expect(quickAction(repo({ remotes: [], upstream: undefined }))?.kind).toBe('publish')
    expect(quickAction(repo({ ahead: 1, behind: 1 }))?.kind).toBe('none')
  })
  it('offers a pull request from a pushed feature branch', () => {
    expect(quickAction(repo({ branch: 'feat', upstream: 'origin/feat', gh: true }))?.kind).toBe('create-pr')
    expect(quickAction(repo({ branch: 'feat', upstream: 'origin/feat', gh: false }))?.kind).toBe('none')
    expect(quickAction(repo({ gh: true }))?.kind).toBe('none')
  })
  it('does nothing in a repository without commits or changes', () => {
    expect(quickAction(repo({ hasCommits: false, remotes: [], upstream: undefined }))?.kind).toBe('none')
  })
  it('adds up lines across files, counting unknown as zero', () => {
    expect(totals(repo({ files: [file('a', 3, 1), file('b', 10), file('c')] }))).toEqual({ add: 13, del: 1 })
  })
})
