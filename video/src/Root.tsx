import React from 'react'
import { Composition } from 'remotion'
import { Launch } from './launch/Launch'
import { CONFIG, DURATION as LAUNCH_DURATION } from './launch/config'
import { DURATION, Showcase } from './Showcase'
import { FPS, H, W } from './theme'

export const Root: React.FC = () => (
  <>
    <Composition id="Launch" component={Launch} durationInFrames={LAUNCH_DURATION} fps={CONFIG.fps} width={CONFIG.width} height={CONFIG.height} />
    <Composition id="Showcase" component={Showcase} durationInFrames={DURATION} fps={FPS} width={W} height={H} />
  </>
)
