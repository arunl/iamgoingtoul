const boot = JSON.parse(document.getElementById("boot").textContent)
let questions = boot.questions
let featuredId = boot.featuredId
let expiresAt = boot.expiresAt
let teamName = boot.team || ""
let currentId = questions.some((q) => q.id === featuredId) ? featuredId : questions[0].id
let viewGen = 0
let resultTimer = null

const panel = document.getElementById("panel")
const nav = document.getElementById("qnav")
const timer = document.getElementById("timer")
const onscreen = document.getElementById("onscreen")
const teamInput = document.getElementById("team")
const teamNote = document.getElementById("team-note")
const teamForm = document.getElementById("team-form")

init()

function init() {
  paintTeam()
  teamForm.addEventListener("submit", saveTeam)
  renderNav()
  renderOnScreen()
  showCurrent()
  tick()
  setInterval(tick, 1000)
  setInterval(refreshMeta, 3000)
}

function paintTeam() {
  teamInput.value = teamName
  teamNote.textContent = teamName
    ? "Team questions use " + teamName + ". One phone sends those."
    : "Save your team name before the team questions. One phone sends those."
}

async function saveTeam(event) {
  event.preventDefault()
  const name = teamInput.value.replace(/\s+/g, " ").trim()
  if (!name) {
    teamNote.textContent = "Type your team name, then save it."
    return
  }
  try {
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    })
    if (res.status === 401) {
      location.href = "/"
      return
    }
    const data = await res.json().catch(() => ({}))
    if (res.status === 409) {
      teamNote.textContent = "The team name stays put after a team answer is sent."
      return
    }
    if (!res.ok) {
      teamNote.textContent = "Use a team name of 40 characters or fewer."
      return
    }
    teamName = data.team || name
    paintTeam()
  } catch {
    teamNote.textContent = "The network dropped. Save the team name again."
  }
}

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

function fmt(sec) {
  const safe = Math.max(0, sec | 0)
  return Math.floor(safe / 60) + ":" + String(safe % 60).padStart(2, "0")
}

function tick() {
  const sec = Math.round((expiresAt - Date.now()) / 1000)
  timer.textContent = sec > 90 * 60 ? "Good for today" : sec > 0 ? fmt(sec) + " left" : "Scan the code again"
  timer.classList.toggle("out", sec <= 0)
}

function questionById(id) {
  return questions.find((q) => q.id === id)
}

function renderOnScreen() {
  const q = questionById(featuredId)
  onscreen.textContent = q ? "On screen now: " + q.title : ""
}

function renderNav() {
  nav.replaceChildren()
  for (const q of questions) {
    const button = el("button", {
      type: "button",
      class: [q.id === currentId ? "sel" : "", q.answered ? "done" : ""].filter(Boolean).join(" "),
      click: () => openQuestion(q.id),
    }, [q.title])
    if (q.id === currentId) button.setAttribute("aria-current", "true")
    nav.append(button)
  }
}

function openQuestion(id) {
  currentId = id
  renderNav()
  showCurrent()
  const current = nav.querySelector("[aria-current='true']")
  if (current) current.scrollIntoView({ inline: "center", block: "nearest" })
}

function showCurrent() {
  viewGen += 1
  const gen = viewGen
  if (resultTimer) {
    clearInterval(resultTimer)
    resultTimer = null
  }
  const q = questionById(currentId)
  if (!q) return
  if (q.answered) renderResults(q, gen)
  else renderForm(q)
}

function appendMedia(parent, q) {
  if (q.video && q.video.vimeo) {
    const start = Number(q.video.start) || 0
    const cue = Math.floor(start / 60) + "m" + (start % 60) + "s"
    const href = "https://vimeo.com/" + encodeURIComponent(q.video.vimeo) + "?autoplay=1#t=" + cue
    parent.append(el("p", { class: "fine" }, [
      el("a", { class: "more-link", href, target: "_blank", rel: "noopener noreferrer" }, [q.video.title || "Watch the film"]),
    ]))
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

function renderForm(q) {
  panel.dataset.qid = ""
  panel.dataset.sig = ""
  const picked = new Set()
  panel.replaceChildren()
  panel.append(el("p", { class: "kicker" }, [(q.audience === "team" ? "Team · " : "You · ") + q.title]))
  panel.append(el("h1", {}, [q.prompt]))
  if (q.audience === "team") panel.append(el("p", { class: "fine" }, ["Agree, then one phone on the team sends this."]))
  else panel.append(el("p", { class: "fine" }, ["Each person answers."]))
  if (q.kind === "multi") panel.append(el("p", { class: "fine" }, ["Pick any that fit."]))
  appendMedia(panel, q)

  const error = el("p", { class: "error" }, [""])
  const buttons = []
  if (q.choices.length) {
    const choiceBox = el("div", { class: "choices" })
    for (const choice of q.choices) {
      const button = el("button", { type: "button" }, [choice.label])
      button.setAttribute("aria-pressed", "false")
      button.addEventListener("click", () => {
        if (q.kind === "single") {
          picked.clear()
          picked.add(choice.id)
        } else if (picked.has(choice.id)) picked.delete(choice.id)
        else picked.add(choice.id)
        for (const item of buttons) item.button.setAttribute("aria-pressed", picked.has(item.id) ? "true" : "false")
        error.textContent = ""
      })
      buttons.push({ id: choice.id, button })
      choiceBox.append(button)
    }
    panel.append(choiceBox)
  }

  let field = null
  if (q.writes) {
    field = document.createElement("textarea")
    field.maxLength = 140
    field.rows = q.kind === "open" ? 3 : 2
    field.placeholder = q.hint || "A few words"
    const counter = el("p", { class: "fine" }, ["140"])
    field.addEventListener("input", () => {
      counter.textContent = String(140 - field.value.length)
    })
    panel.append(el("label", { class: "field" }, [
      el("span", {}, [q.kind === "open" ? "One line" : "Other tool"]),
      field,
      counter,
    ]))
    panel.append(el("p", { class: "fine" }, [
      q.live ? "This shows on the screen as soon as you send it." : "Reviewed before it can show on the screen.",
    ]))
  }
  const send = el("button", { type: "button", class: "send" }, ["Send answer"])
  send.addEventListener("click", () => submit(q, picked, field, error, send))
  panel.append(error)
  panel.append(send)
}

async function submit(q, picked, field, error, send) {
  if (expiresAt <= Date.now()) {
    error.textContent = "Scan the code again."
    return
  }
  if (q.audience === "team" && !teamName) {
    error.textContent = "Save your team name at the top first."
    return
  }
  const choiceIds = [...picked]
  const comment = field ? field.value.replace(/\s+/g, " ").trim() : ""
  if (q.kind === "open" && !comment) {
    error.textContent = "Write one line first."
    return
  }
  if (q.kind === "single" && choiceIds.length !== 1) {
    error.textContent = "Pick one first."
    return
  }
  if (q.kind === "multi" && choiceIds.length < 1) {
    error.textContent = "Pick at least one."
    return
  }
  send.disabled = true
  try {
    const res = await fetch("/api/answers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId: q.id, choiceIds, comment }),
    })
    if (res.status === 401) {
      location.href = "/"
      return
    }
    if (res.status === 403) {
      const data = await res.json().catch(() => ({}))
      error.textContent = data.error === "paused" ? "Answers are paused. Watch the screen." : "That answer was not accepted."
      send.disabled = false
      return
    }
    if (res.status === 400) {
      const data = await res.json().catch(() => ({}))
      error.textContent = data.error === "noteam"
        ? "Save your team name at the top first."
        : data.error === "long"
          ? "Keep it to 140 characters."
          : "Try that again."
      send.disabled = false
      return
    }
    if (res.status === 429) {
      error.textContent = "Too many phones on this network just answered. Wait a moment and send again."
      send.disabled = false
      return
    }
    if (res.ok || res.status === 409) {
      q.answered = true
      renderNav()
      showCurrent()
      return
    }
    error.textContent = "Try that again."
    send.disabled = false
  } catch {
    error.textContent = "The network dropped. Try again."
    send.disabled = false
  }
}

async function renderResults(q, gen) {
  panel.replaceChildren(el("p", { class: "fine" }, ["Loading the room."]))
  async function pull() {
    try {
      const res = await fetch("/api/questions/" + encodeURIComponent(q.id) + "/results")
      if (gen !== viewGen) return
      if (res.status === 401) {
        location.href = "/"
        return
      }
      if (!res.ok) return
      const data = await res.json()
      if (gen !== viewGen) return
      paintResults(q, data)
    } catch {
      if (gen !== viewGen) return
    }
  }
  await pull()
  if (gen !== viewGen) return
  resultTimer = setInterval(pull, 2000)
}

function paintResults(q, data) {
  const sig = [data.total, ...data.comments.map((c) => c.moniker + "\n" + c.body + "\n" + (c.reply || ""))].join("\n")
  if (panel.dataset.qid === q.id && panel.dataset.sig === sig) return
  panel.dataset.qid = q.id
  panel.dataset.sig = sig
  panel.replaceChildren()
  panel.append(el("p", { class: "kicker" }, [(q.audience === "team" ? "Team · " : "You · ") + q.title]))
  panel.append(el("h1", {}, [q.prompt]))
  panel.append(el("p", { class: "total" }, [countLabel(q, data.total)]))
  if (q.kind !== "open") {
    for (const count of data.counts) {
      const pct = Math.round(count.share * 100)
      const fill = el("span", { class: "fill" })
      fill.style.width = pct + "%"
      panel.append(el("div", { class: "vote" }, [
        el("div", { class: "vote-top" }, [
          el("span", {}, [count.label]),
          el("span", {}, [count.count + " · " + pct + "%"]),
        ]),
        el("div", { class: "track" }, [fill]),
      ]))
    }
  }
  if (data.reveal) {
    panel.append(el("div", { class: "reveal" }, [
      el("p", { class: "kicker" }, ["From the lab"]),
      el("p", {}, [data.reveal]),
    ]))
  }
  if (q.writes) {
  panel.append(el("p", { class: "kicker" }, ["From the room"]))
  if (!data.comments.length) {
    panel.append(el("p", { class: "fine" }, [q.live ? "Lines show up as they come in." : "Comments show up here after they are reviewed."]))
  } else {
    for (const comment of data.comments) {
      const kids = [
        el("p", { class: "who" }, [comment.mine ? "You" : comment.moniker]),
        el("p", {}, [comment.body]),
      ]
      if (comment.reply) {
        kids.push(el("div", { class: "reply" }, [
          el("p", { class: "kicker" }, ["Reply"]),
          el("p", {}, [comment.reply]),
        ]))
      }
      panel.append(el("article", { class: "note" }, kids))
    }
  }
  }
  panel.append(el("button", { type: "button", class: "send", click: () => openQuestion(nextUnanswered(q.id)) }, ["Next question"]))
}

function countLabel(q, total) {
  const noun = q.audience === "team" ? (total === 1 ? "team" : "teams") : (total === 1 ? "person" : "people")
  return total + " " + noun
}

function nextUnanswered(fromId) {
  const start = questions.findIndex((item) => item.id === fromId)
  for (let step = 1; step <= questions.length; step++) {
    const q = questions[(start + step) % questions.length]
    if (!q.answered) return q.id
  }
  return questions[(start + 1) % questions.length].id
}

async function refreshMeta() {
  try {
    const res = await fetch("/api/questions")
    if (res.status === 401) {
      location.href = "/"
      return
    }
    if (!res.ok) return
    const data = await res.json()
    featuredId = data.featuredId
    if (data.expiresAt) expiresAt = data.expiresAt
    let flipped = false
    for (const incoming of data.questions) {
      const q = questionById(incoming.id)
      if (!q || !incoming.answered || q.answered) continue
      q.answered = true
      if (q.id === currentId) flipped = true
    }
    renderNav()
    renderOnScreen()
    if (flipped) showCurrent()
  } catch {
    // Keep the page the student already has.
  }
}
