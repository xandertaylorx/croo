// Music bed plus sound effects, all placed from CONFIG. The music ducks under each effect, and every
// clip fades in and out over a few frames so nothing starts or stops with a click.
import React from 'react'
import { Audio } from '@remotion/media'
import { Sequence, interpolate, staticFile } from 'remotion'
import { CONFIG, DURATION, ORDER, sceneStart } from './config'

const A = CONFIG.audio
const S = CONFIG.scenes
type Sfx = keyof typeof A.sfx
type Cue = { sfx: Sfx; from: number }

/** Every effect on the master timeline. `from` is where the file starts playing. */
export function cues(): Cue[] {
  const c: Cue[] = []
  // A whoosh per transition, its swell peaking halfway through the crossfade.
  for (const s of ORDER.slice(1)) c.push({ sfx: 'whoosh', from: sceneStart(s) + Math.round(CONFIG.transitionFrames / 2) - A.sfx.whoosh.peakAt })
  // A click whenever the cursor clicks; a pop for two moments worth marking.
  const at = (sfx: Sfx, scene: (typeof ORDER)[number], frame: number) => c.push({ sfx, from: sceneStart(scene) + frame - A.sfx[sfx].lead })
  at('click', 'agent', S.agent.send)
  at('pop', 'agent', S.agent.output)
  at('pop', 'permissions', S.permissions.cardAt)
  at('click', 'permissions', S.permissions.allow)
  at('click', 'git', S.git.sparkle)
  at('click', 'git', S.git.commit)
  at('click', 'models', S.models.use)
  return c.sort((a, b) => a.from - b.from)
}

const edges = (f: number, frames: number) =>
  interpolate(f, [0, A.clipFadeFrames, frames - A.clipFadeFrames, frames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

/** 0..1: how much the music is ducked at frame f. */
function duckAt(f: number, list: Cue[]) {
  const m = A.music
  let d = 0
  for (const { sfx, from } of list) {
    const on = from + A.sfx[sfx].lead
    const off = from + A.sfx[sfx].frames - A.clipFadeFrames
    d = Math.max(d, interpolate(f, [on - m.duckAttack, on, off, off + m.duckRelease], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  }
  return d
}

export const Soundtrack: React.FC = () => {
  const list = cues()
  const m = A.music
  const fps = CONFIG.fps
  const music = (f: number) =>
    m.volume *
    interpolate(f, [0, m.fadeInSec * fps, DURATION - m.fadeOutSec * fps, DURATION], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => t * t * (3 - 2 * t) }) *
    (1 - m.duck * duckAt(f, list))
  return (
    <>
      <Audio src={staticFile(m.src)} trimBefore={Math.round(m.startAtSec * fps)} volume={music} />
      {list.map(({ sfx, from }, i) => {
        const s = A.sfx[sfx]
        return (
          <Sequence key={i} from={from} durationInFrames={s.frames} layout="none">
            <Audio src={staticFile(s.src)} volume={(f) => s.volume * edges(f, s.frames)} />
          </Sequence>
        )
      })}
    </>
  )
}
