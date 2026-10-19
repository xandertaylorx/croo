export interface Args {
  prompt: string
  profile?: string
  yolo: boolean
  noPet: boolean
  demo: boolean
  continue: boolean
  help: boolean
  version: boolean
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { prompt: '', yolo: false, noPet: false, demo: false, continue: false, help: false, version: false }
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    if (x === '--profile' || x === '-p') a.profile = argv[++i]
    else if (x.startsWith('--profile=')) a.profile = x.slice('--profile='.length)
    else if (x === '--yolo') a.yolo = true
    else if (x === '--no-pet') a.noPet = true
    else if (x === '--demo') a.demo = true
    else if (x === '--continue' || x === '-c') a.continue = true
    else if (x === '--help' || x === '-h') a.help = true
    else if (x === '--version' || x === '-v') a.version = true
    else if (x.startsWith('-') && x !== '-') throw new Error(`Unknown option: ${x}`)
    else rest.push(x)
  }
  a.prompt = rest.join(' ').trim()
  return a
}

export const HELP = `Usage:
  croo                  start an interactive session in the current directory
  croo "prompt"         run a one-shot task and exit

Options:
  -p, --profile <name>  use a named profile from the config
  -c, --continue        resume the last session in this directory
      --yolo            do not ask before writing files or running commands
      --no-pet          hide the frog
      --demo            try the interface with a scripted fake model (no API key)
  -v, --version         print version
  -h, --help            show this help

Config: ~/.config/croo/config.json`
