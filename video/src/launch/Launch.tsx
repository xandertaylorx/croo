// The launch video: hook, four feature scenes and the end card, crossfaded, over the soundtrack.
import React from 'react'
import { AbsoluteFill, Easing } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { B } from './brand'
import { CONFIG, ORDER, SceneName } from './config'
import { Soundtrack } from './Soundtrack'
import { Agent } from './scenes/Agent'
import { Git } from './scenes/Git'
import { Hook } from './scenes/Hook'
import { Models } from './scenes/Models'
import { Outro } from './scenes/Outro'
import { Permissions } from './scenes/Permissions'

const SCENES: Record<SceneName, React.FC> = { hook: Hook, agent: Agent, permissions: Permissions, git: Git, models: Models, outro: Outro }
const timing = linearTiming({ durationInFrames: CONFIG.transitionFrames, easing: Easing.inOut(Easing.cubic) })

export const Launch: React.FC = () => (
  <AbsoluteFill style={{ background: B.stage }}>
    <TransitionSeries>
      {ORDER.flatMap((name, i) => {
        const Scene = SCENES[name]
        const seq = (
          <TransitionSeries.Sequence key={name} durationInFrames={CONFIG.scenes[name].frames}>
            <Scene />
          </TransitionSeries.Sequence>
        )
        return i === 0 ? [seq] : [<TransitionSeries.Transition key={`${name}-in`} presentation={fade()} timing={timing} />, seq]
      })}
    </TransitionSeries>
    <Soundtrack />
  </AbsoluteFill>
)
