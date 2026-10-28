import type { GitStatus } from '../shared/ipc.js'

export type QuickKind = 'commit' | 'commit-push' | 'push' | 'pull' | 'publish' | 'create-pr' | 'none'

export interface Quick {
  kind: QuickKind
  label: string
  tip: string
}

/** The one thing the main button does for this repository state. */
export function quickAction(s: GitStatus | null): Quick | null {
  if (!s?.repo) return null
  const remote = s.remotes.length > 0
  if (s.files.length) {
    if (remote && s.behind > 0) return { kind: 'commit', label: 'Commit', tip: 'Commit everything. The remote has newer commits, so pull before pushing.' }
    return remote
      ? { kind: 'commit-push', label: 'Commit & push', tip: `Commit everything with a message written by AI, then push${s.upstream ? ` to ${s.upstream}` : ''}` }
      : { kind: 'commit', label: 'Commit', tip: 'Commit everything with a message written by AI' }
  }
  if (s.behind > 0 && s.ahead > 0) return { kind: 'none', label: 'Diverged', tip: 'Your branch and the remote both have new commits. Rebase or merge in the terminal.' }
  if (s.behind > 0) return { kind: 'pull', label: 'Pull', tip: `Pull ${s.behind} commit${s.behind === 1 ? '' : 's'} from ${s.upstream}` }
  if (!remote && s.hasCommits) return { kind: 'publish', label: 'Publish', tip: 'Connect this folder to GitHub' }
  if (remote && s.hasCommits && (!s.upstream || s.ahead > 0)) return { kind: 'push', label: 'Push', tip: s.upstream ? `Push ${s.ahead} commit${s.ahead === 1 ? '' : 's'} to ${s.upstream}` : 'Publish this branch' }
  if (remote && s.gh && s.defaultBranch && s.branch !== s.defaultBranch) return { kind: 'create-pr', label: 'Create PR', tip: `Open a pull request from ${s.branch} into ${s.defaultBranch}` }
  return { kind: 'none', label: 'Commit', tip: 'Nothing to commit or push' }
}

/** Lines added and removed across the changed files. */
export const totals = (s: GitStatus) => s.files.reduce((t, f) => ({ add: t.add + (f.add ?? 0), del: t.del + (f.del ?? 0) }), { add: 0, del: 0 })
