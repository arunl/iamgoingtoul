import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import crypto from "node:crypto"
import { QUESTIONS } from "./questions.js"
import { pickMoniker } from "./monikers.js"
import { isFlagged } from "./denylist.js"

let db

const SCHEMA = `
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('single', 'multi', 'open')),
  reveal TEXT NOT NULL DEFAULT '',
  hint TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS choices (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  moniker TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY,
  participant_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  choice_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  participant_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  flagged INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (participant_id, question_id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS drafts (
  comment_id INTEGER PRIMARY KEY,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS comments_queue ON comments(status, created_at);
`

export function openDatabase() {
  const dbPath = process.env.DATABASE_PATH || "data/booth.sqlite"
  mkdirSync(dirname(dbPath), { recursive: true })
  db = new DatabaseSync(dbPath)
  db.prepare("PRAGMA journal_mode = WAL").get()
  db.prepare("PRAGMA foreign_keys = ON").get()
  db.prepare("PRAGMA busy_timeout = 5000").get()
  db.exec(SCHEMA)
  seed()
}

function seed() {
  const upsertQuestion = db.prepare(`
    INSERT INTO questions (id, position, title, prompt, kind, reveal, hint)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      position = excluded.position,
      title = excluded.title,
      prompt = excluded.prompt,
      kind = excluded.kind,
      reveal = excluded.reveal,
      hint = excluded.hint
  `)
  const upsertChoice = db.prepare(`
    INSERT INTO choices (id, question_id, label, position)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      question_id = excluded.question_id,
      label = excluded.label,
      position = excluded.position
  `)
  const keep = new Set(QUESTIONS.map((question) => question.id))
  const gone = db.prepare("SELECT id FROM questions").all().filter((row) => !keep.has(row.id))
  const commentIds = db.prepare("SELECT id FROM comments WHERE question_id = ?")
  const dropDraft = db.prepare("DELETE FROM drafts WHERE comment_id = ?")
  const dropComments = db.prepare("DELETE FROM comments WHERE question_id = ?")
  const dropAnswers = db.prepare("DELETE FROM answers WHERE question_id = ?")
  const dropChoices = db.prepare("DELETE FROM choices WHERE question_id = ?")
  const dropQuestion = db.prepare("DELETE FROM questions WHERE id = ?")
  for (const row of gone) {
    for (const comment of commentIds.all(row.id)) dropDraft.run(comment.id)
    dropComments.run(row.id)
    dropAnswers.run(row.id)
    dropChoices.run(row.id)
    dropQuestion.run(row.id)
  }
  const featured = getSetting("featured")
  if (featured && !keep.has(featured)) setSetting("featured", QUESTIONS[0].id)
  for (const [index, question] of QUESTIONS.entries()) {
    upsertQuestion.run(
      question.id,
      index + 1,
      question.title,
      question.prompt,
      question.kind,
      question.reveal,
      question.hint || "",
    )
    question.choices.forEach((choice, choiceIndex) => {
      upsertChoice.run(choice.id, question.id, choice.label, choiceIndex + 1)
    })
  }
}

function mapQuestion(row) {
  if (!row) return null
  const choices = db
    .prepare("SELECT id, label, position FROM choices WHERE question_id = ? ORDER BY position")
    .all(row.id)
  return {
    id: row.id,
    position: Number(row.position),
    title: row.title,
    prompt: row.prompt,
    kind: row.kind,
    reveal: row.reveal,
    hint: row.hint || "",
    choices,
  }
}

export function listQuestions() {
  return db
    .prepare("SELECT * FROM questions ORDER BY position")
    .all()
    .map(mapQuestion)
}

export function getQuestion(id) {
  return mapQuestion(db.prepare("SELECT * FROM questions WHERE id = ?").get(id))
}

export function immediate(run) {
  db.exec("BEGIN IMMEDIATE")
  try {
    const value = run()
    db.exec("COMMIT")
    return value
  } catch (error) {
    try {
      db.exec("ROLLBACK")
    } catch {
      // The failed statement already aborted the transaction.
    }
    throw error
  }
}

export function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key)
  return row ? row.value : null
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value))
}

export function isPaused() {
  return getSetting("paused") === "1"
}

export function setPaused(paused) {
  setSetting("paused", paused ? "1" : "0")
}

export function featuredId() {
  return getSetting("featured") || listQuestions()[0].id
}

export function setFeatured(id) {
  setSetting("featured", id)
}

export function getParticipant(id) {
  if (!id) return null
  const row = db.prepare("SELECT * FROM participants WHERE id = ?").get(id)
  if (!row) return null
  return {
    id: row.id,
    moniker: row.moniker,
    created_at: Number(row.created_at),
    expires_at: Number(row.expires_at),
  }
}

export function createParticipant(expiresAt) {
  for (let attempt = 0; attempt < 8; attempt++) {
    db.exec("BEGIN IMMEDIATE")
    try {
      const taken = new Set(db.prepare("SELECT moniker FROM participants").all().map((row) => row.moniker))
      const moniker = pickMoniker(taken)
      const id = crypto.randomBytes(24).toString("base64url")
      const now = Date.now()
      db.prepare(
        "INSERT INTO participants (id, moniker, created_at, expires_at) VALUES (?, ?, ?, ?)",
      ).run(id, moniker, now, expiresAt)
      db.exec("COMMIT")
      return { id, moniker, created_at: now, expires_at: expiresAt }
    } catch (error) {
      try {
        db.exec("ROLLBACK")
      } catch {
        // The failed statement already aborted the transaction.
      }
      if (!String(error.message).includes("UNIQUE") || attempt === 7) throw error
    }
  }
  throw new Error("Could not assign a moniker")
}

export function extendParticipant(id, expiresAt) {
  const row = getParticipant(id)
  if (!row) return null
  const next = Math.max(row.expires_at, expiresAt)
  if (next !== row.expires_at) {
    db.prepare("UPDATE participants SET expires_at = ? WHERE id = ?").run(next, id)
  }
  return { ...row, expires_at: next }
}

export function answeredIds(participantId) {
  return new Set(
    db
      .prepare("SELECT DISTINCT question_id FROM answers WHERE participant_id = ?")
      .all(participantId)
      .map((row) => row.question_id),
  )
}

export function hasAnswered(participantId, questionId) {
  return Boolean(
    db
      .prepare("SELECT 1 AS ok FROM answers WHERE participant_id = ? AND question_id = ?")
      .get(participantId, questionId),
  )
}

export function submitAnswer({ participantId, questionId, choiceIds, comment }) {
  const question = getQuestion(questionId)
  if (!question) return { error: "unknown" }
  const ids = [...new Set(choiceIds || [])]
  if (question.kind === "open") {
    if (ids.length || !comment) return { error: "bad" }
  } else if (question.kind === "single") {
    if (ids.length !== 1) return { error: "bad" }
  } else if (ids.length < 1) {
    return { error: "bad" }
  }
  const allowed = new Set(question.choices.map((choice) => choice.id))
  if (ids.some((id) => !allowed.has(id))) return { error: "bad" }
  if (comment && comment.length > 140) return { error: "long" }

  db.exec("BEGIN IMMEDIATE")
  try {
    const existing = db
      .prepare("SELECT 1 AS ok FROM answers WHERE participant_id = ? AND question_id = ?")
      .get(participantId, questionId)
    if (existing) {
      db.exec("ROLLBACK")
      return { error: "answered" }
    }
    const now = Date.now()
    const insert = db.prepare(
      "INSERT INTO answers (participant_id, question_id, choice_id, created_at) VALUES (?, ?, ?, ?)",
    )
    if (question.kind === "open") insert.run(participantId, questionId, null, now)
    else for (const id of ids) insert.run(participantId, questionId, id, now)
    let commentId = null
    if (comment) {
      const inserted = db.prepare(
        `INSERT INTO comments (participant_id, question_id, body, status, flagged, created_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`,
      ).run(participantId, questionId, comment, isFlagged(comment) ? 1 : 0, now)
      commentId = Number(inserted.lastInsertRowid)
    }
    db.exec("COMMIT")
    return { ok: true, commentId }
  } catch (error) {
    try {
      db.exec("ROLLBACK")
    } catch {
      // Already aborted.
    }
    throw error
  }
}

export function tally(questionId, participantId = null) {
  const question = getQuestion(questionId)
  if (!question) return null
  const total = Number(
    db
      .prepare("SELECT COUNT(DISTINCT participant_id) AS n FROM answers WHERE question_id = ?")
      .get(questionId).n,
  )
  const rows = db
    .prepare(
      "SELECT choice_id, COUNT(*) AS n FROM answers WHERE question_id = ? AND choice_id IS NOT NULL GROUP BY choice_id",
    )
    .all(questionId)
  const grouped = new Map(rows.map((row) => [row.choice_id, Number(row.n)]))
  const counts = question.choices.map((choice) => {
    const count = grouped.get(choice.id) || 0
    return {
      choiceId: choice.id,
      label: choice.label,
      count,
      share: total ? count / total : 0,
    }
  })
  const comments = listVisibleComments(questionId, participantId)
  return { questionId, total, counts, comments, reveal: question.reveal }
}

export function listVisibleComments(questionId, participantId) {
  return db
    .prepare(
      `SELECT c.id AS id, c.body AS body, c.participant_id AS participant_id, p.moniker AS moniker, d.body AS reply
       FROM comments c
       JOIN participants p ON p.id = c.participant_id
       LEFT JOIN drafts d ON d.comment_id = c.id
       WHERE c.question_id = ?
         AND c.status != 'rejected'
         AND (
           c.status = 'approved'
           OR (? = 'ama' AND ? IS NOT NULL)
         )
       ORDER BY CASE WHEN ? IS NOT NULL AND c.participant_id = ? THEN 0 ELSE 1 END, c.created_at DESC
       LIMIT 30`,
    )
    .all(questionId, questionId, participantId, participantId, participantId)
    .map((row) => ({
      id: Number(row.id),
      moniker: row.moniker,
      body: row.body,
      reply: row.reply || null,
      mine: participantId != null && row.participant_id === participantId,
    }))
}

export function pendingCount() {
  return Number(db.prepare("SELECT COUNT(*) AS n FROM comments WHERE status = 'pending'").get().n)
}

export function nextPending() {
  const waiting = pendingCount()
  const row = db
    .prepare(
      `SELECT c.id, c.body, c.flagged, c.question_id, c.participant_id, p.moniker, q.title, q.prompt
       FROM comments c
       JOIN participants p ON p.id = c.participant_id
       JOIN questions q ON q.id = c.question_id
       WHERE c.status = 'pending'
       ORDER BY c.created_at ASC, c.id ASC
       LIMIT 1`,
    )
    .get()
  if (!row) return { empty: true, waiting }
  const choices = db
    .prepare(
      `SELECT ch.label AS label
       FROM answers a
       JOIN choices ch ON ch.id = a.choice_id
       WHERE a.participant_id = ? AND a.question_id = ?
       ORDER BY ch.position`,
    )
    .all(row.participant_id, row.question_id)
    .map((item) => item.label)
  return {
    empty: false,
    waiting,
    comment: {
      id: Number(row.id),
      moniker: row.moniker,
      questionTitle: row.title,
      questionPrompt: row.prompt,
      choices,
      body: row.body,
      flagged: Number(row.flagged) === 1,
    },
  }
}

export function noteReplyStyle() {
  if (getSetting("reply_style") === "direct") return false
  db.prepare("DELETE FROM drafts").run()
  setSetting("reply_style", "direct")
  return true
}

export function clearBooth() {
  return immediate(() => {
    db.prepare("DELETE FROM drafts").run()
    db.prepare("DELETE FROM comments").run()
    db.prepare("DELETE FROM answers").run()
    db.prepare("DELETE FROM participants").run()
  })
}

export function amaItems() {
  return db
    .prepare(
      `SELECT c.id AS id, c.body AS body, c.status AS status, p.moniker AS moniker, d.body AS draft
       FROM comments c
       JOIN participants p ON p.id = c.participant_id
       LEFT JOIN drafts d ON d.comment_id = c.id
       WHERE c.question_id = 'ama' AND c.status != 'rejected'
       ORDER BY c.created_at ASC, c.id ASC`,
    )
    .all()
    .map((row) => ({
      id: Number(row.id),
      body: row.body,
      status: row.status,
      moniker: row.moniker,
      draft: row.draft || null,
    }))
}

export function getAma(id) {
  const row = db
    .prepare(
      `SELECT c.id AS id, c.body AS body, d.body AS draft
       FROM comments c
       LEFT JOIN drafts d ON d.comment_id = c.id
       WHERE c.id = ? AND c.question_id = 'ama' AND c.status != 'rejected'`,
    )
    .get(id)
  if (!row) return null
  return { id: Number(row.id), body: row.body, draft: row.draft || null }
}

export function saveDraft(id, body) {
  db.prepare(
    `INSERT INTO drafts (comment_id, body, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(comment_id) DO UPDATE SET
       body = excluded.body,
       created_at = excluded.created_at`,
  ).run(id, body, Date.now())
}

export function listShown() {
  return db
    .prepare(
      `SELECT c.id AS id, c.body AS body, p.moniker AS moniker, q.title AS title
       FROM comments c
       JOIN participants p ON p.id = c.participant_id
       JOIN questions q ON q.id = c.question_id
       WHERE c.status = 'approved'
       ORDER BY c.created_at DESC
       LIMIT 30`,
    )
    .all()
    .map((row) => ({
      id: Number(row.id),
      moniker: row.moniker,
      body: row.body,
      questionTitle: row.title,
    }))
}

export function hideComment(id) {
  const result = db.prepare("UPDATE comments SET status = 'rejected' WHERE id = ? AND status = 'approved'").run(id)
  return Number(result.changes) > 0
}

export function decideComment(id, status) {
  const result = db
    .prepare("UPDATE comments SET status = ? WHERE id = ? AND status = 'pending'")
    .run(status, id)
  return Number(result.changes) > 0
}
