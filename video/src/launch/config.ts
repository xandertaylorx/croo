// Every timing and level for the launch video in one place. Frames are at 30fps; scene-local frames
// count from the moment that scene starts (including the frames it shares with the transition in).

export const CONFIG = {
  fps: 30,
  width: 1920,
  height: 1080,

  /** Crossfade between scenes. Scenes overlap by this many frames. */
  transitionFrames: 18,

  motion: {
    /** spring() settings for entrances: damping 20 at this stiffness/mass is critically damped (no overshoot). */
    spring: { damping: 20, stiffness: 100, mass: 1 },
    /** Frames between words / staggered elements. */
    stagger: 5,
    /** How far text rises as it fades in, in px. */
    textRise: 16,
    /** Length of an ease-out-cubic fade, in frames. */
    fadeFrames: 16,
    /** Slow camera push across each scene. */
    zoomFrom: 1,
    zoomTo: 1.06,
    /** Background drift across a scene, in px (foreground layers move more, by their depth). */
    parallax: 36,
  },

  scenes: {
    hook: { frames: 120, eyebrowAt: 6, line1At: 14, line2At: 40 },

    agent: {
      frames: 210,
      textAt: 8,
      frameAt: 14,
      cursorIn: 24,
      send: 44,
      thought: 56,
      read: 72,
      search: 84,
      edit: 98,
      diff: 106,
      run: 140,
      output: 156,
      done: 172,
    },

    permissions: { frames: 210, textAt: 8, frameAt: 14, modesAt: 30, cardAt: 40, cursorIn: 60, allow: 112, ran: 118, after: 140 },

    git: { frames: 210, textAt: 8, frameAt: 14, cursorIn: 34, sparkle: 52, typeFrom: 58, typeRate: 0.9, commit: 128, committed: 132, push: 150 },

    models: { frames: 210, textAt: 8, frameAt: 14, cursorIn: 44, use: 112, used: 115 },

    outro: { frames: 150, frogAt: 10, nameAt: 22, tagAt: 36, urlAt: 50, fadeOutFrom: 128 },
  },

  audio: {
    music: {
      src: 'audio/music.mp3',
      volume: 0.3,
      /** Where in the track the video starts, in seconds. 12.6 puts the beat (16.28s) on the first transition. */
      startAtSec: 12.6,
      fadeInSec: 1.5,
      fadeOutSec: 2,
      /** Music drops to (1 - duck) under sound effects. */
      duck: 0.3,
      /** Frames the duck takes to dip and to recover. */
      duckAttack: 4,
      duckRelease: 10,
    },
    /** Each clip gets this fade in and out, in frames, so nothing starts or stops with a click. */
    clipFadeFrames: 3,
    sfx: {
      whoosh: { src: 'audio/whoosh.wav', volume: 0.16, frames: 51, lead: 0, /** frame of the swell's peak inside the file */ peakAt: 21 },
      click: { src: 'audio/click.wav', volume: 0.2, frames: 13, /** silence before the transient, in frames */ lead: 3 },
      pop: { src: 'audio/pop.wav', volume: 0.15, frames: 12, lead: 3 },
    },
  },
} as const

export type SceneName = keyof typeof CONFIG.scenes
export const ORDER: SceneName[] = ['hook', 'agent', 'permissions', 'git', 'models', 'outro']

/** Frame at which each scene starts on the master timeline (scenes overlap by the transition). */
export const sceneStart = (name: SceneName) => {
  let at = 0
  for (const s of ORDER) {
    if (s === name) return at
    at += CONFIG.scenes[s].frames - CONFIG.transitionFrames
  }
  throw new Error(name)
}

export const DURATION = ORDER.reduce((n, s) => n + CONFIG.scenes[s].frames, 0) - CONFIG.transitionFrames * (ORDER.length - 1)
