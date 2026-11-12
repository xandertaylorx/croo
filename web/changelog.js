// /changelog: CHANGELOG.md rendered by version, with release dates from GitHub, a version index and search.
// Needs site.js first.

const log = $('#log')
const toc = $('#toc')
const q = $('#q')
const count = $('#count')

function highlight(root, words) {
  // Wrap matches in <mark> inside text nodes only, so links and code stay intact.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const hits = []
  while (walker.nextNode()) if (re.test(walker.currentNode.nodeValue)) hits.push(walker.currentNode)
  for (const node of hits) {
    const span = document.createElement('span')
    span.innerHTML = esc(node.nodeValue).replace(re, '<mark>$1</mark>')
    node.replaceWith(...span.childNodes)
  }
}

let versions = []

function render(filter = '') {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean)
  let shownVersions = 0
  let shownItems = 0
  for (const v of versions) {
    v.el.innerHTML = v.html
    const items = [...v.el.querySelectorAll('li, .ver-body > p')]
    let any = !words.length
    if (words.length) {
      const headHit = words.every((w) => v.version.includes(w))
      for (const it of items) {
        const hit = headHit || words.every((w) => it.textContent.toLowerCase().includes(w))
        it.hidden = !hit
        if (hit) {
          any = true
          shownItems++
        }
      }
      if (any) highlight(v.el.querySelector('.ver-body'), words)
    } else shownItems += v.el.querySelectorAll('li').length
    v.el.hidden = !any
    v.link.hidden = !any
    if (any) shownVersions++
  }
  count.textContent = words.length
    ? shownItems
      ? `${shownItems} change${shownItems === 1 ? '' : 's'} in ${shownVersions} version${shownVersions === 1 ? '' : 's'}`
      : 'Nothing matches that.'
    : `${versions.length} versions · ${shownItems} changes`
}

function versionHTML(n, rel) {
  const a = rel ? assetsOf(rel) : null
  return `
    <header class="ver-head">
      <h2><a href="#v${esc(n.version)}">${esc(n.version)}</a></h2>
      ${rel ? `<p class="ver-date"><time datetime="${esc(rel.published_at)}">${fmtDate(rel.published_at)}</time> · ${ago(rel.published_at)}</p>` : ''}
      ${
        a?.dmg
          ? `<a class="file small" href="${esc(a.dmg.browser_download_url)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg><span>.dmg</span><small>${fmtSize(a.dmg.size)}</small></a>`
          : ''
      }
    </header>
    <div class="ver-body">${renderBlocks(n.body)}</div>`
}

async function main() {
  const [notes, rels] = await Promise.allSettled([loadChangelog(), loadReleases()])
  if (notes.status !== 'fulfilled') {
    log.innerHTML = `<p class="fine">Couldn’t load the changelog just now. <a class="ulink" href="https://github.com/${REPO}/blob/main/CHANGELOG.md">Read it on GitHub</a>.</p>`
    $('#latest').innerHTML = ''
    return
  }
  const byTag = new Map((rels.value || []).map((r) => [r.tag_name.replace(/^v/, ''), r]))
  const latestRel = byTag.get(notes.value[0].version)
  $('#latest').innerHTML = `
    <span class="tag">Newest</span>
    <p class="latest-ver">Croo ${esc(notes.value[0].version)}</p>
    ${latestRel ? `<p class="latest-meta">${fmtDate(latestRel.published_at)} · ${ago(latestRel.published_at)}</p>` : ''}
    <ul class="latest-list">${notes.value[0].titles
      .slice(0, 4)
      .map((t) => `<li>${inline(t)}</li>`)
      .join('')}</ul>
    <div class="latest-actions"><a class="latest-link" href="/releases">All downloads</a></div>`

  log.innerHTML = ''
  toc.innerHTML = ''
  versions = notes.value.map((n, i) => {
    const rel = byTag.get(n.version)
    const el = document.createElement('article')
    el.className = 'ver enter'
    el.id = `v${n.version}`
    el.style.setProperty('--i', Math.min(i, 6))
    const html = versionHTML(n, rel)
    log.append(el)
    const link = document.createElement('a')
    link.href = `#v${n.version}`
    link.innerHTML = `<span>${esc(n.version)}</span>${rel ? `<small>${fmtDate(rel.published_at, { month: 'short', day: 'numeric' })}</small>` : ''}`
    toc.append(link)
    return { version: n.version, el, link, html }
  })
  render()

  // The index follows the version on screen.
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const v = versions.find((x) => x.el === e.target)
        versions.forEach((x) => x.link.classList.toggle('on', x === v))
        v.link.scrollIntoView({ block: 'nearest' })
      }
    },
    { rootMargin: '-30% 0px -60% 0px' },
  )
  versions.forEach((v) => io.observe(v.el))

  // A link to /changelog#v0.22.0 lands on that version once it exists.
  if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start', behavior: 'instant' }))

  let t
  q.addEventListener('input', () => {
    clearTimeout(t)
    t = setTimeout(() => render(q.value.trim()), 80)
  })
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      q.value = ''
      render()
      q.blur()
    }
  })
  addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== q && !/input|textarea/i.test(document.activeElement?.tagName || '')) {
      e.preventDefault()
      q.focus()
    }
  })
}
main()
