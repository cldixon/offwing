/**
 * The application shell.
 *
 * A rail on the left holding identity and navigation, a column in the middle
 * holding whatever you are reading, and a composer that opens over the top of
 * it. The arrangement is borrowed from a social client on purpose, and not
 * only because it is familiar: the borrowing works because the data model
 * underneath already matches one. A release certificate is a signed record in
 * its issuer's own repository, a verdict is a signed record in the verifier's
 * carrying a reference to it, and an AppView assembles the two into a view
 * neither party controls. That is a post and a reply, exactly.
 *
 * What replaced what: this used to be a row of tabs, each a separate errand —
 * verify a document here, browse releases there, issue one somewhere else. The
 * tabs told a visitor there were four unrelated tools. There is one world.
 */

import { readFileSync } from 'node:fs'

import { html, raw } from 'hono/html'
import type { HtmlEscapedString } from 'hono/utils/html'

import { composer } from './compose.js'
import type { Actor } from './writer.js'

/**
 * The stylesheet, inlined into every page.
 *
 * Two files under styles/: tokens.css is the design system — every colour,
 * typeface, size, radius, shadow and duration the interface may use, in both
 * themes — and app.css is the components, written only in terms of those
 * tokens. They are read once at startup and served inside a <style> element,
 * so a page is still a single request and works with no build step. The
 * fonts are the one thing fetched from elsewhere.
 */
const STYLES_DIR = new URL('./styles/', import.meta.url)
const STYLES = ['tokens.css', 'app.css']
  .map((f) => readFileSync(new URL(f, STYLES_DIR), 'utf8'))
  .join('\n')

/**
 * Barlow Condensed for display, Barlow for text, Space Mono for identifiers.
 * The families and weights here must match what tokens.css names in
 * --font-display, --font-body and --font-mono, and the stamp's 800 weight.
 */
const FONTS_URL =
  'https://fonts.googleapis.com/css2?' +
  'family=Barlow+Condensed:wght@500;600;700;800' +
  '&family=Barlow:wght@400;500;600;700' +
  '&family=Space+Mono:wght@400;700' +
  '&display=swap'

export type Mode = 'demo' | 'live'

/** Which rail entry is lit. */
export type NavKey = 'home' | 'inbox' | 'issuers' | 'profile' | null

/**
 * The one piece of per-request state every page shares: who the visitor is
 * looking as, and where they are.
 *
 * Identity lives in the shell rather than on the pages that write records
 * because the alternative — a picker on the issue page and another on the
 * verdict page — is what shipped first, and it was wrong in a way that took a
 * user to find: changing the in-page dropdown without pressing its button left
 * the cookie alone, so the very next request went back to whoever happened to
 * be first in the roster. One control, one place, takes effect immediately.
 */
export type Chrome = {
  actors?: Actor[]
  /** Handle in play, or undefined for the public. */
  current?: string
  active?: NavKey
  /** Parts waiting on the acting organization, for the rail's badge. */
  waiting?: number
  /**
   * Whether to hang the composer off this page. Off for `/issue`, where the
   * page already *is* the composer — two copies of a seventeen-block form in
   * one document means duplicate element ids and a second set of inputs for
   * anything reading the markup to trip over.
   */
  composer?: boolean
}

/** The value the switcher submits to mean "sign out and watch as a stranger". */
export const PUBLIC_HANDLE = '~public'

/**
 * A monogram, coloured from the name.
 *
 * Deterministic so an organization looks the same everywhere, and computed
 * rather than stored because a demonstration should not ship thirty avatars.
 */
export function avatar(name: string, small = false) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
  return html`<span class="av ${small ? 'sm' : ''}"
    style="--av-h:${avatarHue(h)}">${initials}</span>`
}

/**
 * The hue for a name's hash, steered clear of the accent.
 *
 * Only the hue is decided here; how saturated and how light an avatar is
 * belongs to the theme (--av-sat, --av-light in tokens.css). Hues near the
 * safety yellow are moved on by sixty degrees so no organization's monogram
 * reads as an active state or a primary action.
 */
export function avatarHue(hash: number): number {
  const hue = hash % 360
  return hue > 35 && hue < 65 ? hue + 60 : hue
}

/**
 * The icon set, and the one function that draws from it.
 *
 * Here rather than in views.ts because shell.ts already owns the stylesheet
 * these are sized by, and because the account switcher needs the chevron —
 * views.ts imports from this module, so the set could not stay there without
 * either a cycle or a second copy of the same path data. The site had one
 * disclosure affordance drawn as an SVG chevron and another as a Unicode
 * triangle for exactly that reason.
 *
 * Lucide paths, all on a 24-unit box with a 2-unit stroke, so they sit
 * together at any size.
 */
const ICONS: Record<string, string> = {
  // circle-check
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  // circle-x
  cross: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  // megaphone
  megaphone:
    '<path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>' +
    '<path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"/>' +
    '<path d="M8 6v8"/>',
  // file-text
  document:
    '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>' +
    '<path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  // package
  part:
    '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/>' +
    '<path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
  // chevron-down
  chevron: '<path d="m6 9 6 6 6-6"/>',
}

export function icon(name: string) {
  return raw(
    `<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
      (ICONS[name] ?? '') +
      `</svg>`,
  )
}

/**
 * What each role is called on screen.
 *
 * Exported because the account page needs the same words the identity
 * switcher uses. One organization described as a "Repair station" in the rail
 * and an "mro" on its own page is the kind of small inconsistency that reads
 * as two different systems.
 */
export const KIND_LABEL: Record<string, string> = {
  oem: 'Manufacturer',
  mro: 'Repair station',
  operator: 'Operator',
  broker: 'Parts broker',
  lessor: 'Lessor',
}

const KIND_ORDER = ['mro', 'oem', 'operator', 'lessor', 'broker']

/**
 * The account control.
 *
 * A demonstration where everyone can be anyone, which every page says. Real
 * issuance would authenticate the individual who holds the certificate; this
 * authenticates nobody, and the point of the switcher is to let one visitor
 * walk through a transaction from both ends.
 */
function identity(chrome: Chrome) {
  const actors = chrome.actors ?? []
  const me = actors.find((a) => a.handle === chrome.current)

  return html`<details class="me">
    <summary>
      ${me ? avatar(me.displayName) : html`<span class="av public">··</span>`}
      <span class="who">
        <b>${me ? me.displayName : 'The public'}</b>
        <em>${me ? (KIND_LABEL[me.kind] ?? me.kind) : 'signed out'}</em>
      </span>
      <span class="pchev">${icon('chevron')}</span>
    </summary>
    <form method="post" action="/act-as" class="switcher">
      <h4>Watch without an account</h4>
      <button name="handle" value="${PUBLIC_HANDLE}" class="${me ? '' : 'on'}">
        <span class="av sm public">··</span> The public
      </button>
      ${KIND_ORDER.map((kind) => {
        const group = actors.filter((a) => a.kind === kind)
        if (group.length === 0) return ''
        return html`<h4>${KIND_LABEL[kind] ?? kind}</h4>
          ${group.map(
            (a) => html`<button name="handle" value="${a.handle}"
              class="${a.handle === chrome.current ? 'on' : ''}">
              ${avatar(a.displayName, true)} ${a.displayName}
            </button>`,
          )}`
      })}
    </form>
  </details>`
}

/**
 * Wiring for the composer.
 *
 * Every entry point into it is an ordinary link to `/issue`, upgraded here to
 * open the dialog in place. With scripting off the links still work and the
 * page they land on is the same markup, so the composer is an improvement on
 * the application rather than a requirement of it.
 *
 * Nothing here builds a form. The dialog fetches `/issue?fragment` and drops
 * in whatever comes back — a generated draft, the confirmation after it is
 * signed, or the draft again with an error on it. That keeps the modal and
 * the page rendering one template instead of two, which is the arrangement
 * the old generate-example button did not have: it filled inputs in the
 * client, and the client's idea of the field set drifted from the schema's
 * twice before anybody noticed.
 */
const COMPOSER_SCRIPT = `
(function () {
  var dlg = document.getElementById('composer')
  if (!dlg || !dlg.showModal) return
  var body = dlg.querySelector('.cbody')
  if (!body) return
  var RESTING = body.innerHTML

  function working(message) {
    body.innerHTML = RESTING
    var p = body.querySelector('.working p')
    if (p) p.textContent = message
  }

  function failed(message) {
    body.innerHTML = ''
    var box = document.createElement('div')
    box.className = 'empty'
    box.textContent = message
    var link = document.createElement('p')
    link.innerHTML = '<a href="/issue">Open the full page instead</a>'
    body.appendChild(box)
    body.appendChild(link)
  }

  // Whatever came back is live markup now: the draft's form has to submit
  // into the dialog rather than navigate, and a confirmation carries a bundle
  // that has to reach the browser's store before the visitor closes the box.
  function settle() {
    body.scrollTop = 0
    var out = body.querySelector('#out')
    if (out && window.f8130Keep) window.f8130Keep(out)
    var form = body.querySelector('form.draftform')
    if (!form) return
    form.addEventListener('submit', function (e) {
      e.preventDefault()
      working('Signing and publishing\u2026')
      send(fetch('/issue?fragment', { method: 'POST', body: new FormData(form) }),
           'Could not publish that certificate.')
    })
  }

  function send(pending, whenBroken) {
    pending.then(function (r) {
      // A 400 is the server handing back the draft with what went wrong on
      // it, which is a page worth showing. Anything else is not.
      if (!r.ok && r.status !== 400) throw new Error('bad status')
      return r.text()
    }).then(function (markup) {
      body.innerHTML = markup
      settle()
    }).catch(function () { failed(whenBroken) })
  }

  document.querySelectorAll('[data-compose]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault()
      dlg.showModal()
      working('Generating a synthetic 8130-3\u2026')
      // no-store: the URL never varies and every answer is a new certificate,
      // so a cached one is the last document handed back as if it were new.
      send(fetch('/issue?fragment', { cache: 'no-store' }),
           'Could not generate a certificate just now.')
    })
  })

  // Back to the loader on the way out, so the next open does not flash the
  // last visitor's certificate before its replacement arrives.
  dlg.addEventListener('close', function () { body.innerHTML = RESTING })
})()
`

/**
 * Dismissing the account switcher.
 *
 * It is a `details` element, which is the right markup — it works with
 * scripting off, it is a disclosure, and the browser handles the toggle. What
 * `details` does not do is close when you click away from it, because nothing
 * in the element's contract says it should. Every menu a visitor has ever used
 * does, so the absence reads as a bug rather than as a difference.
 *
 * Two ways out, matching what a menu normally offers: a click anywhere outside
 * and the Escape key. Escape returns focus to the summary, because a keyboard
 * user who dismisses a menu has otherwise lost their place in the page.
 */
const SWITCHER_SCRIPT = `
(function () {
  var me = document.querySelector('details.me')
  if (!me) return
  document.addEventListener('click', function (e) {
    if (me.open && !me.contains(e.target)) me.open = false
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && me.open) {
      me.open = false
      var s = me.querySelector('summary')
      if (s) s.focus()
    }
  })
})()
`

/**
 * Where a bundle lives, which is the visitor's browser and not this server.
 *
 * A bundle carries every nonce, so it opens every withheld block on the
 * record it belongs to. This service must therefore never store one — not to
 * be helpful, not for a moment. The rule holds here: bundles are written to
 * localStorage by the browser that was handed them, read back by the same
 * browser, and never sent anywhere except transiently to the /form endpoint
 * that folds the tree and returns the page.
 *
 * That is also a more honest demonstration than a server-side store would be.
 * An issuer can reopen a form they issued because *they hold the nonces*, not
 * because they are signed in. Nobody can grant that, and nobody can revoke it.
 *
 * Two jobs, and the page that used to list what is in here was a third. It is
 * gone; these are not. Keeping a bundle the moment it is handed over is the
 * only chance there is to keep it, and opening a record with one is what
 * holding it is *for*.
 */
const BUNDLES_SCRIPT = `
(function () {
  // Not renamed with the app. This key addresses documents already sitting in
  // people's browsers, and a bundle cannot be reissued — the nonces are not
  // recoverable from the commitment — so changing it would silently orphan
  // every document anyone is holding.
  var KEY = 'f8130.bundles' 
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch (e) { return {} }
  }
  function write(all) {
    try { localStorage.setItem(KEY, JSON.stringify(all)) } catch (e) {}
  }

  // Keep a bundle the moment it is handed over. It cannot be reconstructed.
  //
  // Exported rather than run once at load, because the composer is handed its
  // bundle after this script has finished: the confirmation arrives as markup
  // fetched into a dialog, and a document that is only stored on a full page
  // load is a document lost every time somebody uses the modal.
  window.f8130Keep = function (out) {
    if (!out || !out.dataset.uri) return
    var all = read()
    all[out.dataset.uri] = out.value
    write(all)
  }
  window.f8130Keep(document.getElementById('out'))

  // On a record page, open it if this browser happens to hold its bundle.
  var opener = document.getElementById('opener')
  if (opener && !opener.dataset.open) {
    var held = read()[opener.dataset.uri]
    if (held) {
      var f = document.getElementById('openWith')
      if (f) { f.elements['bundle'].value = held; f.submit() }
    }
  }
})()
`

export function layout(
  title: string,
  body: HtmlEscapedString | Promise<HtmlEscapedString>,
  mode: Mode = 'live',
  chrome?: Chrome,
) {
  const actors = chrome?.actors ?? []
  const me = actors.find((a) => a.handle === chrome?.current)
  const on = (key: NavKey) => (chrome?.active === key ? 'on' : '')
  const withComposer = actors.length > 0 && chrome?.composer !== false

  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · OffWing</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_URL}">
<style>${raw(STYLES)}</style>
</head>
<body>
<div class="marker">
  <strong>Note:</strong> This is a prototype for demonstration purposes only
  and is built with synthetic data.${mode === 'demo'
    ? html` <strong>Demo instance</strong> —
        <a href="/demo/bundles.json">sample documents</a>.`
    : ''}
</div>
<div class="app">
  <aside class="rail">
    <a class="brand" href="/">OffWing<br><span>FAA 8130-3 certificates on atproto</span></a>
    <!-- Each entry answers a different question. Feed: what is happening.
         Receiving: what is waiting on me. Issuers: who is publishing, and how
         much of it anybody has vouched for. Profile: what I have signed.

         Documents used to sit here — a list of the bundles this browser is
         holding. It was the first screen this project had, from before there
         was a feed to arrive on, and it had become the one entry that named a
         container rather than a question. The storage it listed is untouched:
         a browser still keeps every bundle it is handed, and a record page
         still opens itself with one. What went is the page that listed them.

         Two labels per entry, because a rail and a tab bar want different
         words. Both are in the markup rather than one derived from the other,
         so a screen reader gets a real label either way. -->
    <nav>
      <a href="/" class="${on('home')}"><span class="ico">◎</span>
        <span class="full">Feed</span><span class="tab">Feed</span></a>
      ${me
        ? html`<a href="/inbox" class="${on('inbox')}"><span class="ico">⤓</span>
            <span class="full">Receiving</span><span class="tab">Receiving</span>
            <!-- Always in the markup, hidden at zero, so the live stream has
                 something to write into rather than a node it has to create in
                 the right place in the rail. -->
            <span class="badge" id="waiting" ${chrome?.waiting ? '' : 'hidden'}
              >${chrome?.waiting ?? 0}</span>
          </a>`
        : ''}
      <a href="/parts" class="${on('issuers')}"><span class="ico">▤</span>
        <span class="full">Issuers</span><span class="tab">Issuers</span></a>
      <!-- Only when somebody is signed in, because the public is not an
           organization and has no repository to show. -->
      ${me
        ? html`<a href="/profile/${encodeURIComponent(me.handle)}"
            class="${on('profile')}"><span class="ico">☉</span>
            <span class="full">Profile</span><span class="tab">Profile</span></a>`
        : ''}
    </nav>
    ${actors.length > 0
      ? me
        ? html`<a href="/issue" class="newpost" ${withComposer ? 'data-compose' : ''}
            aria-label="Create release"><span class="full">Create release</span
            ><span class="tab">+</span></a>`
        : html`<span class="newpost off" title="The public cannot sign"
            ><span class="full">Create release</span><span class="tab">+</span></span>`
      : ''}
    ${actors.length > 0 ? identity(chrome!) : ''}
  </aside>
  <main>
    ${body}
  </main>
</div>
${withComposer ? composer() : ''}
${withComposer ? html`${raw(`<script>${COMPOSER_SCRIPT}</script>`)}` : ''}
${raw(`<script>${BUNDLES_SCRIPT}</script>`)}
${actors.length > 0 ? html`${raw(`<script>${SWITCHER_SCRIPT}</script>`)}` : ''}
</body>
</html>`
}
