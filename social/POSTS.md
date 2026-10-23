# Croo on X: posts for Claude in Chrome

Site: https://ai.crooli.com · Repo: https://github.com/xandertaylorx/croo
Asset folder (absolute): /Users/user/Developer/Croo-Code/social/assets/

## Instructions for Claude in Chrome

You are posting to X (Twitter) from the account already signed in in this browser. Do not sign in, change settings, or follow/like/reply to anything.

1. Open https://x.com/compose/post in a new tab.
2. Post ONLY the post number(s) the user asks for. If they don't name one, ask which. Never post them all at once.
3. Paste the text exactly as written (keep line breaks, emoji, and links). Do not rewrite or add hashtags.
4. Attach the media with `file_upload` against the composer's hidden `<input type="file">` (find it with `find`/`read_page`; never click the attach button, it opens a native picker you can't see). Pass the absolute path listed for that post. Each call must stay under 10 MB; every file below does.
5. Wait for the media preview to finish uploading (video shows a processing bar), then take a screenshot.
6. Confirm the text and media with the user, then click **Post**. If the user already said "post it" for that number, you may click Post directly.
7. Report back with the post's URL. If upload fails twice, stop and say what happened.

For a thread (post 10), use the "+" button in the composer to add each tweet, attach media only where listed, then post the whole thread at once.

---

## Posts

### 1. Launch (full video)
Media: `/Users/user/Developer/Croo-Code/social/assets/croo-launch-full-34s.mp4`

```
Meet Croo: a coding agent with a frog in it. 🐸

A minimal desktop app for Mac. Bring your own API key or run a local model. No account, no telemetry, no backend.

Free and MIT licensed.
https://ai.crooli.com
```

### 2. It reads, edits and runs your code
Media: `/Users/user/Developer/Croo-Code/social/assets/clip-agent.mp4`

```
Croo reads, searches, edits and runs your code.

Every step is right there: files, diffs, commands, output, reasoning, time and tokens. Nothing happens behind your back.

https://ai.crooli.com
```

### 3. Permission modes
Media: `/Users/user/Developer/Croo-Code/social/assets/clip-permissions.mp4`

```
You decide what the agent may do.

Manual asks before everything.
Auto runs the safe stuff.
Plan researches first and asks you to approve a plan.
Bypass never asks.

⇧Tab cycles through them.
```

### 4. Git built in
Media: `/Users/user/Developer/Croo-Code/social/assets/clip-git.mp4`

```
Git is built into Croo.

Pick the files, read the inline diff, write the message, commit and push. No terminal needed.

https://ai.crooli.com
```

### 5. Any model, your key, or local
Media: `/Users/user/Developer/Croo-Code/social/assets/clip-models.mp4`

```
Any model. Your key. Or fully local.

Claude, OpenAI, Gemini, Ollama, or a free built-in Qwen3 4B that runs on your Mac. Keys are encrypted in your keychain.

https://ai.crooli.com
```

### 6. Undo
Media: `/Users/user/Developer/Croo-Code/social/assets/still-agent.png`

```
Undo for AI edits.

Croo saves each file before its tools change it. One click reverts the last turn, and ↶ on any message restores your files to how they were before it.

https://ai.crooli.com
```

### 7. Checks its own work
Media: `/Users/user/Developer/Croo-Code/social/assets/screenshot-git-dark.png`

```
Croo checks its own work.

It starts your dev server in the background, opens the page in a real browser, clicks around, reads console errors and looks at screenshots. Edited files are type-checked right away.
```

### 8. One-command install
Media: `/Users/user/Developer/Croo-Code/social/assets/still-outro.png`

```
Install Croo on a Mac (Apple Silicon) with one command:

curl -fsSL https://ai.crooli.com/install.sh | bash

No key yet? Pick "Just look around" for a scripted demo.
```

### 9. The frog
Media: `/Users/user/Developer/Croo-Code/social/assets/croo-frog-icon.png`

```
Why a frog?

Because the pixel frog breathes, blinks, hops, catches flies and falls asleep, and it reacts when the agent is thinking, working, waiting, done, or hit an error.

Click it.

https://ai.crooli.com
```

### 10. Thread: Croo 0.16
Tweet 1 media: `/Users/user/Developer/Croo-Code/social/assets/og-card.jpg`

```
Croo 0.16 is out. 🐸

Undo, plan mode, a browser the agent drives, subagents, and your own slash commands, skills and hooks.

A thread on what's new 👇
```

Tweet 2 (no media):
```
Undo: any turn's file changes can be reverted, or restore files to before any message.

Plan mode: Croo researches without touching anything, then asks you to approve a plan first.
```

Tweet 3 (no media):
```
It checks its own work: starts your dev server in the background, opens it in a real browser, clicks through and reads console errors.

Edited TS, JS, Python, JSON and Go files are checked right away.
```

Tweet 4 (media: `/Users/user/Developer/Croo-Code/social/assets/clip-agent.mp4`):
```
Subagents handle broad research in parallel and only send back their reports, so long investigations don't fill your chat.

Extend it with .croo/commands, skills and hooks. The .claude/ folders work too.

https://ai.crooli.com
```

---

## Asset index

| File | What | Size |
| --- | --- | --- |
| croo-launch-full-34s.mp4 | Full launch video, 1920x1080, with music | 4.3 MB |
| clip-agent.mp4 | Code mode scene, ~6s | 1.7 MB |
| clip-permissions.mp4 | Permission modes scene, ~6s | 1.6 MB |
| clip-git.mp4 | Git scene, ~6s | 2.1 MB |
| clip-models.mp4 | Providers scene, ~6s | 1.6 MB |
| still-agent / permissions / git / models / outro.png | 1920x1080 frames from the video | <1 MB each |
| screenshot-git-dark.png, screenshot-chat-light.png, screenshot-settings.png | App screenshots | <0.4 MB each |
| croo-frog-icon.png | 1024x1024 pixel frog | 14 KB |
| og-card.jpg | 1200x630 site card | 119 KB |
