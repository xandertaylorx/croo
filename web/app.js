// Fills in the latest release from GitHub, wires up the copy buttons and the screenshot tabs.
const REPO = 'xandertaylorx/croo'
const $ = (s) => document.querySelector(s)

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const fmtSize = (b) => (b ? `${Math.round(b / 1048576)} MB` : '')

async function latestRelease() {
  try {
    const cached = JSON.parse(sessionStorage.getItem('croo.release') || 'null')
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data
  } catch {}
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(String(res.status))
  const data = await res.json()
  try {
    sessionStorage.setItem('croo.release', JSON.stringify({ at: Date.now(), data }))
  } catch {}
  return data
}

function showRelease(rel) {
  const version = rel.tag_name.replace(/^v/, '')
  const assets = rel.assets || []
  const dmgs = assets.filter((a) => /\.dmg$/i.test(a.name))
  const arm = dmgs.find((a) => /arm64/i.test(a.name)) || dmgs[0]
  const intel = dmgs.find((a) => a !== arm && !/arm64/i.test(a.name))
  const zip = assets.find((a) => /\.zip$/i.test(a.name) && !/blockmap/i.test(a.name))

  $('#dl-version').textContent = `v${version}`
  $('#rel-version').textContent = `Croo ${version}`
  $('#rel-date').textContent = fmtDate(rel.published_at)
  $('#rel-notes').href = rel.html_url
  if (arm) {
    $('#dl-main').href = arm.browser_download_url
    const a = $('#dl-arm')
    a.href = arm.browser_download_url
    $('#dl-arm-size').textContent = fmtSize(arm.size)
  } else {
    $('#dl-main').href = rel.html_url
    $('#dl-arm').href = rel.html_url
  }
  if (intel) Object.assign($('#dl-intel'), { href: intel.browser_download_url, hidden: false })
  if (zip) Object.assign($('#dl-zip'), { href: zip.browser_download_url, hidden: false })
}

latestRelease().then(showRelease).catch(() => {
  // Offline or rate limited: the buttons already point at the releases page.
  $('#rel-version').textContent = 'Latest release'
})

if (!/Mac/i.test(navigator.platform || navigator.userAgent)) {
  $('#platform-note').textContent = 'Croo is Mac-only for now. On Windows or Linux, build it from source below.'
}

// copy buttons
document.querySelectorAll('.copy').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const text = $(btn.dataset.copy).textContent
    try {
      await navigator.clipboard.writeText(text)
      btn.textContent = 'Copied'
    } catch {
      btn.textContent = 'Press ⌘C'
    }
    setTimeout(() => (btn.textContent = 'Copy'), 1400)
  })
})

// screenshot tabs
const shots = {
  git: ['assets/git.png', 'Croo showing a chat on the left and the Git panel with an inline diff on the right'],
  chat: ['assets/chat.png', 'A Croo chat with a runnable code block and its streamed output'],
  settings: ['assets/settings.png', 'Croo settings: permissions and reasoning effort'],
}
document.querySelectorAll('.tabs button').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((t) => t.setAttribute('aria-selected', String(t === tab)))
    const [src, alt] = shots[tab.dataset.shot]
    const img = $('#shot-img')
    img.src = src
    img.alt = alt
  })
})
