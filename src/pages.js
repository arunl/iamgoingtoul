import { readFileSync } from "node:fs"
import { mediaFor } from "./questions.js"
import { esc } from "./text.js"

const css = readFileSync(new URL("./client/booth.css", import.meta.url), "utf8")
const playJs = readFileSync(new URL("./client/play.js", import.meta.url), "utf8")
const hostJs = readFileSync(new URL("./client/host.js", import.meta.url), "utf8")
const modJs = readFileSync(new URL("./client/mod.js", import.meta.url), "utf8")
const askJs = readFileSync(new URL("./client/ask.js", import.meta.url), "utf8")

function layout({ title, bodyClass, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect fill='%23CE1126' width='16' height='16'/%3E%3C/svg%3E">
<style>${css}</style>
</head>
<body class="${esc(bodyClass)}">
${body}
</body>
</html>`
}

function bootScript(data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c")
  return `<script type="application/json" id="boot">${json}</script>`
}

function mediaHtml(question) {
  const media = mediaFor(question.id)
  const figures = media.images.length
    ? `<div class="vehicle-pair">${media.images
        .map(
          (image) =>
            `<figure><img src="${esc(image.src)}" alt="${esc(image.alt)}"><figcaption>${esc(image.label)}</figcaption></figure>`,
        )
        .join("")}</div>`
    : ""
  const more = media.more
    ? `<p class="fine"><a class="more-link" href="${esc(media.more.href)}" target="_blank" rel="noopener noreferrer">${esc(media.more.label)}</a></p>`
    : ""
  return figures + more
}

export function browsePage(questions) {
  const articles = questions
    .map((question) => {
      const who = question.audience === "team" ? "One phone per team." : "Each person answers."
      const extra = question.kind === "multi" ? " Pick any that fit." : question.kind === "open" ? " One short line." : ""
      const note = `<p class="fine">${who}${extra}</p>`
      const choices = question.choices.length
        ? `<ul>${question.choices.map((choice) => `<li>${esc(choice.label)}</li>`).join("")}</ul>`
        : `<p class="fine">A short written question.</p>`
      return `<article class="q"><p class="kicker">${question.position}</p><h2>${esc(question.prompt)}</h2>${note}${mediaHtml(question)}${choices}</article>`
    })
    .join("")
  return layout({
    title: "Class check-in",
    bodyClass: "browse",
    body: `<header class="wrap head">
  <p class="kicker">University of Louisiana at Lafayette</p>
  <h1 class="lockup">Class check-in <img class="ul-mark" src="/media/ul-lafayette.png" alt="UL Lafayette"></h1>
  <p class="sub">A few minutes on your phone. The screen shows the room.</p>
</header>
<div class="wrap">
  <p class="gate">Scan the code on the screen to answer.</p>
  ${articles}
  <p class="fine">School of Computing and Informatics</p>
</div>`,
  })
}

function clockLabel(expiresAt) {
  const sec = Math.max(0, Math.round((expiresAt - Date.now()) / 1000))
  if (sec > 90 * 60) return "Good for today"
  const text = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0")
  return sec > 0 ? `${text} left` : "Scan the code again"
}

export function playPage(boot) {
  return layout({
    title: "Answer · Class check-in",
    bodyClass: "play",
    body: `<div class="wrap">
  <header class="top">
    <div>
      <p class="lockup site-name">Class check-in <img class="ul-mark" src="/media/ul-lafayette.png" alt="UL Lafayette"></p>
      <p class="you">You are <strong>${esc(boot.moniker)}</strong></p>
      <form id="team-form" class="team-form">
        <label for="team">Team</label>
        <input id="team" maxlength="40" autocomplete="off" placeholder="Team name" value="${esc(boot.team || "")}">
        <button type="submit">Save</button>
      </form>
    </div>
    <p class="timer" id="timer">${esc(clockLabel(boot.expiresAt))}</p>
  </header>
  <p class="fine" id="team-note"></p>
  <p class="fine" id="onscreen"></p>
  <nav class="nav" id="qnav"></nav>
  <main id="panel"></main>
  <noscript><p class="gate">Turn on JavaScript to send an answer.</p></noscript>
</div>
${bootScript(boot)}
<script>${playJs}</script>`,
  })
}

export function hostPage(boot, publicHost) {
  return layout({
    title: "Host · Class check-in",
    bodyClass: "host",
    body: `<div class="edge" id="edge"></div>
<aside class="drawer" id="drawer">
  <button type="button" class="close-list" id="close-list">Close</button>
  <p class="kicker">Questions</p>
  <div id="qlist"></div>
  <p class="fine">Keys 1–${boot.questions.length}. Choosing one closes this list.</p>
</aside>
<div class="host-shell">
  <header class="topbar">
    <span id="which"></span>
  </header>
  <div class="stage">
    <section class="question">
      <div class="qtext">
        <p id="paused" class="paused" hidden>Answers are paused</p>
        <div id="qbody"></div>
      </div>
    </section>
    <aside class="live" id="live"></aside>
  </div>
  <footer class="hostbar">
    <button type="button" id="questions">Questions</button>
    <button type="button" id="present">Present</button>
    <button type="button" id="pause">Pause answers</button>
    <button type="button" id="revoke">Revoke codes</button>
    <button type="button" id="clear">Clear answers</button>
    <span class="grow"></span>
    <span id="waiting"></span>
    <span id="status" class="status"></span>
  </footer>
</div>
<div class="qr-block">
  <p class="lockup booth-mark">Class check-in <img class="ul-mark" src="/media/ul-lafayette.png" alt="UL"></p>
  <div id="qr"></div>
  <p class="scan">Scan to answer</p>
  <p class="clock" id="clock">Same code all day</p>
  <p class="fine"><a href="/print">Print this code</a> · ${esc(publicHost)}</p>
</div>
${bootScript(boot)}
<script>${hostJs}</script>
<noscript><p class="gate">This screen needs JavaScript to show the code.</p></noscript>`,
  })
}

export function modPage() {
  return layout({
    title: "Review · Class check-in",
    bodyClass: "mod",
    body: `<div class="wrap">
  <nav class="jumps"><a href="/mod" aria-current="page">Review</a><a href="/ask">Answers</a></nav>
  <p class="kicker">UL Lafayette</p>
  <h1>Review</h1>
  <p class="fine">Approved lines go on the projector. Rejected lines stay off it. The vote counts either way. Take off screen pulls one line back down.</p>
  <div id="panel"></div>
</div>
<script>${modJs}</script>`,
  })
}

export function askPage() {
  return layout({
    title: "Answers · Class check-in",
    bodyClass: "ask",
    body: `<div class="wrap">
  <nav class="jumps"><a href="/mod">Review</a><a href="/ask" aria-current="page">Answers</a></nav>
  <p class="kicker">UL Lafayette</p>
  <h1>Answers</h1>
  <p class="fine">One Ask me anything question at a time. The reply goes on every phone. It will not invent credits, fees, or deadlines.</p>
  <div id="panel"></div>
</div>
<script>${askJs}</script>`,
  })
}

export function loginPage(error, next) {
  const alert = error ? `<p class="error">${esc(error)}</p>` : ""
  return layout({
    title: "Sign in · Class check-in",
    bodyClass: "login",
    body: `<div class="wrap">
  <p class="kicker">UL Lafayette</p>
  <h1>Host sign in</h1>
  <p class="fine">For the projector.</p>
  ${alert}
  <form method="post" action="/login">
    <input type="hidden" name="next" value="${esc(next)}">
    <label for="password">Password</label>
    <div class="password-row">
      <input id="password" type="password" name="password" autocomplete="current-password" autofocus required>
      <button type="button" class="show-password" id="show-password" aria-controls="password" aria-pressed="false">Show</button>
    </div>
    <button class="send" type="submit">Enter</button>
  </form>
  <script>
    document.getElementById("show-password").addEventListener("click", function () {
      var input = document.getElementById("password")
      var show = input.type === "password"
      input.type = show ? "text" : "password"
      this.textContent = show ? "Hide" : "Show"
      this.setAttribute("aria-pressed", show ? "true" : "false")
      input.focus()
    })
  </script>
</div>`,
  })
}

export function printPage({ svg, url }) {
  return layout({
    title: "Print the code · Class check-in",
    bodyClass: "print-sheet",
    body: `<div class="sheet">
  <p class="lockup booth-mark">Class check-in <img class="ul-mark" src="/media/ul-lafayette.png" alt="UL"></p>
  <div class="print-qr">${svg}</div>
  <p class="scan">Scan to answer</p>
  <p class="fine url">${esc(url)}</p>
  <p class="noprint"><button type="button" class="send" onclick="window.print()">Print</button></p>
  <p class="fine noprint">This code stays the same all day. Revoke codes on the projector makes this sheet stop working.</p>
</div>`,
  })
}

export function messagePage(title, text) {
  return layout({
    title: `${title} · Class check-in`,
    bodyClass: "browse",
    body: `<div class="wrap narrow">
  <p class="kicker">UL Lafayette</p>
  <h1>${esc(title)}</h1>
  <p>${esc(text)}</p>
</div>`,
  })
}
