const boot = JSON.parse(document.getElementById("boot").textContent)
let questions = boot.questions
let selected = questions.some((q) => q.id === boot.featuredId) ? boot.featuredId : questions[0].id
let paused = boot.paused
let lastN = null
let liveGen = 0

init()

function el(tag, props, kids) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props || {})) {
    if (key === "class") node.className = value
    else if (key === "click") node.addEventListener("click", value)
    else if (value === false || value == null) continue
    else node.setAttribute(key, value === true ? "" : String(value))
  }
  for (const kid of kids || []) node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)))
  return node
}

function init() {
  renderDrawer()
  if (sessionStorage.getItem("booth-present") === "1") document.body.classList.add("present")
  updatePresentLabel()
  markDrawer()
  paintQuestion()
  pollCode()
  pollLive()
  setInterval(pollCode, 1000)
  setInterval(pollLive, 1000)
  wire()
}

function renderDrawer() {
  const list = document.getElementById("qlist")
  list.replaceChildren()
  questions.forEach((q, index) => {
    const who = q.audience === "team" ? "Team · " : ""
    list.append(el("button", { type: "button", click: () => select(q.id) }, [(index + 1) + "  " + who + q.title]))
  })
}

function markDrawer() {
  const buttons = document.querySelectorAll("#qlist button")
  buttons.forEach((button, index) => {
    const on = questions[index].id === selected
    button.classList.toggle("sel", on)
    button.setAttribute("aria-pressed", on ? "true" : "false")
  })
}

function appendMedia(parent, q, mode) {
  if (mode === "player" && q.video && q.video.vimeo) {
    const frame = el("div", { class: "video-frame" })
    const iframe = document.createElement("iframe")
    const start = Number(q.video.start) || 0
    const cue = Math.floor(start / 60) + "m" + (start % 60) + "s"
    iframe.src = "https://player.vimeo.com/video/" + encodeURIComponent(q.video.vimeo) + "?autoplay=1#t=" + cue
    iframe.title = q.video.title || "RoboCars Episode 1"
    iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture")
    iframe.setAttribute("allowfullscreen", "")
    iframe.referrerPolicy = "strict-origin-when-cross-origin"
    frame.append(iframe)
    parent.append(frame)
  }
  if (q.images && q.images.length) {
    const pair = el("div", { class: "vehicle-pair" })
    for (const image of q.images) {
      pair.append(el("figure", {}, [
        el("img", { src: image.src, alt: image.alt }),
        el("figcaption", {}, [image.label]),
      ]))
    }
    parent.append(pair)
  }
  if (q.more && q.more.href) {
    parent.append(el("p", { class: "fine" }, [
      el("a", { class: "more-link", href: q.more.href, target: "_blank", rel: "noopener noreferrer" }, [q.more.label]),
    ]))
  }
}

function paintQuestion() {
  const q = questions.find((item) => item.id === selected)
  const index = questions.findIndex((item) => item.id === selected)
  document.getElementById("which").textContent = (index + 1) + " · " + q.title
  const body = document.getElementById("qbody")
  body.replaceChildren(el("h1", { class: "prompt" }, [q.prompt]))
  body.append(el("p", { class: "fine" }, [
    q.audience === "team" ? "One phone per team. Agree, then send." : "Each person answers.",
  ]))
  if (q.kind === "multi") body.append(el("p", { class: "fine" }, ["Pick any that fit."]))
  if (q.kind === "open") body.append(el("p", { class: "fine" }, ["One short line."]))
  appendMedia(body, q, "player")
  for (const choice of q.choices) body.append(el("p", { class: "choice-line" }, [choice.label]))
  const live = document.getElementById("live")
  live.dataset.qid = ""
  live.dataset.feed = "pending"
}

async function select(id) {
  if (!questions.some((q) => q.id === id)) return
  selected = id
  markDrawer()
  paintQuestion()
  pollLive()
  try {
    const res = await fetch("/api/host/select", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId: id }),
    })
    if (res.status === 401) location.href = "/login?next=/host"
  } catch {
    setStatus("Reconnecting")
  }
  setList(false)
}

function ensureLive(q) {
  const live = document.getElementById("live")
  if (live.dataset.qid === q.id) return
  live.dataset.qid = q.id
  live.dataset.feed = "pending"
  live.replaceChildren(el("p", { class: "kicker" }, ["In the room"]))
  live.append(el("p", { class: "total", id: "total" }, [countLabel(q, 0)]))
  if (q.kind !== "open") {
    const rows = el("div", { id: "rows" })
    for (const choice of q.choices) {
      const fill = el("span", { class: "fill" })
      const row = el("div", { class: "vote" }, [
        el("div", { class: "vote-top" }, [
          el("span", { class: "vote-label" }, [choice.label]),
          el("span", { class: "vote-num" }, ["0"]),
        ]),
        el("div", { class: "track" }, [fill]),
      ])
      row.dataset.choice = choice.id
      rows.append(row)
    }
    if (q.kind === "multi") rows.append(el("p", { class: "fine" }, ["People can pick more than one."]))
    live.append(rows)
  }
  if (q.writes) {
    live.append(el("p", { class: "kicker feed-kicker" }, ["On the screen"]))
    live.append(el("div", { id: "feed" }))
  }
}

function countLabel(q, total) {
  const noun = q.audience === "team" ? (total === 1 ? "team" : "teams") : (total === 1 ? "person" : "people")
  return total + " " + noun
}

function paintLive(q, data) {
  ensureLive(q)
  document.getElementById("total").textContent = countLabel(q, data.total)
  for (const count of data.counts) {
    const row = document.querySelector('[data-choice="' + CSS.escape(count.choiceId) + '"]')
    if (!row) continue
    const pct = Math.round(count.share * 100)
    row.querySelector(".vote-num").textContent = count.count + " · " + pct + "%"
    row.querySelector(".fill").style.width = pct + "%"
  }
  const sig = data.comments.map((c) => c.id + ":" + (c.reply || "")).join(",")
  const live = document.getElementById("live")
  if (live.dataset.feed === sig) return
  live.dataset.feed = sig
  const feed = document.getElementById("feed")
  if (!feed) return
  feed.replaceChildren()
  if (!data.comments.length) {
    feed.append(el("p", { class: "fine" }, [q.live ? "Lines show up as they come in." : "Approved comments will show up here."]))
    return
  }
  for (const comment of data.comments) {
    const kids = [
      el("p", { class: "who" }, [comment.moniker]),
      el("p", {}, [comment.body]),
    ]
    if (comment.reply) {
      kids.push(el("div", { class: "reply" }, [
        el("p", { class: "kicker" }, ["Reply"]),
        el("p", {}, [comment.reply]),
      ]))
    }
    feed.append(el("article", { class: "note" }, kids))
  }
}

async function pollLive() {
  const gen = ++liveGen
  const id = selected
  try {
    const res = await fetch("/api/host/live?questionId=" + encodeURIComponent(id))
    if (gen !== liveGen) return
    if (res.status === 401) {
      location.href = "/login?next=/host"
      return
    }
    if (!res.ok) return
    const data = await res.json()
    if (gen !== liveGen || data.questionId !== selected) return
    paintLive(questions.find((item) => item.id === selected), data)
    setStatus("")
  } catch {
    setStatus("Reconnecting")
  }
}

async function pollCode() {
  try {
    const query = lastN ? "?n=" + encodeURIComponent(lastN) : ""
    const res = await fetch("/api/host/code" + query)
    if (res.status === 401) {
      location.href = "/login?next=/host"
      return
    }
    if (!res.ok) return
    const data = await res.json()
    paused = Boolean(data.paused)
    document.getElementById("paused").hidden = !paused
    document.getElementById("pause").textContent = paused ? "Resume answers" : "Pause answers"
    document.getElementById("waiting").textContent = data.waiting ? "Waiting for review: " + data.waiting : "Review queue clear"
    if (data.svg && data.n && data.n !== lastN) {
      const parsed = new DOMParser().parseFromString(data.svg, "image/svg+xml")
      const svg = parsed.documentElement
      if (svg && svg.tagName.toLowerCase() === "svg") {
        document.getElementById("qr").replaceChildren(document.importNode(svg, true))
        lastN = data.n
      }
    }
    setStatus("")
  } catch {
    setStatus("Reconnecting")
  }
}

function setStatus(text) {
  document.getElementById("status").textContent = text
}

function updatePresentLabel() {
  const on = document.body.classList.contains("present")
  const button = document.getElementById("present")
  button.textContent = on ? "Edit" : "Present"
  button.setAttribute("aria-pressed", on ? "true" : "false")
}

function setList(open) {
  document.body.classList.toggle("list-open", open)
  document.getElementById("drawer").classList.toggle("open", open)
  const button = document.getElementById("questions")
  button.textContent = open ? "Close" : "Questions"
  button.setAttribute("aria-expanded", open ? "true" : "false")
}

function setPresent(on) {
  document.body.classList.toggle("present", on)
  sessionStorage.setItem("booth-present", on ? "1" : "0")
  if (on) setList(false)
  updatePresentLabel()
}

function wire() {
  document.getElementById("present").addEventListener("click", () => {
    setPresent(!document.body.classList.contains("present"))
  })
  document.getElementById("questions").addEventListener("click", () => {
    const open = document.body.classList.contains("list-open")
    if (!open) setPresent(false)
    setList(!open)
  })
  document.getElementById("close-list").addEventListener("click", () => setList(false))
  document.getElementById("edge").addEventListener("click", () => {
    if (document.body.classList.contains("present")) return
    setList(!document.body.classList.contains("list-open"))
  })
  document.getElementById("pause").addEventListener("click", async () => {
    try {
      const res = await fetch("/api/host/pause", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused: !paused }),
      })
      if (res.status === 401) location.href = "/login?next=/host"
      else pollCode()
    } catch {
      setStatus("Reconnecting")
    }
  })
  document.getElementById("clear").addEventListener("click", async () => {
    if (!window.confirm("Erase every vote, comment, and name? The questions stay.")) return
    try {
      const res = await fetch("/api/host/clear", { method: "POST" })
      if (res.status === 401) {
        location.href = "/login?next=/host"
        return
      }
      if (!res.ok) {
        setStatus("Could not clear")
        return
      }
      paintQuestion()
      pollLive()
      pollCode()
      setStatus("Cleared")
    } catch {
      setStatus("Reconnecting")
    }
  })
  document.getElementById("revoke").addEventListener("click", async () => {
    if (!window.confirm("Cut off the printed code and the one on the screen? Phones that already scanned keep working until their time runs out. A new sheet would need to be printed.")) return
    try {
      const res = await fetch("/api/host/revoke", { method: "POST" })
      if (res.status === 401) location.href = "/login?next=/host"
      lastN = null
      pollCode()
    } catch {
      setStatus("Reconnecting")
    }
  })
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setList(false)
      return
    }
    if (event.target.closest("input, textarea")) return
    if (event.key < "1" || event.key > String(questions.length)) return
    const q = questions[Number(event.key) - 1]
    if (q) select(q.id)
  })
}
