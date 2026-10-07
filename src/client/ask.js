const panel = document.getElementById("panel")
let items = []
let currentId = null

load()
setInterval(load, 4000)

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

async function load() {
  try {
    const res = await fetch("/api/ask")
    if (res.status === 401) {
      location.href = "/login?next=/ask"
      return
    }
    if (!res.ok) throw new Error("bad")
    const data = await res.json()
    const previous = items
    items = data.items.map((item) => {
      const kept = previous.find((row) => row.id === item.id)
      if (!kept) return item
      return {
        ...item,
        draft: item.draft || kept.draft || null,
        drafting: kept.drafting,
        error: item.draft ? "" : kept.error || "",
      }
    })
    if (!items.length) currentId = null
    else if (!items.some((item) => item.id === currentId)) currentId = items[0].id
    paint()
  } catch {
    if (!items.length) {
      panel.replaceChildren(
        el("p", {}, ["Cannot reach the questions."]),
        el("button", { type: "button", class: "send", click: () => load() }, ["Try again"]),
      )
    }
  }
}

function current() {
  return items.find((item) => item.id === currentId) || null
}

function step(delta) {
  const index = items.findIndex((item) => item.id === currentId)
  const next = items[index + delta]
  if (!next) return
  currentId = next.id
  paint()
}

function paint() {
  const item = current()
  const signature = item ? [item.id, items.length, item.draft || "", item.error || "", item.drafting ? "1" : "0"].join("\n") : "empty"
  if (panel.dataset.sig === signature) return
  panel.dataset.sig = signature
  panel.replaceChildren()
  if (!item) {
    panel.append(el("p", { class: "empty" }, ["No Ask me anything questions yet."]))
    return
  }
  const index = items.findIndex((row) => row.id === item.id)
  panel.append(el("p", { class: "fine" }, [(index + 1) + " of " + items.length]))
  panel.append(el("p", { class: "who" }, [item.moniker]))
  panel.append(el("p", { class: "said" }, [item.body]))
  if (item.status === "pending") panel.append(el("p", { class: "fine" }, ["Not on the projector yet. Every phone can already read the reply."]))
  if (item.draft) {
    panel.append(el("p", { class: "kicker" }, ["Reply"]))
    panel.append(el("p", { class: "draft" }, [item.draft]))
    panel.append(el("p", { class: "fine" }, ["This is the reply on every phone."]))
  } else if (item.error === "nokey") panel.append(el("p", { class: "fine" }, ["A Gemini key is not on the server yet. You can still read the question."]))
  else if (item.error === "quota") panel.append(el("p", { class: "fine" }, ["Gemini is out of free answers for now. You can still read the question."]))
  else if (item.error) panel.append(el("p", { class: "fine" }, ["No draft this time."]))
  else panel.append(el("p", { class: "fine" }, ["Drafting a short answer."]))
  const prev = el("button", { type: "button" }, ["Previous"])
  const next = el("button", { type: "button" }, ["Next"])
  prev.disabled = index === 0
  next.disabled = index === items.length - 1
  prev.addEventListener("click", () => step(-1))
  next.addEventListener("click", () => step(1))
  panel.append(el("div", { class: "ask-nav" }, [prev, next]))
  if (item.draft || item.error) {
    const again = el("button", { type: "button", class: "regen" }, ["New draft"])
    again.addEventListener("click", () => fetchDraft(item, true))
    panel.append(again)
  }
  if (!item.draft && !item.drafting && !item.error) fetchDraft(item, false)
}

const inflight = new Map()

function rowById(id) {
  return items.find((row) => row.id === id)
}

async function fetchDraft(item, refresh) {
  const id = item.id
  const token = (inflight.get(id) || 0) + 1
  inflight.set(id, token)
  const start = rowById(id)
  if (start) {
    start.drafting = true
    start.error = ""
    if (refresh) start.draft = null
  }
  panel.dataset.sig = ""
  paint()
  try {
    const res = await fetch("/api/ask/" + id, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh }),
    })
    if (res.status === 401) {
      location.href = "/login?next=/ask"
      return
    }
    const data = await res.json().catch(() => ({}))
    if (inflight.get(id) !== token) return
    const row = rowById(id)
    if (!row) return
    row.drafting = false
    if (res.ok && data.draft) {
      row.draft = data.draft
      row.error = ""
    } else if (data.error === "nokey" || data.error === "quota") row.error = data.error
    else row.error = "draft"
  } catch {
    if (inflight.get(id) !== token) return
    const row = rowById(id)
    if (!row) return
    row.drafting = false
    row.error = "draft"
  }
  if (currentId === id) {
    panel.dataset.sig = ""
    paint()
  }
}

document.addEventListener("keydown", (event) => {
  if (event.target.closest("input, textarea")) return
  if (event.key === "ArrowLeft") step(-1)
  if (event.key === "ArrowRight") step(1)
})
