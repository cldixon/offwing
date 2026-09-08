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

/**
 * What the site is, in one line.
 *
 * Here rather than inline in the markup because it is used three times: under
 * the brand, as the page description a search engine or a chat client shows,
 * and nowhere else it may drift from.
 */
const TAGLINE = 'FAA 8130-3 certificates on atproto'

/**
 * The tab icon: a swept wing in safety yellow, drawn rather than fetched.
 *
 * A data URI keeps the promise the stylesheet makes — a page is one request,
 * with the fonts as the single exception — and a favicon that 404s is the
 * first thing a browser tells a visitor about a site.
 */
const FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="5" fill="#f2c318"/>' +
      '<path d="M4 22 28 7l-9 15z" fill="#1d1f23"/>' +
      '</svg>',
  )

export type Mode = 'demo' | 'live'

/** Which rail entry is lit. */
export type NavKey = 'home' | 'inbox' | 'issuers' | 'profile' | 'about' | null

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

  /* The navigation, one icon per question. These used to be Unicode glyphs —
     ◎ ⤓ ▤ ☉ — which render at whatever weight and baseline each platform
     happens to have for them, and on a phone they were the largest thing in
     the tab bar and the least legible. Lucide paths sit on the same 24-unit
     box and 2-unit stroke as every other icon here, so the bar is drawn in
     one hand. */
  // radio-tower: what is being published. The rss mark reads as a wifi
  // symbol, which is a connection rather than a broadcast.
  feed:
    '<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/>' +
    '<path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/>' +
    '<circle cx="12" cy="9" r="2"/>' +
    '<path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/>' +
    '<path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/>' +
    '<path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/>',
  // inbox: what is waiting on me
  inbox:
    '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>' +
    '<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  // list: who is publishing, and how much of it anybody has checked
  list:
    '<path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>' +
    '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/>',
  // factory: an organization's own page. Every account here is a shop, a
  // manufacturer, an airline or a broker — never a person.
  factory:
    '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>' +
    '<path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/>',
  // plus: the primary action, on the compose row and the phone's floating button
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  // info: what this whole thing is
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  // sun / moon: the theme toggle shows the theme it would switch to
  sun:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/>' +
    '<path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/>' +
    '<path d="M2 12h2"/><path d="M20 12h2"/>' +
    '<path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
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
 * What this is, in four paragraphs.
 *
 * Here rather than in views.ts because the navigation entry that leads to it
 * is in this file, and because it is the shell's answer to a question the
 * shell raises: a visitor who arrives on the feed with no idea what a release
 * certificate is has nothing else to read — the rail's tagline names the
 * subject and does not explain the problem.
 */
export function aboutProse() {
  return html`<h2>The problem</h2>
    <p>
      A part arrives in a crate with a certificate. The fraud that matters in
      aviation parts is not somebody editing a shared record — it is a document
      attributed to a real, reputable repair station that never issued it.
    </p>
    <h2>What this does about it</h2>
    <p>
      A station's handle is its own DNS-verified domain, and its records are
      signed by keys in its own identity document. A release certificate counts
      as real only when a matching record sits in that station's own
      repository. Forging one takes the station's domain <em>and</em> its
      signing key, not a PDF editor.
    </p>
    <h2>Without publishing the shop's business</h2>
    <p>
      What the shop did and what it found never reach the network. The public
      record carries only what identifies the document, plus a single hash over
      the whole of it; the rest travels with the part, exactly as paperwork does
      today. Anyone can check who signed. Nobody learns what was done.
    </p>
    <h2>And none of it is real</h2>
    <p>
      Every organization, part number and certificate here is invented. This is
      a demonstration of a protocol, not an airworthiness system, and a green
      check on this site says a signature held — never that a part is safe to
      fit. The <a href="https://github.com/cldixon/offwing">project README</a>
      works the whole scheme through.
    </p>`
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

/**
 * The stored theme, applied before the page paints.
 *
 * In the head and synchronous on purpose. Everything else in this file loads
 * at the foot of the body, but a theme applied after the first paint is a
 * white page flashing at somebody who chose dark, which is worse than not
 * offering the choice.
 *
 * It stamps the attribute only when there is a stored choice. With none, no
 * attribute is set and tokens.css follows the system — including when the
 * reader's system flips from light to dark while the page is open, which a
 * stamped attribute would freeze.
 */
const THEME_BOOT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('offwing.theme')
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
  } catch (e) {}
})()
`

/**
 * The theme toggle.
 *
 * The button ships hidden and this reveals it, so a visitor with scripting off
 * is not offered a control that cannot work — they keep the system-following
 * behaviour, which is the same thing everybody had before the toggle existed.
 *
 * The first press has to decide what "the other one" means when nothing has
 * been chosen yet, and the honest answer is whatever the reader is currently
 * looking at: the attribute if one is set, and the system preference if not.
 */
const THEME_SCRIPT = `
(function () {
  var btn = document.getElementById('theme')
  if (!btn) return
  var root = document.documentElement
  btn.hidden = false
  btn.addEventListener('click', function () {
    var dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    var next = dark ? 'light' : 'dark'
    root.dataset.theme = next
    try { localStorage.setItem('offwing.theme', next) } catch (e) {}
  })
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
<title>${title} - OffWing</title>
<meta name="description" content="${TAGLINE}">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_URL}">
<style>${raw(STYLES)}</style>
${raw(`<script>${THEME_BOOT_SCRIPT}</script>`)}
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
    <!-- The brand and what the site is. One block, because on a phone the
         rail is a top bar and these have to lay themselves out as a grid;
         .mark is display:contents there so its children become the grid's
         own items. -->
    <div class="mark">
      <a class="brand" href="/">OffWing</a>
      <p class="tagline">${TAGLINE}</p>
    </div>
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
      <a href="/" class="${on('home')}"><span class="ico">${icon('feed')}</span>
        <span class="full">Feed</span><span class="tab">Feed</span></a>
      ${me
        ? html`<a href="/inbox" class="${on('inbox')}"><span class="ico">${icon('inbox')}</span>
            <span class="full">Receiving</span><span class="tab">Receiving</span>
            <!-- Always in the markup, hidden at zero, so the live stream has
                 something to write into rather than a node it has to create in
                 the right place in the rail. -->
            <span class="badge" id="waiting" ${chrome?.waiting ? '' : 'hidden'}
              >${chrome?.waiting ?? 0}</span>
          </a>`
        : ''}
      <a href="/parts" class="${on('issuers')}"><span class="ico">${icon('list')}</span>
        <span class="full">Issuers</span><span class="tab">Issuers</span></a>
      <!-- Only when somebody is signed in, because the public is not an
           organization and has no repository to show. -->
      ${me
        ? html`<a href="/profile/${encodeURIComponent(me.handle)}"
            class="${on('profile')}"><span class="ico">${icon('factory')}</span>
            <span class="full">Profile</span><span class="tab">Profile</span></a>`
        : ''}
      <!-- Last, and a destination rather than a dialog. It was an icon
           floating between the tagline and the navigation, which is a place
           nobody looks; the one screen that says what any of this is for
           should be somewhere a visitor is already reading. -->
      <a href="/about" class="${on('about')}"><span class="ico">${icon('info')}</span>
        <span class="full">What this is</span><span class="tab">About</span></a>
    </nav>
    ${actors.length > 0
      ? me
        ? html`<a href="/issue" class="newpost" ${withComposer ? 'data-compose' : ''}
            aria-label="Create release"><span class="full">Create release</span
            ><span class="tab">${icon('plus')}</span></a>`
        : html`<span class="newpost off" title="The public cannot sign"
            ><span class="full">Create release</span
            ><span class="tab">${icon('plus')}</span></span>`
      : ''}
    <!-- The foot of the rail: the two things that are about this reader
         rather than about the network — who they are acting as, and which
         theme to paint it in — under one rule, away from the pages. On a
         phone this is display:contents so both become items of the top bar's
         grid.

         The switch is hidden until the script that makes it work has run: a
         control that does nothing is worse than one that is not there. Both
         faces are in the markup and the stylesheet shows the one that is not
         currently painted, which is the theme it would switch to. -->
    <div class="railfoot">
      ${actors.length > 0 ? identity(chrome!) : ''}
      <button type="button" class="themeswitch" id="theme" hidden
        title="Switch between light and dark"
        aria-label="Switch between light and dark"
        ><span class="t-moon">${icon('moon')}<span class="label">Dark</span></span
        ><span class="t-sun">${icon('sun')}<span class="label">Light</span></span
      ></button>
    </div>
  </aside>
  <main>
    ${body}
  </main>
</div>
${withComposer ? composer() : ''}
${withComposer ? html`${raw(`<script>${COMPOSER_SCRIPT}</script>`)}` : ''}
${raw(`<script>${THEME_SCRIPT}</script>`)}
${raw(`<script>${BUNDLES_SCRIPT}</script>`)}
${actors.length > 0 ? html`${raw(`<script>${SWITCHER_SCRIPT}</script>`)}` : ''}
</body>
</html>`
}
