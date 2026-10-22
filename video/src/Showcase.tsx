// The full 30 second reel: scenes on a timeline plus every sound cue.
import React from 'react'
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from 'remotion'
import { keyFrames } from './anim'
import { AppScene, COMMIT_MSG, DIFF_LINES, PROMPT, RUN_LINES, T } from './AppScene'
import { CHIP_AT, MODE_AT, Intro, Montage, Outro } from './Scenes'

const APP = 66
const MONTAGE = 712
const OUTRO = 800
export const DURATION = 900

type Cue = [frame: number, file: string, volume: number]

function cues(): Cue[] {
  const c: Cue[] = []
  const key = (frames: number[], at: number) =>
    frames.forEach((k, i) => c.push([at + k, `key${(i * 7 + 3) % 4}.wav`, 0.32 + ((i * 13) % 5) * 0.03]))

  // intro
  c.push([0, 'whoosh.wav', 0.18])
  c.push([44, 'ribbit.wav', 0.5])
  c.push([56, 'swoosh-long.wav', 0.35])

  // app
  const a = APP
  c.push([a + T.clickComposer, 'click.wav', 0.5])
  key(keyFrames(T.typeStart, T.typeRate, PROMPT), a)
  c.push([a + T.send, 'whoosh.wav', 0.3])
  c.push([a + T.send + 1, 'pop.wav', 0.35])
  c.push([a + T.read, 'pop.wav', 0.3])
  c.push([a + T.search, 'pop.wav', 0.3])
  c.push([a + T.edit, 'pop.wav', 0.35])
  for (let i = 0; i < DIFF_LINES; i++) c.push([a + T.diffLines + i * T.diffRate, 'tick.wav', 0.1])
  c.push([a + T.run, 'pop.wav', 0.3])
  for (let i = 0; i < RUN_LINES + 1; i++) if (i !== 3) c.push([a + T.runOut + i * T.runRate, 'tick.wav', 0.08])
  c.push([a + T.runDone, 'success.wav', 0.4])
  c.push([a + T.done + 2, 'ribbit.wav', 0.35])
  c.push([a + T.clickGit, 'click.wav', 0.5])
  c.push([a + T.gitOpen, 'whoosh.wav', 0.28])
  c.push([a + T.tick1, 'tick.wav', 0.25])
  c.push([a + T.tick2, 'tick.wav', 0.25])
  c.push([a + T.clickMsg, 'click.wav', 0.45])
  key(keyFrames(T.msgStart, T.msgRate, COMMIT_MSG), a)
  c.push([a + T.clickCommit, 'click.wav', 0.5])
  c.push([a + T.committed, 'success.wav', 0.35])
  c.push([a + T.clickPush, 'click.wav', 0.5])
  c.push([a + T.pushed + 2, 'chime.wav', 0.35])
  c.push([a + T.end - 14, 'swoosh-long.wav', 0.3])

  // montage
  for (let i = 0; i < 10; i += 2) c.push([MONTAGE + Math.round(CHIP_AT(i)), 'pop.wav', 0.2])
  c.push([MONTAGE + 42, 'whoosh.wav', 0.25])
  MODE_AT.slice(1).forEach((m) => c.push([MONTAGE + m, 'tick.wav', 0.3]))

  // outro
  c.push([OUTRO - 4, 'whoosh.wav', 0.25])
  c.push([OUTRO + 13, 'ribbit.wav', 0.5])
  c.push([OUTRO + 22, 'chime.wav', 0.3])
  return c
}

export const Showcase: React.FC = () => (
  <AbsoluteFill style={{ background: '#0b1310' }}>
    <Sequence from={APP} durationInFrames={MONTAGE + 16 - APP}>
      <AppScene />
    </Sequence>
    <Sequence durationInFrames={80}>
      <Intro />
    </Sequence>
    <Sequence from={MONTAGE} durationInFrames={OUTRO + 8 - MONTAGE}>
      <Montage />
    </Sequence>
    <Sequence from={OUTRO} durationInFrames={DURATION - OUTRO}>
      <Outro />
    </Sequence>

    <Audio src={staticFile('sfx/music.wav')} volume={(f) => interpolate(f, [0, 20, DURATION - 30, DURATION], [0, 0.32, 0.32, 0], { extrapolateRight: 'clamp' })} />
    {cues().map(([at, file, volume], i) => (
      <Sequence key={i} from={at} durationInFrames={45} layout="none">
        <Audio src={staticFile(`sfx/${file}`)} volume={volume} />
      </Sequence>
    ))}
  </AbsoluteFill>
)
