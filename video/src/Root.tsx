import React from 'react'
import { Composition } from 'remotion'
import { DURATION, Showcase } from './Showcase'
import { FPS, H, W } from './theme'

export const Root: React.FC = () => <Composition id="Showcase" component={Showcase} durationInFrames={DURATION} fps={FPS} width={W} height={H} />
