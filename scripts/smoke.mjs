import { spawn } from "node:child_process"
import { unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const root = fileURLToPath(new URL("..", import.meta.url))
const port = 8799
const base = `http://127.0.0.1:${port}`
const dbPath = join(tmpdir(), `booth-smoke-${process.pid}.sqlite`)
const secret = "smoke-secret"
const password = "smoke-password"
const timing = { POSTER_TTL_MS: String(60 * 60 * 1000), SKEW_MS: "1000" }

let child
let logs = ""

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

function jarHeader(jar) {
  return Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ")
}

function jarStore(jar, res) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : []
  for (const line of list) {
    const pair = line.split(";")[0]
    const eq = pair.indexOf("=")
    if (eq === -1) continue
    jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  }
}

async function request(path, { jar, method = "GET", json, form } = {}) {
  const headers = {}
  if (jar && Object.keys(jar).length) headers.cookie = jarHeader(jar)
  let body
  if (json) {
    headers["content-type"] = "application/json"
    body = JSON.stringify(json)
  } else if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded"
    body = new URLSearchParams(form).toString()
  }
  const res = await fetch(base + path, { method, headers, body, redirect: "manual" })
  if (jar) jarStore(jar, res)
  return res
}

async function text(res) {
  return res.text()
}

async function json(res) {
  const body = await res.text()
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`not json ${res.status} ${body.slice(0, 240)}`)
  }
}

function startServer() {
  child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: dbPath,
      PUBLIC_URL: base,
      ADMIN_PASSWORD: password,
      HMAC_SECRET: secret,
      GEMINI_API_KEY: "disabled",
      NODE_ENV: "development",
      ...timing,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.stdout.on("data", (chunk) => {
    logs += chunk
  })
  child.stderr.on("data", (chunk) => {
    logs += chunk
  })
  return new Promise((resolve, reject) => {
    let started = false
    const timer = setTimeout(() => reject(new Error("server did not start\n" + logs)), 15000)
    const startedCheck = () => {
      if (started || !logs.includes("listening")) return
      started = true
      clearTimeout(timer)
      resolve()
    }
    child.stdout.on("data", startedCheck)
    child.on("exit", (code) => {
      if (started) return
      clearTimeout(timer)
      reject(new Error(`server exited ${code}\n${logs}`))
    })
  })
}

async function run() {
  const home = await request("/")
  const homeHtml = await text(home)
  assert(home.status === 200, "browse status")
  assert(homeHtml.includes("I am going to UL"), "browse title")
  assert(homeHtml.includes("/media/ul-lafayette.png"), "browse uses the UL mark")
  assert(!homeHtml.includes("better suited for Mars"), "vehicle question is gone")
  assert(!homeHtml.includes("player.vimeo.com"), "browse does not embed the film")
  assert(homeHtml.includes("computing, AI, self-driving cars"), "ama topics")
  assert(!homeHtml.includes("joined a Mars mission"), "mars mission question is gone")
  const rideAt = homeHtml.indexOf("ride in a car an AI is driving")
  const learnAt = homeHtml.indexOf("most useful thing to learn before you use AI")
  const amaAt = homeHtml.lastIndexOf("Ask me anything")
  assert(rideAt > 0 && learnAt > rideAt && amaAt > learnAt, "new AI questions sit before ask me anything")
  assert(!homeHtml.includes("computing, Mars"), "ama drops Mars")
  assert(!homeHtml.includes("Science Day"), "no Science Day label")
  const guide = await request("/help")
  const guideHtml = await text(guide)
  assert(guide.status === 200 && guideHtml.includes("Support guide"), "help guide")
  assert(guideHtml.includes("Get it from the professor"), "help guide points at the professor for the password")
  assert(!/Booth-[A-Z0-9]+/.test(guideHtml), "help guide does not include the password")
  const shot = await request("/help/images/login.png")
  assert(shot.status === 200 && (shot.headers.get("content-type") || "").includes("image"), "help screenshot")
  assert(homeHtml.includes("before Tesla"), "browse question")
  assert(!homeHtml.includes("DARPA"), "browse hides the reveal")
  assert(!homeHtml.includes("next parish"), "browse hides the Mars reveal")
  const photo = await request("/media/cajunbot.jpg")
  assert(photo.status === 200 && (photo.headers.get("content-type") || "").includes("image"), "CajunBot photo is served")

  const play = await request("/play")
  assert(play.status === 302 && play.headers.get("location") === "/", "play without a code returns browse")

  const host = await request("/host")
  assert(host.status === 302 && host.headers.get("location").startsWith("/login"), "host requires login")

  const badLogin = await request("/login", { method: "POST", form: { password: "nope", next: "/host" } })
  assert(badLogin.status === 401, "bad password")

  const admin = {}
  const login = await request("/login", { jar: admin, method: "POST", form: { password, next: "/host" } })
  assert(login.status === 302, "admin login")
  const hostPage = await request("/host", { jar: admin })
  assert(hostPage.status === 200, "host page")
  const hostHtml = await text(hostPage)
  assert(hostHtml.includes("Scan to answer"), "host shows the scan line")
  assert(hostHtml.includes("Same code all day"), "host keeps one code")
  assert(hostHtml.includes("booth-mark"), "mark sits above the code")
  assert(!hostHtml.includes("Science Day"), "host drops Science Day")
  const askPage = await request("/ask")
  assert(askPage.status === 302 && askPage.headers.get("location").includes("ask"), "ask requires login")

  const firstRes = await request("/api/host/code", { jar: admin })
  const first = await json(firstRes)
  assert(firstRes.status === 200, "host code")
  assert(first.svg && first.svg.includes("<svg"), "qr svg")
  assert(first.url.includes("/j/") && first.url.includes("."), "token url")

  await sleep(1500)
  const second = await json(await request("/api/host/code", { jar: admin }))
  assert(second.n === first.n, "code stays put")
  const poster = await request("/print", { jar: admin })
  const posterHtml = await text(poster)
  assert(poster.status === 200 && posterHtml.includes(first.url), "print sheet uses the live code")
  assert((await request("/print")).status === 302, "print sheet requires login")
  assert((await request("/print")).headers.get("location").includes("next=%2Fprint"), "print login returns to the sheet")

  async function redeem(url) {
    const path = new URL(url).pathname
    return request(path, { jar: {} })
  }
  assert((await redeem(first.url)).status === 302, "printed code works")
  assert((await redeem(second.url)).status === 302, "same code still works")

  const phone = {}
  const joined = await request(new URL(second.url).pathname, { jar: phone })
  assert(joined.status === 302, "redeem redirects")
  const playing = await request("/play", { jar: phone })
  const playingHtml = await text(playing)
  assert(playing.status === 200 && playingHtml.includes("You are"), "play assigns a moniker")
  assert(playingHtml.includes("Every question and reply shows up here"), "ama shares replies with every phone")
  assert(!playingHtml.includes("DARPA"), "play hides the reveal until an answer")

  const early = await request("/api/questions/before-tesla/results", { jar: phone })
  assert(early.status === 403, "results wait for an answer")

  const tooLong = "x".repeat(141)
  const rejected = await request("/api/answers", {
    jar: phone,
    method: "POST",
    json: { questionId: "before-tesla", choiceIds: ["before-tesla-true"], comment: tooLong },
  })
  assert(rejected.status === 400, "comment cap")
  assert((await request("/api/questions/before-tesla/results", { jar: phone })).status === 403, "failed comment does not count as an answer")

  const vote = await request("/api/answers", {
    jar: phone,
    method: "POST",
    json: {
      questionId: "before-tesla",
      choiceIds: ["before-tesla-true"],
      comment: "The wheels matter less than the code.",
    },
  })
  assert(vote.status === 201, "vote stored")
  const again = await request("/api/answers", {
    jar: phone,
    method: "POST",
    json: { questionId: "before-tesla", choiceIds: ["before-tesla-false"], comment: "second" },
  })
  assert(again.status === 409, "one answer")

  const hidden = await json(await request("/api/questions/before-tesla/results", { jar: phone }))
  assert(hidden.reveal.includes("DARPA"), "reveal after answering")
  assert(hidden.total === 1, "one vote counted")
  assert(hidden.comments.length === 0, "pending comment stays hidden")
  const liveHidden = await json(await request("/api/host/live?questionId=before-tesla", { jar: admin }))
  assert(liveHidden.total === 1, "projector count")
  assert(liveHidden.comments.length === 0, "projector hides pending text")
  assert(!JSON.stringify(liveHidden).includes("DARPA"), "projector hides the reveal")

  const queued = await json(await request("/api/mod/next", { jar: admin }))
  assert(!queued.empty && queued.comment.body.includes("wheels"), "review queue")
  assert(queued.comment.flagged === false, "clean comment is not flagged")
  assert(queued.comment.choices.includes("True"), "review shows the choice")
  const approved = await request(`/api/mod/${queued.comment.id}/approve`, { jar: admin, method: "POST" })
  assert(approved.status === 200, "approve")
  const shown = await json(await request("/api/questions/before-tesla/results", { jar: phone }))
  assert(shown.comments.some((comment) => comment.body.includes("wheels")), "approved comment reaches the phone")
  const liveShown = await json(await request("/api/host/live?questionId=before-tesla", { jar: admin }))
  assert(liveShown.comments.some((comment) => comment.body.includes("wheels")), "approved comment reaches the projector")
  assert((await request(`/api/mod/${queued.comment.id}/hide`, { jar: admin, method: "POST" })).status === 200, "take down")
  const pulled = await json(await request("/api/host/live?questionId=before-tesla", { jar: admin }))
  assert(pulled.total === 1, "take down keeps the vote")
  assert(!pulled.comments.some((comment) => comment.body.includes("wheels")), "taken down comment leaves the projector")
  const phonePulled = await json(await request("/api/questions/before-tesla/results", { jar: phone }))
  assert(!phonePulled.comments.some((comment) => comment.body.includes("wheels")), "taken down comment leaves the phone")

  const flagged = await request("/api/answers", {
    jar: phone,
    method: "POST",
    json: { questionId: "ama", choiceIds: [], comment: "write me at student@example.com" },
  })
  assert(flagged.status === 201, "open question")
  const flaggedCard = await json(await request("/api/mod/next", { jar: admin }))
  assert(flaggedCard.comment.flagged === true, "email is flagged")
  assert((await request(`/api/mod/${flaggedCard.comment.id}/reject`, { jar: admin, method: "POST" })).status === 200, "reject")
  const afterReject = await json(await request("/api/host/live?questionId=ama", { jar: admin }))
  assert(afterReject.comments.length === 0, "rejected comment stays off the projector")
  assert((await json(await request("/api/mod/next", { jar: admin }))).empty, "queue drains")

  const multi = await request("/api/answers", {
    jar: phone,
    method: "POST",
    json: { questionId: "colony-skills", choiceIds: ["colony-skills-1", "colony-skills-4"], comment: "" },
  })
  assert(multi.status === 201, "multi select")
  const skills = await json(await request("/api/questions/colony-skills/results", { jar: phone }))
  assert(skills.counts.find((row) => row.choiceId === "colony-skills-1").count === 1, "first skill counted")
  assert(skills.counts.find((row) => row.choiceId === "colony-skills-4").count === 1, "second skill counted")

  assert((await request("/api/host/pause", { jar: admin, method: "POST", json: { paused: true } })).status === 200, "pause")
  const other = {}
  assert((await request(new URL(second.url).pathname, { jar: other })).status === 302, "scan during pause")
  const pausedVote = await request("/api/answers", {
    jar: other,
    method: "POST",
    json: { questionId: "mars-when", choiceIds: ["mars-when-2"], comment: "" },
  })
  assert(pausedVote.status === 403, "pause blocks answers")
  assert((await request("/api/host/pause", { jar: admin, method: "POST", json: { paused: false } })).status === 200, "resume")
  assert(
    (await request("/api/answers", {
      jar: other,
      method: "POST",
      json: { questionId: "mars-when", choiceIds: ["mars-when-2"], comment: "" },
    })).status === 201,
    "resume allows answers",
  )

  assert((await request("/api/host/revoke", { jar: admin, method: "POST" })).status === 200, "revoke")
  assert((await redeem(second.url)).status === 400, "revoked code dies")
  const fresh = await json(await request("/api/host/code", { jar: admin }))
  assert(fresh.n !== second.n, "revoke mints a new sheet")
  assert((await redeem(fresh.url)).status === 302, "new code after revoke works")

  const askOpen = await request("/api/answers", {
    jar: other,
    method: "POST",
    json: { questionId: "ama", choiceIds: [], comment: "What is computing like at UL?" },
  })
  assert(askOpen.status === 201, "second ama stored")
  const mine = await json(await request("/api/questions/ama/results", { jar: other }))
  const own = mine.comments.find((comment) => comment.body.includes("computing like at UL"))
  assert(own && own.mine && !own.reply, "asker sees their question before the reply")
  const peers = await json(await request("/api/questions/ama/results", { jar: phone }))
  assert(peers.comments.some((comment) => comment.body.includes("computing like at UL")), "every phone sees the question")
  const projector = await json(await request("/api/host/live?questionId=ama", { jar: admin }))
  assert(!projector.comments.some((comment) => comment.body.includes("computing like at UL")), "projector waits for approval")
  const askList = await json(await request("/api/ask", { jar: admin }))
  const kept = askList.items.find((item) => item.body.includes("computing like at UL"))
  assert(kept, "ask lists the question")
  const draft = await request("/api/ask/" + kept.id, { jar: admin, method: "POST", json: {} })
  assert(draft.status === 503, "draft waits for a Gemini key")
  assert((await json(draft)).error === "nokey", "missing key is explicit")
  assert((await request("/api/host/clear", { jar: admin, method: "POST" })).status === 200, "clear")
  const cleared = await json(await request("/api/host/live?questionId=before-tesla", { jar: admin }))
  assert(cleared.total === 0 && cleared.comments.length === 0, "clear removes votes and comments")
  assert((await json(await request("/api/ask", { jar: admin }))).items.length === 0, "clear removes questions")
  console.log("smoke ok")
}

try {
  await startServer()
  await run()
} catch (error) {
  console.error(error)
  console.error(logs.slice(-4000))
  process.exitCode = 1
} finally {
  if (child) child.kill()
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(dbPath + suffix)
    } catch {
      // Already gone.
    }
  }
}
