import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import crypto from "node:crypto"
import express from "express"
import QRCode from "qrcode"
import { mintToken, readToken, POSTER_TTL_MS } from "./tokens.js"
import {
  answeredIds,
  createParticipant,
  decideComment,
  extendParticipant,
  featuredId,
  getParticipant,
  getQuestion,
  getSetting,
  hasAnswered,
  isPaused,
  immediate,
  amaItems,
  clearBooth,
  getAma,
  hideComment,
  listQuestions,
  listShown,
  nextPending,
  noteReplyStyle,
  saveDraft,
  openDatabase,
  pendingCount,
  setFeatured,
  setPaused,
  setSetting,
  submitAnswer,
  tally,
} from "./db.js"
import { mediaFor } from "./questions.js"
import { draftAnswer } from "./gemini.js"
import { askPage, browsePage, hostPage, loginPage, messagePage, modPage, playPage, printPage } from "./pages.js"

function loadEnv() {
  const envPath = fileURLToPath(new URL("../.env", import.meta.url))
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

process.on("warning", (warning) => {
  if (warning.name === "ExperimentalWarning") return
  console.warn(warning.stack || warning.message)
})

loadEnv()

if (!process.env.ADMIN_PASSWORD || !process.env.HMAC_SECRET) {
  console.error("ADMIN_PASSWORD and HMAC_SECRET are required")
  process.exit(1)
}

openDatabase()

const buckets = new Map()

function allow(key, max, windowMs) {
  const now = Date.now()
  if (buckets.size > 2000) {
    for (const [name, bucket] of buckets) if (now > bucket.reset) buckets.delete(name)
  }
  let bucket = buckets.get(key)
  if (!bucket || now > bucket.reset) {
    bucket = { count: 0, reset: now + windowMs }
    buckets.set(key, bucket)
  }
  bucket.count += 1
  return bucket.count <= max
}

function publicBase() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "")
  if (process.env.FLY_APP_NAME) return `https://${process.env.FLY_APP_NAME}.fly.dev`
  return `http://127.0.0.1:${process.env.PORT || 8080}`
}

function publicHost() {
  try {
    return new URL(publicBase()).host
  } catch {
    return publicBase()
  }
}

function readCookies(req) {
  const out = {}
  for (const part of String(req.headers.cookie || "").split(";")) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    try {
      out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim())
    } catch {
      out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
    }
  }
  return out
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  }
}

function passwordsMatch(input, expected) {
  const left = crypto.createHash("sha256").update(String(input)).digest()
  const right = crypto.createHash("sha256").update(String(expected)).digest()
  return crypto.timingSafeEqual(left, right)
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

function adminToken() {
  const exp = Math.floor(Date.now() / 1000) + 36 * 60 * 60
  const sig = crypto.createHmac("sha256", process.env.HMAC_SECRET).update(`admin.${exp}`).digest("base64url")
  return `${exp}.${sig}`
}

function adminOk(req) {
  const raw = readCookies(req).booth_admin
  if (!raw) return false
  const dot = raw.indexOf(".")
  if (dot <= 0) return false
  const exp = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  const expected = crypto.createHmac("sha256", process.env.HMAC_SECRET).update(`admin.${exp}`).digest("base64url")
  if (!safeEqual(sig, expected)) return false
  return Number(exp) > Date.now() / 1000
}

function safeNext(value) {
  if (value === "/mod" || value === "/ask" || value === "/print") return value
  return "/host"
}

function requireAdmin(req, res, next) {
  if (adminOk(req)) return next()
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "login" })
  return res.redirect(`/login?next=${encodeURIComponent(safeNext(req.path))}`)
}

function currentParticipant(req) {
  const row = getParticipant(readCookies(req).booth)
  if (!row || row.expires_at < Date.now()) return null
  return row
}

function forClient(question, answered) {
  const media = mediaFor(question.id)
  return {
    id: question.id,
    position: question.position,
    title: question.title,
    prompt: question.prompt,
    kind: question.kind,
    hint: question.hint || "",
    choices: question.choices.map((choice) => ({ id: choice.id, label: choice.label })),
    images: media.images,
    more: media.more,
    video: media.video,
    answered: Boolean(answered),
  }
}

function currentCode() {
  return immediate(() => {
    const now = Date.now()
    const revokeBefore = Number(getSetting("revoke_before") || 0)
    const stored = getSetting("poster_token")
    const parsed = stored ? readToken(stored, revokeBefore, now) : null
    if (parsed) return { token: stored, ...parsed }
    const minted = mintToken(now, POSTER_TTL_MS)
    setSetting("poster_token", minted.token)
    return minted
  })
}

const app = express()
app.disable("x-powered-by")
app.set("etag", false)
app.set("trust proxy", 1)
app.use("/media", express.static(fileURLToPath(new URL("../public", import.meta.url)), { maxAge: "1h", index: false, fallthrough: false }))
app.use(express.json({ limit: "8kb" }))
app.use(express.urlencoded({ extended: false, limit: "8kb" }))
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store")
  res.set("X-Content-Type-Options", "nosniff")
  res.set("Referrer-Policy", "no-referrer")
  next()
})

app.get(/^\/help\/?$/, (_req, res) => {
  res.sendFile(fileURLToPath(new URL("../help/index.html", import.meta.url)))
})
app.use("/help", express.static(fileURLToPath(new URL("../help", import.meta.url)), { index: false, redirect: false, fallthrough: true }))

app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

app.get("/", (_req, res) => {
  res.type("html").send(browsePage(listQuestions()))
})

app.get("/play", (req, res) => {
  const participant = currentParticipant(req)
  if (!participant) return res.redirect("/")
  const answered = answeredIds(participant.id)
  const questions = listQuestions().map((question) => forClient(question, answered.has(question.id)))
  res.type("html").send(
    playPage({
      moniker: participant.moniker,
      expiresAt: participant.expires_at,
      featuredId: featuredId(),
      paused: isPaused(),
      questions,
    }),
  )
})

app.get("/print", requireAdmin, async (_req, res) => {
  try {
    const code = currentCode()
    const url = `${publicBase()}/j/${code.token}`
    const svg = await QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 2,
      color: { dark: "#141414", light: "#ffffff" },
    })
    res.type("html").send(printPage({ svg, url }))
  } catch (error) {
    console.error(error)
    res.status(500).type("html").send(messagePage("The sheet did not load", "Reload this page and try again."))
  }
})

app.get("/host", requireAdmin, (_req, res) => {
  const questions = listQuestions().map((question) => forClient(question, false))
  res.type("html").send(
    hostPage(
      { questions, featuredId: featuredId(), paused: isPaused() },
      publicHost(),
    ),
  )
})

app.get("/mod", requireAdmin, (_req, res) => {
  res.type("html").send(modPage())
})

app.get("/ask", requireAdmin, (_req, res) => {
  res.type("html").send(askPage())
})

app.get("/login", (req, res) => {
  const next = safeNext(req.query.next)
  if (adminOk(req)) return res.redirect(next)
  res.type("html").send(loginPage("", next))
})

app.post("/login", (req, res) => {
  const next = safeNext(req.body?.next)
  const ip = req.ip || "unknown"
  if (!allow(`login:${ip}`, 20, 10 * 60 * 1000)) {
    return res.status(429).type("html").send(loginPage("Wait a minute, then try again.", next))
  }
  if (!passwordsMatch(req.body?.password || "", process.env.ADMIN_PASSWORD)) {
    return res.status(401).type("html").send(loginPage("That password is not right.", next))
  }
  res.cookie("booth_admin", adminToken(), cookieOptions(36 * 60 * 60 * 1000))
  res.redirect(next)
})

app.get(/^\/j\/(.+)$/, (req, res) => {
  const ip = req.ip || "unknown"
  if (!allow(`redeem:${ip}`, 120, 60 * 1000)) {
    return res
      .status(429)
      .type("html")
      .send(messagePage("Wait a moment", "A lot of phones just scanned. Scan the code again in a few seconds."))
  }
  let token = req.params[0]
  try {
    token = decodeURIComponent(token)
  } catch {
    token = ""
  }
  const parsed = readToken(token, Number(getSetting("revoke_before") || 0))
  if (!parsed) {
    return res
      .status(400)
      .type("html")
      .send(messagePage("This code has expired", "Scan the code on the screen."))
  }
  const existingId = readCookies(req).booth
  let participant = existingId ? extendParticipant(existingId, parsed.exp) : null
  if (!participant) participant = createParticipant(parsed.exp)
  res.cookie("booth", participant.id, cookieOptions(Math.max(1000, participant.expires_at - Date.now())))
  res.redirect("/play")
})

app.get("/api/questions", (req, res) => {
  const participant = currentParticipant(req)
  const answered = participant ? answeredIds(participant.id) : new Set()
  res.json({
    moniker: participant?.moniker || null,
    expiresAt: participant?.expires_at || null,
    featuredId: featuredId(),
    paused: isPaused(),
    questions: listQuestions().map((question) => forClient(question, answered.has(question.id))),
  })
})

app.get("/api/questions/:id/results", (req, res) => {
  const participant = currentParticipant(req)
  if (!participant) return res.status(401).json({ error: "scan" })
  if (!hasAnswered(participant.id, req.params.id)) return res.status(403).json({ error: "answer first" })
  const data = tally(req.params.id, participant.id)
  if (!data) return res.status(404).json({ error: "unknown" })
  res.json(data)
})

const draftJobs = new Map()
const draftFails = new Map()
const DRAFT_FAIL_MS = 2 * 60 * 1000

function ensureDraft(id, refresh) {
  const running = draftJobs.get(id)
  if (running && !refresh) return running
  if (!refresh) {
    const failed = draftFails.get(id)
    if (failed && Date.now() - failed.at < DRAFT_FAIL_MS) return Promise.resolve({ error: failed.error })
  }
  const job = (async () => {
    if (running && refresh) await running.catch(() => {})
    const item = getAma(id)
    if (!item) return { error: "unknown" }
    if (item.draft && !refresh) return { text: item.draft }
    const result = await draftAnswer(item.body)
    if (result.text) {
      saveDraft(id, result.text)
      draftFails.delete(id)
      return { text: result.text }
    }
    draftFails.set(id, { at: Date.now(), error: result.error || "draft" })
    return result
  })().finally(() => {
    if (draftJobs.get(id) === job) draftJobs.delete(id)
  })
  draftJobs.set(id, job)
  return job
}

app.post("/api/answers", (req, res) => {
  const participant = currentParticipant(req)
  if (!participant) return res.status(401).json({ error: "scan" })
  const ip = req.ip || "unknown"
  if (!allow(`answer:${ip}`, 120, 60 * 1000)) return res.status(429).json({ error: "slow" })
  if (isPaused()) return res.status(403).json({ error: "paused" })
  const comment = typeof req.body?.comment === "string" ? req.body.comment.replace(/\s+/g, " ").trim() : ""
  const result = submitAnswer({
    participantId: participant.id,
    questionId: req.body?.questionId,
    choiceIds: Array.isArray(req.body?.choiceIds) ? req.body.choiceIds.map(String) : [],
    comment: comment || null,
  })
  if (result.error === "answered") return res.status(409).json({ error: "answered" })
  if (result.error) return res.status(400).json({ error: result.error })
  if (req.body?.questionId === "ama" && result.commentId) ensureDraft(result.commentId, false)
  res.status(201).json({ ok: true })
})

app.get("/api/host/code", requireAdmin, async (req, res) => {
  try {
    const code = currentCode()
    const now = Date.now()
    const same = req.query.n === code.n
    let svg = null
    if (!same) {
      const url = `${publicBase()}/j/${code.token}`
      svg = await QRCode.toString(url, {
        type: "svg",
        errorCorrectionLevel: "H",
        margin: 2,
        color: { dark: "#141414", light: "#ffffff" },
      })
    }
    res.json({
      n: code.n,
      url: `${publicBase()}/j/${code.token}`,
      expiresIn: Math.max(0, Math.ceil((code.exp - now) / 1000)),
      paused: isPaused(),
      featuredId: featuredId(),
      waiting: pendingCount(),
      svg,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: "failed" })
  }
})

app.get("/api/host/live", requireAdmin, (req, res) => {
  const data = tally(req.query.questionId)
  if (!data) return res.status(404).json({ error: "unknown" })
  res.json({
    questionId: data.questionId,
    total: data.total,
    counts: data.counts,
    comments: data.comments,
  })
})

app.post("/api/host/select", requireAdmin, (req, res) => {
  const question = getQuestion(req.body?.questionId)
  if (!question) return res.status(400).json({ error: "unknown" })
  setFeatured(question.id)
  res.json({ ok: true, featuredId: question.id })
})

app.post("/api/host/pause", requireAdmin, (req, res) => {
  if (typeof req.body?.paused !== "boolean") return res.status(400).json({ error: "bad" })
  setPaused(req.body.paused)
  console.log(req.body.paused ? "pause" : "resume")
  res.json({ ok: true, paused: req.body.paused })
})

app.post("/api/host/revoke", requireAdmin, (_req, res) => {
  setSetting("revoke_before", String(Date.now()))
  setSetting("poster_token", "")
  setSetting("display_token", "")
  console.log("revoke")
  res.json({ ok: true })
})

app.post("/api/host/clear", requireAdmin, (_req, res) => {
  clearBooth()
  console.log("clear")
  res.json({ ok: true })
})

app.get("/api/ask", requireAdmin, (_req, res) => {
  res.json({ items: amaItems() })
})

app.post("/api/ask/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "bad" })
  const item = getAma(id)
  if (!item) return res.status(404).json({ error: "unknown" })
  const refresh = req.body?.refresh === true
  if (item.draft && !refresh) return res.json({ id, draft: item.draft })
  if (!allow(`ask:${req.ip || "unknown"}`, 30, 60 * 1000)) return res.status(429).json({ error: "slow" })
  const result = await ensureDraft(id, refresh)
  if (result.error === "nokey") return res.status(503).json({ error: "nokey" })
  if (result.error === "quota") return res.status(429).json({ error: "quota" })
  if (result.error || !result.text) return res.status(502).json({ error: "draft" })
  res.json({ id, draft: result.text })
})

app.get("/api/mod/next", requireAdmin, (_req, res) => {
  res.json(nextPending())
})

app.get("/api/mod/shown", requireAdmin, (_req, res) => {
  res.json({ comments: listShown() })
})

app.post("/api/mod/:id/approve", requireAdmin, (req, res) => decide(req, res, "approved"))
app.post("/api/mod/:id/reject", requireAdmin, (req, res) => decide(req, res, "rejected"))
app.post("/api/mod/:id/hide", requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "bad" })
  if (!hideComment(id)) return res.status(409).json({ error: "decided" })
  res.json({ ok: true })
})

function decide(req, res, status) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "bad" })
  if (!decideComment(id, status)) return res.status(409).json({ error: "decided" })
  res.json({ ok: true, waiting: pendingCount() })
}

app.use((_req, res) => {
  res.status(404).type("html").send(messagePage("Page not found", "Scan the code on the screen, or start from the home page."))
})

app.use((error, _req, res, _next) => {
  console.error(error)
  if (res.headersSent) return
  res.status(500).type("text").send("Something went wrong.")
})

const port = Number(process.env.PORT || 8080)
app.listen(port, "0.0.0.0", () => {
  console.log(`listening ${port}`)
  if (!noteReplyStyle()) return
  const pending = amaItems()
  ;(async () => {
    for (const item of pending) await ensureDraft(item.id, false)
  })()
})
