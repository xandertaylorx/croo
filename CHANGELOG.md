# Changelog

## 0.22.0

- **Use your subscription**: connect a Claude (Pro/Max/Team) or ChatGPT (Plus/Pro) plan with no API key. Croo runs the `claude` or `codex` CLI you already signed in to, shows its tool calls as normal cards, keeps the conversation going between messages, and warns you when you near your plan's usage limit. Settings shows whether the CLI is installed and signed in
- **Models for subscriptions**: a built-in model list with aliases (`opus`, `sonnet`), per-model reasoning levels and context sizes, and a `models.json` in Croo's data folder to add a model that ships before the app updates
- **Work groups**: a run of tool calls folds under one line ("Edited 2 files and ran 1 command"), open while it works and folded once the reply follows; click to look inside
- **Updates between the work**: a message in the middle of a task no longer gets a copy button and stats, and the agent is told to write an update only when it has learned something, not after every step
- **Changed files**: a coding turn ends with the list of files it changed, one click from each
- **Fix**: bold text around code (`**`name`**`) showed stray asterisks
- **New website**: rebuilt around the app's own windows, drawn from its code so they stay sharp at any size

## 0.21.0

- **Colour palettes**: pick Croo (the neutral greys and frog green) or Crooli, a palette taken from crooli.com: warm ivory and oat, ink, a lapis-blue accent, with sage, sky and clay for charts and code. Each has a light and a dark side
- **Light, dark or system**: a Mode switch in Settings → General → Appearance overrides your Mac's setting for the whole window
- **Settings redone**: the window is centred and calmer, with a fixed close button, a quieter side list with the version at the foot, grouped rows for switches, a proper font picker, and a narrower column that is easier to read
- **Built by Crooli**: the foot of Settings → About credits Crooli, in Plus Jakarta Sans ExtraBold, and links to crooli.com. The font is bundled, so it works offline

## 0.20.0

- **Font setting**: Settings → General → Appearance now has a Font choice: Default, Rounded, Humanist, Serif or Mono, each shown in its own typeface. It applies at once and is remembered. Code and the terminal stay monospaced

## 0.19.1

- **Slimmer update button**: the "Croo is out" banner at the bottom left is now a small round icon. It widens on hover to say "Update", and while it downloads it turns into a progress ring with the percent ("Updating 42%"), then "Restarting…"

## 0.19.0

Chat mode gets tools that answer with a card instead of a paragraph.

- **Calculator**: ask for a calculation and Croo works it out exactly (percentages, powers, roots, trigonometry, factorials) and shows a neat result card instead of doing sums in its head. It is a small built-in parser, not `eval`
- **Weather**: ask about the weather anywhere and get a card with the temperature, feels-like, humidity, wind, the next 24 hours and a 7-day forecast, tinted for sun, cloud, rain, snow, storm or night. Celsius or Fahrenheit to suit you
- **Places and maps**: ask where something is and Croo pins it on a real map. Several matches get numbered pins
- **Routes**: ask how far or how long it takes to get somewhere by car, bike or on foot and see the route on a map with distance and time (no live traffic, no flights or public transport)
- **Live flights**: track an aircraft by callsign (BAW123) or see what is flying near a place, with its position, altitude, speed and the path so far
- **Conversions and clocks**: units offline (length, mass, volume, speed, area, time, data, temperature), currencies at the latest European Central Bank rates, and the local time in any city with how far ahead or behind you it is
- **Charts**: bar, line, area, pie and donut charts. Ask for one, or Croo will draw one when numbers are easier to compare as a picture. They follow light and dark mode and show values on hover
- Cards are saved with the chat, so they are still there when you reopen it
- Only the place, callsign or currency you ask about goes out, to Open-Meteo (weather), OpenStreetMap (places, routes, map tiles), OpenSky (flights) and Frankfurter (currencies). No keys or accounts, and nothing is sent unless you ask

## 0.18.0

- **Web pages in Chat mode**: plain chats can now read a web page too. Give Croo a link, or ask about something current, and it fetches the page (asking first, like in Code mode, with Allow always on the card). To search, it fetches a results page and opens the best hits
- **Site icons**: fetched pages show with the site's own favicon instead of an initial. Croo downloads each icon straight from that site, never from an icon service, and falls back to the initial when a site has none
- **Sources under replies**: when a reply was written from fetched pages, a row under it lists them as clickable chips with a count. Four show; the rest sit behind +N

## 0.17.0

A round of chat polish, borrowed from crooli-ai.

- **Tool timeline**: consecutive tool calls hang on one thin rail with a dot per step. The running step pulses, finished steps go solid, failures turn red
- **Reasoning as steps**: the thinking block opens to dim, formatted text on a rail instead of a plain box. While Croo thinks, the last four lines of its reasoning fade past, with animated dots on the label
- **Compaction card**: the line marking summarized messages is now a card you can open to read the summary that replaced them
- **Reply details**: hover a reply to see the model, time, tokens and estimated cost of the turn that produced it, next to the copy button
- **Source chips**: fetched pages show as a small chip with the site's initial and address instead of a bare URL
- **Jump to latest**: a round button appears when you scroll away from the bottom of a chat
- **Long messages fold**: a very long message of yours folds to nine lines with Show more
- **Tables, quotes and rules**: tables get zebra rows and a hover row, quotes get an accent bar and a soft tint, horizontal rules are short and centered
- A gradient edge circles the message box while Croo works

## 0.16.1

- **Pinned task list**: when Croo works through a multi-step task, its plan sits above the message box and ticks off step by step, with the current step and a progress ring in the header. The step updates no longer interrupt the conversation as separate rows. Click to fold it away; once every step is done it shrinks to one line you can close
- The demo keeps a task list too, so you can see it without a key

## 0.16.0

- **Undo Croo's changes**: before Croo's file tools change a file, its previous content is saved. **Undo changes** next to Retry puts back everything the last turn changed, and the ↶ button on any of your messages restores the files to how they were before it, keeping the conversation. Editing and resending a message can undo the file changes since then too. Croo is told what was restored. Changes made by shell commands are not tracked
- **Plan mode**: a fourth permission mode (`⇧Tab` cycles Manual → Auto → Plan → Bypass). Croo reads, searches and runs read-only commands, then shows a plan card. **Approve and start** switches to Auto and Croo carries the plan out; **Keep planning** lets you ask for changes. Nothing can be edited until you approve
- **Croo checks its own work in a browser**: a new `browser` tool drives a real Chromium page, separate from your own sign-ins. Croo can open your dev server, read the page, click, type, scroll, read console errors and take screenshots it can look at. The screenshots show on the tool card (click to enlarge). Localhost pages open without asking; other sites ask first
- **Background commands**: `bash` can start dev servers and watchers with `run_in_background`. `bash_output` reads what they print and `bash_kill` stops them. They are stopped when Croo quits
- **Errors caught right after edits**: after Croo edits TypeScript, JavaScript, Python, JSON or Go files, it checks them with the project's own TypeScript compiler or a syntax check, and reports any errors back in the same step. A quiet "Checked" row shows the result. Turn this off in Settings → General → Checks
- **Research subagents**: a new `task` tool hands broad research to a subagent with its own fresh context. Subagents can read, search and run read-only commands, but can't change anything. Several can run in parallel, and only their reports come back, so long investigations no longer fill up the chat's context
- **Custom slash commands**: markdown files in `.croo/commands/` (or `.claude/commands/`, or `~/.config/croo/commands/` for every folder) become `/name` commands, with `$ARGUMENTS` filled in. Typing `/` lists them with their descriptions
- **Skills**: folders with a `SKILL.md` in `.croo/skills/` (or `.claude/skills/`, or `~/.config/croo/skills/`) are listed for the agent by name and description. It loads the full instructions with the `skill` tool when a task calls for them
- **Hooks**: shell commands in `.croo/hooks.json` or `~/.config/croo/hooks.json` run on `PreToolUse` (exit code 2 blocks the call), `PostToolUse` (exit code 2 reports back, e.g. lint output), `UserPromptSubmit` and `Stop` (exit code 2 keeps the agent working, e.g. until the tests pass). Claude Code's hooks format works too. A folder's hooks only run after you trust that exact file, and Croo asks again whenever it changes
- Tool results can carry images for Claude, OpenAI, Gemini and OpenAI-compatible models; only the newest two screenshots are kept in the model's context

## 0.15.1

- **ripgrep is bundled again**: the 0.15.0 build skipped ripgrep after a failed download, so search fell back to the slower built-in walker. The download now retries, and a release build fails rather than shipping without it

## 0.15.0

- **MCP servers**: Settings → MCP connects Model Context Protocol servers, local commands or remote URLs, and the agent can use their tools in Code mode. Paste a command, a URL, or the usual `{"mcpServers": ...}` JSON from Claude, Cursor or VS Code. Each server shows its status and tools, and can be turned off, reconnected or removed. Tokens in `env` and `headers` are encrypted with your keychain. In Auto mode Croo asks before each MCP tool call unless the server marks the tool read-only
- **Context ring**: a small ring at the top right of each chat fills as the conversation uses the model's context window; hover it for the exact numbers
- **Long tasks keep going**: when a conversation nears the model's context limit, Croo summarizes the older part and carries on. The chat still shows everything, and a quiet line marks where the summary starts. If a provider says a request is too long, Croo summarizes and retries instead of failing
- **Prompt caching for Claude**: the system prompt, tools and conversation so far are cached between steps, so long agent runs cost much less and start each step faster. Cached tokens from OpenAI and Gemini are counted too, and the cost estimate prices cache reads and writes
- **Faster, sharper search**: grep and list_files use ripgrep (bundled with the app), about 4× faster on large projects and with no 20,000-file cap. grep can return only file names or match counts, show context lines, and match across lines
- **New tools**: multi_edit makes several edits to one file in one step, web_fetch reads a documentation page or URL (asks first in Auto mode), and todo_write keeps a visible task list for multi-step work
- Independent reads and searches run in parallel, and a turn can take up to 200 steps instead of 50
- A rewritten coding system prompt: understand before changing, do only what was asked, verify with the project's own tests, care with irreversible actions, and outcome-first replies

## 0.14.2

- **Update progress**: the update button and Settings show download and install progress while Croo updates
- Fixed unwanted borders around code inside chat code blocks and command output
- Refreshed the website with a quieter layout, light and dark screenshots, clearer install options and a new social preview image; updated the README screenshots

## 0.14.1

- **Newer OpenAI models work**: Croo now talks to OpenAI through the Responses API, so models like gpt-6.x take tools and a reasoning effort together instead of failing with "Function tools with reasoning_effort are not supported" or "not supported in the v1/chat/completions endpoint". Reasoning summaries show in the Thinking row. Other OpenAI-compatible servers (Groq, OpenRouter, Ollama, LM Studio) are unchanged

## 0.14.0

- **Quieter, more minimal look**: warm neutral greys in place of the green tint, with green kept for the frog and for success. Buttons, the send button and selected options use plain ink instead of green, corners are tighter, the message box is flat with a hairline border, and the soft glows are gone
- Section labels are in sentence case instead of all caps, headings and labels use lighter weights, and user messages sit in a plain rounded block
- Links, inline code, quotes and @mentions are neutral instead of green; menus and dialogs have tighter corners and no blurred backdrop

## 0.13.0

- **Queue messages**: while the agent is working, type your next message and press ↵ or ⌘↵ to line it up; it sends when the current task finishes. Queued messages show above the box (✕ to remove); Stop returns when the box is empty, and stopping clears the queue
- **Faster voice**: transcription runs through a warm Whisper server that starts as soon as you begin speaking, so text appears in a fraction of a second instead of waiting for the model to load. The first use after installing still takes a few seconds while macOS prepares the GPU
- **Code blocks keep their Copy / Run header in view** while you scroll a long block

## 0.12.2

- Small models that write a tool call out as text (`{"name":"bash",...}`, a fenced block or a `<tool_call>` tag) instead of using the tool channel now work: Croo recognises the call for the tools it offered and runs it through the usual approval step. The agent is also told to act with tools rather than print commands for you to run

## 0.12.1

- **Math renders**: LaTeX in replies (`$x^2$`, `$$…$$`, `\(…\)`, `\[…\]`) is typeset with KaTeX instead of showing raw `$$` and backslashes; prices like `$5 and $10` are left alone
- The agent no longer refuses a plain "delete these files" request; risky commands still ask for your approval first

## 0.12.0

- **Voice input**: a mic button in the message box. While you speak a live waveform scrolls by; press ✓ (or Return) and your words are typed in. Speech is turned into text on your Mac with Whisper (built in, 57 MB voice model downloaded the first time, nothing uploaded). Esc cancels
- **AI commit messages**: a ✦ button in the Git panel's message box writes the message from the selected files' diffs using the model you have selected
- **Export chat**: a button in the chat header saves the conversation as markdown
- First run now leads with "Start free, on this Mac" (the built-in local model), with your own key as the alternative

## 0.11.1

- Fixed the "Thinking…" row glitching when you hover or click it while the model is reasoning
- Fixed the Git panel not offering to create a GitHub repository: apps opened from Finder didn't see `gh` (or node, brew tools) on the PATH; Croo now picks up your shell's PATH and the Homebrew folders

## 0.11.0

- **Local model, built in**: Croo now bundles its own engine (llama.cpp). In Settings → Providers (or on first run) download Qwen3 4B Instruct, about 2.5 GB, and it runs on your Mac with Metal: free, private, offline, no account or key. The model lives in Croo's data folder, not in the app, so updating Croo never removes it; downloads resume and are checksum-verified. The engine starts when you chat and stops after ten idle minutes
- Memory has its own tab in Settings
- Fixed choosing a profile picture doing nothing
- Bottom left now shows your profile picture (or your initial) instead of the frog

## 0.10.0

- **Memory**: in Chat mode Croo saves durable things you tell it (preferences, projects, people) and uses them in later chats; a small "Remembered …" line appears in the chat when it does. Notes live in `memory.md` in Croo's data folder as dated markdown. Code mode reads the notes too
- Manage it in Settings → General → Memory: turn it off, forget single notes, or forget everything
- Croo now knows your name from Settings → Profile

## 0.9.1

- **In-app updates**: "Update and restart" (bottom left or Settings → About) downloads the new version, replaces Croo and relaunches it, no manual download. Falls back to the download page if Croo can't write to its own folder
- One-line installer: `curl -fsSL https://ai.crooli.com/install.sh | bash`

## 0.9.0

- **Profile**: set your name and a picture in Settings → General; they show bottom left in place of "Croo" (falls back to the frog and "User")
- Development builds now show "Croo" in the macOS menu bar instead of "Electron"

## 0.8.0

- **Website** in `web/`, a static site: live latest-release download button, install commands, screenshots and features
- The model is now told which model it is, so small local models stop claiming to be GPT-4
- Sent attachments are cards above your message (image thumbnails you can open, file cards with type and size); `@file` mentions show as chips
- Replies read better: formatting guidance for the model, task lists and auto-linked URLs, cleaner headings, tables and quotes, and a copy button on every reply

## 0.7.0

- **Attachments**: paste or drop images and files into the message box, or use the paperclip; images are scaled down before sending and work with Claude, OpenAI-compatible and Gemini models
- **`@file` mentions** with autocomplete: the file is sent along with the message
- **Edit and retry**: edit any message and resend, or retry the last reply
- **`⌘K` search** across chats (titles and contents), files and actions; a search button in the sidebar
- **Cost estimate** beside time and tokens; built-in Claude prices, your own prices per provider in Settings, local models free
- **Notifications** when a task finishes or needs your OK while the window is in the background (Settings → General)
- **Update notice** at the bottom left when a newer GitHub release exists; a release workflow builds and publishes the macOS app when you push a `v*` tag

## 0.6.0

- **Time and tokens**: a live clock and token count while the agent works, with the final tally and an input/output breakdown on hover
- **Publish from the Git panel**: no remote yet? connect by URL or `owner/repo`, or create the repository on GitHub with `gh`; push and pull failures now explain themselves
- **Effort levels** with a composer control, shown only for models that have one; reasoning settings are chosen per model (adaptive thinking on Claude 4.6+, token budgets on older models) and negotiated with the API instead of failing
- **Settings redesign**: Providers, General and About panes; permission and effort defaults, shortcut list
- **Wrapping**: the file viewer and every diff wrap long lines instead of scrolling sideways; the sidebar steps aside in narrow windows
- Chat / Code icons clear the macOS window buttons

## 0.5.0

- **Git panel** (`⌘⇧G`): branch and sync state, changed files with line counts and inline diffs, pick files, commit (`⌘↵`), push (publishes a new branch), pull (fast-forward only), `git init` for plain folders; change-count badge on the header button
- **Run code from the chat**: shell, Python and Node snippets get a Run button; output streams live under the block with exit code and timing, and Run turns into Stop while it runs
- Chat / Code switch is now two icons (with tooltips)

## 0.4.0

- **Chat and Code modes**: a switch at the top of the sidebar. Chat is plain conversation with a flat chat list; Code is folders plus the agent
- **Files panel** (`⌘⇧E`): file tree that respects `.gitignore`, syntax-highlighted viewer, images, reveal in Finder, send `@path` to the composer
- **Browser panel** (`⌘⇧B`): minimal in-app browser with a start page that finds your running dev servers
- **AGENTS.md and CLAUDE.md** are both read every turn (plus CROO.md), shown under the composer; **`/init`** studies the project and writes AGENTS.md
- **Thinking**: reasoning streams as an expandable "Thought for…" row (Anthropic extended thinking with signed blocks round-tripped, Gemini thoughts, `reasoning_content` from OpenAI-compatible providers); saved with the chat
- **Syntax highlighting** in chat code blocks and the file viewer, light and dark
- **Model picker** under the composer lists the models your key can use, with search; type any id to use it
- **Settings redesign**: provider cards, masked keys, verified key updates, per-provider model lists; keys are now encrypted with the OS keychain
- **Tooltips** with keycaps for every button's shortcut

## 0.3.0

- Permission modes under the chat bar: Manual (ask for everything), Auto (ask only when it matters, with a conservative safe-command check), Bypass (never ask); `⇧Tab` cycles
- Built-in terminal panel: `⌘J` toggles, `⌘T` opens a new tab while it is focused; real shells via node-pty, themed to match
- New frog: the solid pixel-block look from the terminal, redrawn with lively animation (breathing, blinking, glancing, ribbiting, hopping, catching flies, sleeping) and reactions to thinking / working / waiting / done / errors

## 0.2.0

Croo is now a desktop app instead of a terminal CLI.

- Electron app (macOS first, Windows later) with a minimal sidebar of folders, each with its own chats
- Streaming markdown replies, tool rows, and inline diff / command approval cards
- The frog hops while tools run, looks around while thinking, and celebrates when done
- In-app provider setup with key checking; demo mode with no key
- Light and dark follow the system; native vibrancy sidebar on macOS
- Removed the terminal UI, the `croo` command and the npm package; core agent, providers, tools and saved chats are unchanged

## 0.1.4

- Setup checks the provider's model list and falls back if the default model isn't available for your key

## 0.1.3

- Existing profile with no key now shows the provider list instead of asking for an OpenAI key

## 0.1.2

- First run now shows a provider list (OpenAI, Anthropic, Gemini, Groq, OpenRouter, DeepSeek, xAI, Mistral, Together, Ollama, or any OpenAI-compatible URL); pick one and paste your key
- A profile with no key now asks for it instead of exiting with an error

## 0.1.1

- `croo --demo`: explore the interface with a scripted fake model, no API key needed (also offered on first run)

## 0.1.0

First release.

- Interactive streaming REPL and one-shot mode (`croo "prompt"`)
- Providers: OpenAI-compatible, Anthropic Messages, Google Gemini; named profiles
- Tools: read_file, write_file, edit_file, list_files, grep, bash
- Permission prompts with diffs, `--yolo`, `.gitignore` support, cwd sandbox
- `CROO.md` / `AGENTS.md` project instructions
- Local session history and `--continue`
- Themed UI, markdown rendering, spinner, and the Croo frog
