// Fills in the latest release from GitHub and wires up the copy buttons.
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

  $('#hero-version').textContent = `v${version}`
  $('#rel-version').textContent = `Croo ${version}`
  $('#rel-date').textContent = fmtDate(rel.published_at)
  $('#rel-notes').href = rel.html_url
  const dl = $('#dl-arm')
  dl.href = arm ? arm.browser_download_url : rel.html_url
  if (arm) $('#dl-arm-size').textContent = fmtSize(arm.size)
  if (intel) Object.assign($('#dl-intel'), { href: intel.browser_download_url, hidden: false })
  if (zip) Object.assign($('#dl-zip'), { href: zip.browser_download_url, hidden: false })
}

// Offline or rate limited: the buttons already point at the releases page.
latestRelease().then(showRelease).catch(() => {})

if (!/Mac/i.test(navigator.platform || navigator.userAgent)) {
  $('#platform-note').textContent = 'Croo is Mac-only for now. On Windows or Linux, build it from source.'
}

document.querySelectorAll('[data-copy]').forEach((btn) => {
  const label = btn.querySelector('.lbl') || btn
  const original = label.textContent
  btn.addEventListener('click', async () => {
    const text = $(btn.dataset.copy).textContent
    try {
      await navigator.clipboard.writeText(text)
      label.textContent = 'Copied'
    } catch {
      // No clipboard access: select the command so ⌘C works.
      const range = document.createRange()
      range.selectNodeContents($(btn.dataset.copy))
      getSelection().removeAllRanges()
      getSelection().addRange(range)
      label.textContent = 'Press ⌘C'
    }
    setTimeout(() => (label.textContent = original), 1800)
  })
})
