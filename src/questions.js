export const QUESTIONS = [
  {
    id: "enjoy",
    title: "Demo",
    audience: "you",
    prompt: "Are you enjoying this demo?",
    kind: "single",
    hint: "",
    reveal: "",
    choices: [
      { id: "enjoy-up", label: "👍 Thumbs up" },
      { id: "enjoy-down", label: "👎 Thumbs down" },
    ],
  },
  {
    id: "git-you",
    title: "Git",
    audience: "you",
    prompt: "How comfortable are you using Git with a team?",
    kind: "single",
    hint: "",
    reveal: "",
    choices: [
      { id: "git-you-new", label: "I have not used Git" },
      { id: "git-you-own", label: "I can commit my own work" },
      { id: "git-you-branch", label: "I can pull, branch, and merge" },
      { id: "git-you-conflict", label: "I can fix a merge conflict" },
    ],
  },
  {
    id: "ai-you",
    title: "AI tools",
    audience: "you",
    prompt: "How comfortable are you using AI tools while you code?",
    kind: "single",
    hint: "",
    reveal: "",
    choices: [
      { id: "ai-you-none", label: "I do not use them" },
      { id: "ai-you-ask", label: "I paste in errors and questions" },
      { id: "ai-you-write", label: "I use them to write code" },
      { id: "ai-you-agent", label: "I use an agent that edits the project" },
    ],
  },
  {
    id: "agents",
    title: "Agents",
    audience: "you",
    prompt: "Which AI tools are you using?",
    kind: "multi",
    writes: true,
    live: true,
    hint: "Name any other tool",
    reveal: "",
    choices: [
      { id: "agents-chatgpt", label: "ChatGPT" },
      { id: "agents-claude", label: "Claude" },
      { id: "agents-gemini", label: "Gemini" },
      { id: "agents-copilot", label: "GitHub Copilot" },
      { id: "agents-cursor", label: "Cursor" },
      { id: "agents-other", label: "Something else" },
      { id: "agents-none", label: "None yet" },
    ],
  },
  {
    id: "hard",
    title: "Hard parts",
    audience: "you",
    prompt: "What are you finding difficult?",
    kind: "multi",
    hint: "",
    reveal: "",
    choices: [
      { id: "hard-git", label: "Git with a team" },
      { id: "hard-ai", label: "Using AI tools well" },
      { id: "hard-read", label: "Reading code" },
      { id: "hard-write", label: "Writing code" },
      { id: "hard-debug", label: "Debugging" },
      { id: "hard-tests", label: "Tests" },
      { id: "hard-split", label: "Splitting the work" },
      { id: "hard-ok", label: "I am keeping up" },
    ],
  },
  {
    id: "git-team",
    title: "Team Git",
    audience: "team",
    prompt: "How does your team use Git?",
    kind: "single",
    hint: "",
    reveal: "",
    choices: [
      { id: "git-team-none", label: "We are not using it yet" },
      { id: "git-team-one", label: "One person commits for everyone" },
      { id: "git-team-main", label: "We each commit on main" },
      { id: "git-team-branch", label: "We use branches" },
    ],
  },
  {
    id: "cover",
    title: "Cover next",
    audience: "team",
    prompt: "What topic should we cover for your team?",
    kind: "open",
    live: true,
    hint: "Name the topic in a few words",
    reveal: "",
    choices: [],
  },
]

export function mediaFor(id) {
  const source = QUESTIONS.find((item) => item.id === id)
  if (!source) return { images: [], more: null, video: null }
  const vimeo = source.video && /^\d+$/.test(String(source.video.vimeo)) ? String(source.video.vimeo) : ""
  return {
    images: (source.images || [])
      .filter((image) => typeof image.src === "string" && image.src.startsWith("/media/"))
      .map((image) => ({ src: image.src, alt: image.alt, label: image.label })),
    more: source.more && source.more.href ? { href: source.more.href, label: source.more.label } : null,
    video: vimeo
      ? { vimeo, start: Number(source.video.start) || 0, title: source.video.title || "RoboCars Episode 1" }
      : null,
  }
}
