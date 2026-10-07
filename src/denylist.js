const WORDS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "cock",
  "pussy",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "retard",
  "slut",
  "whore",
  "porn",
  "nude",
  "nazi",
  "sex",
  "ass",
]

const WORD_RE = new RegExp(`\\b(?:${WORDS.join("|")})\\b`, "i")
const EXTRA_RE = /https?:\/\/|www\.|@|kill\s+yourself/i

export function isFlagged(text) {
  return WORD_RE.test(text) || EXTRA_RE.test(text)
}
