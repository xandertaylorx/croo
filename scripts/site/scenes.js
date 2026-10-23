// Runs after the app has booted: opens the panels a scene needs by clicking the real buttons.
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const click = (sel, text) => [...document.querySelectorAll(sel)].find((e) => !text || e.textContent.includes(text))?.click()
const scene = new URLSearchParams(location.search).get('scene') || 'chat'

await wait(300)
if (scene === 'chat') {
  click('.btn-git')
  await wait(400)
  click('.git-row')
  await wait(400)
  // Open the edits group, as if the reader had just clicked it.
  document.querySelectorAll('.work-head')[1]?.click()
}
if (scene === 'models') {
  // Settings opens with a fade; capture it once it has settled.
  document.head.insertAdjacentHTML('beforeend', '<style>.modal,.modal-card{animation:none!important}</style>')
  click('button[aria-label="Settings"]')
  await wait(500)
}
document.querySelectorAll('.scroll').forEach((e) => (e.scrollTop = e.scrollHeight))
document.documentElement.dataset.captured = 'yes'
