// /releases: every GitHub release with its downloads, plus the headline changes from CHANGELOG.md. Needs site.js first.

const DL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>'

function latestCard(rel, a) {
  const v = rel.tag_name.replace(/^v/, '')
  return `
    <span class="tag">Latest</span>
    <p class="latest-ver">Croo ${esc(v)}</p>
    <p class="latest-meta">${fmtDate(rel.published_at)} · ${ago(rel.published_at)}${a.dmg ? ` · ${fmtSize(a.dmg.size)}` : ''}</p>
    <div class="latest-actions">
      <a class="btn white" href="${esc(a.dmg ? a.dmg.browser_download_url : rel.html_url)}">${DL}Download .dmg</a>
      <a class="latest-link" href="/changelog#v${esc(v)}">What’s new</a>
    </div>`
}

function stat(n, label) {
  return `<div class="stat"><b>${n}</b><span>${label}</span></div>`
}

function releaseRow(rel, notes, i) {
  const v = rel.tag_name.replace(/^v/, '')
  const a = assetsOf(rel)
  const titles = notes?.titles?.length ? notes.titles : []
  const intro = notes && !titles.length ? notes.body.split('\n').find((l) => l.trim() && !/^\s*[-*] /.test(l)) : ''
  return `
  <li class="rel enter" style="--i:${Math.min(i, 8)}" id="v${esc(v)}">
    <div class="rel-head">
      <a class="rel-ver" href="#v${esc(v)}">${esc(v)}</a>
      <p class="rel-date"><time datetime="${esc(rel.published_at)}">${fmtDate(rel.published_at)}</time><span>${ago(rel.published_at)}</span></p>
      ${i === 0 ? '<span class="tag">Latest</span>' : ''}${rel.prerelease ? '<span class="tag ghost">Pre-release</span>' : ''}
    </div>
    <div class="rel-card">
      ${
        titles.length
          ? `<ul class="highlights">${titles
              .slice(0, 6)
              .map((t) => `<li>${inline(t)}</li>`)
              .join('')}${titles.length > 6 ? `<li class="more">+${titles.length - 6} more</li>` : ''}</ul>`
          : intro
            ? `<p class="rel-intro">${inline(intro.replace(/^[-*] /, ''))}</p>`
            : `<p class="rel-intro dim">No notes for this build.</p>`
      }
      <div class="rel-foot">
        <div class="files">
          ${a.dmg ? `<a class="file" href="${esc(a.dmg.browser_download_url)}">${DL}<span>.dmg</span><small>${fmtSize(a.dmg.size)}</small></a>` : ''}
          ${a.zip ? `<a class="file" href="${esc(a.zip.browser_download_url)}">${DL}<span>.zip</span><small>${fmtSize(a.zip.size)}</small></a>` : ''}
          ${!a.dmg && !a.zip ? `<a class="file" href="${esc(rel.html_url)}">View on GitHub</a>` : ''}
        </div>
        <div class="rel-links">
          ${a.downloads >= 100 ? `<span class="dl-count" title="Downloads of this version">${short(a.downloads)} downloads</span>` : ''}
          ${notes ? `<a href="/changelog#v${esc(v)}">Full notes</a>` : ''}
          <a href="${esc(rel.html_url)}" rel="noopener">GitHub</a>
        </div>
      </div>
    </div>
  </li>`
}

// Without the API (offline or rate limited) the changelog still lists every version; files link to GitHub.
function fallbackRow(n, i) {
  const fake = { tag_name: `v${n.version}`, html_url: `https://github.com/${REPO}/releases/tag/v${n.version}`, assets: [] }
  return releaseRow({ ...fake, published_at: null }, n, i).replace(/<p class="rel-date">[\s\S]*?<\/p>/, '')
}

async function main() {
  const [rels, notes] = await Promise.allSettled([loadReleases(), loadChangelog()])
  const byVersion = new Map((notes.value || []).map((n) => [n.version, n]))
  const list = $('#releases')

  if (rels.status === 'fulfilled' && rels.value.length) {
    const all = rels.value.filter((r) => !r.draft)
    const published = all.filter((r) => !r.prerelease)
    const latest = published[0] || all[0]
    const la = assetsOf(latest)
    $('#latest').innerHTML = latestCard(latest, la)

    const total = all.reduce((n, r) => n + assetsOf(r).downloads, 0)
    const first = all[all.length - 1]
    const days = (new Date(latest.published_at) - new Date(first.published_at)) / 86400000
    const gap = days > 0 ? Math.max(1, Math.round(days / Math.max(1, all.length - 1))) : 0
    // Download totals only appear once they say something; a young project's small number is just noise.
    $('#stats').innerHTML = [
      stat(all.length, 'releases'),
      total >= 1000 ? stat(short(total), 'downloads') : stat(la.dmg ? fmtSize(la.dmg.size) : '–', 'latest download'),
      stat(gap ? `${gap} day${gap > 1 ? 's' : ''}` : '–', 'between releases, on average'),
      stat(fmtDate(first.published_at, { month: 'short', year: 'numeric' }), 'first release'),
    ].join('')
    list.innerHTML = all.map((r, i) => releaseRow(r, byVersion.get(r.tag_name.replace(/^v/, '')), i)).join('')
  } else if (notes.value?.length) {
    $('#latest').innerHTML = `<span class="tag">Latest</span><p class="latest-ver">Croo ${esc(notes.value[0].version)}</p>
      <div class="latest-actions"><a class="btn white" href="https://github.com/${REPO}/releases/latest">${DL}Download from GitHub</a></div>`
    $('#stats').remove()
    list.innerHTML = notes.value.map(fallbackRow).join('')
    $('#rel-note').textContent = 'GitHub’s API didn’t answer, so download links go to each release on GitHub.'
  } else {
    $('#latest').innerHTML = `<p class="latest-ver">Croo</p><div class="latest-actions"><a class="btn white" href="https://github.com/${REPO}/releases">See releases on GitHub</a></div>`
    $('#stats').remove()
    list.innerHTML = ''
    $('#rel-note').innerHTML = `Couldn’t reach GitHub just now. <a class="ulink" href="https://github.com/${REPO}/releases">Open the releases on GitHub</a>.`
  }

  if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start', behavior: 'instant' }))
}
main()
