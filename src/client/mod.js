const panel = document.getElementById("panel")
let waitTimer = null
let shown = []

load()

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
  clearTimeout(waitTimer)
  try {
    const res = await fetch("/api/mod/next")
    if (res.status === 401) {
      location.href = "/login?next=/mod"
      return
    }
    if (!res.ok) throw new Error("bad")
    const shownRes = await fetch("/api/mod/shown")
    if (shownRes.status === 401) {
      location.href = "/login?next=/mod"
      return
    }
    shown = shownRes.ok ? (await shownRes.json()).comments : []
    paint(await res.json())
  } catch {
    panel.replaceChildren(
      el("p", {}, ["Cannot reach the queue."]),
      el("button", { type: "button", class: "send", click: () => load() }, ["Try again"]),
    )
  }
}

function paint(data) {
  panel.replaceChildren()
  panel.append(el("p", { class: "fine" }, [data.waiting ? data.waiting + " waiting" : "Queue clear"]))
  if (data.empty) {
    panel.append(el("p", { class: "empty" }, ["Nothing waiting. New comments will show up here."]))
    paintShown()
    waitTimer = setTimeout(load, 1500)
    return
  }
  const card = data.comment
  panel.append(el("p", { class: "kicker" }, [card.questionTitle]))
  panel.append(el("h2", {}, [card.questionPrompt]))
  if (card.choices.length) panel.append(el("p", {}, [card.choices.join(" · ")]))
  if (card.flagged) panel.append(el("p", { class: "flag" }, ["Flagged for language or a link."]))
  panel.append(el("p", { class: "who" }, [card.moniker]))
  panel.append(el("p", { class: "said" }, [card.body]))
  const approve = el("button", { type: "button", class: "approve" }, ["Approve"])
  const reject = el("button", { type: "button", class: "reject" }, ["Reject"])
  approve.addEventListener("click", () => decide(card.id, "approve", approve, reject))
  reject.addEventListener("click", () => decide(card.id, "reject", approve, reject))
  panel.append(el("div", { class: "mod-actions" }, [approve, reject]))
  paintShown()
}

function paintShown() {
  panel.append(el("p", { class: "kicker feed-kicker" }, ["On the screen"]))
  if (!shown.length) {
    panel.append(el("p", { class: "fine" }, ["Nothing on the screen."]))
    return
  }
  for (const comment of shown) {
    const down = el("button", { type: "button", class: "takedown" }, ["Take off screen"])
    down.addEventListener("click", () => hide(comment.id, down))
    panel.append(el("article", { class: "note" }, [
      el("p", { class: "who" }, [comment.moniker + " · " + comment.questionTitle]),
      el("p", {}, [comment.body]),
      down,
    ]))
  }
}

async function hide(id, button) {
  if (!window.confirm("Take this line off the screen? The vote stays.")) return
  button.disabled = true
  try {
    const res = await fetch("/api/mod/" + id + "/hide", { method: "POST" })
    if (res.status === 401) {
      location.href = "/login?next=/mod"
      return
    }
    await load()
  } catch {
    button.disabled = false
  }
}

async function decide(id, action, approve, reject) {
  approve.disabled = true
  reject.disabled = true
  try {
    const res = await fetch("/api/mod/" + id + "/" + action, { method: "POST" })
    if (res.status === 401) {
      location.href = "/login?next=/mod"
      return
    }
    await load()
  } catch {
    approve.disabled = false
    reject.disabled = false
  }
}
