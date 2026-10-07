export const QUESTIONS = [
  {
    id: "mars-when",
    title: "Mars landing",
    prompt: "When will humans first set foot on Mars?",
    kind: "single",
    hint: "",
    reveal:
      "SpaceX is building Starbase, LA, a spaceport on the Louisiana Gulf Coast, in Vermilion Parish — about 50 miles south of Lafayette. Whenever the landing is, that work is already in the next parish.",
    choices: [
      { id: "mars-when-1", label: "Before 2030" },
      { id: "mars-when-2", label: "In the 2030s" },
      { id: "mars-when-3", label: "In the 2040s" },
      { id: "mars-when-4", label: "After 2050" },
    ],
  },
  {
    id: "colony-skills",
    title: "Mars colony",
    prompt: "A Mars colony needs people who can build which of these?",
    kind: "multi",
    hint: "",
    reveal:
      "Rockets get you there. Computing is what keeps you there. That is the work of this school.",
    choices: [
      { id: "colony-skills-1", label: "Autonomous vehicles" },
      { id: "colony-skills-2", label: "Robotics" },
      { id: "colony-skills-3", label: "Power and life support" },
      { id: "colony-skills-4", label: "Software and AI" },
      { id: "colony-skills-5", label: "Communications" },
    ],
  },
  {
    id: "before-tesla",
    title: "Before Tesla",
    prompt: "True or false: UL Lafayette fielded a self-driving car before Tesla.",
    kind: "single",
    hint: "",
    reveal:
      "True. Team CajunBot ran in the DARPA Grand Challenge and the Urban Challenge, years before Tesla Autopilot. The first vehicle was a six-wheel all-terrain vehicle.",
    choices: [
      { id: "before-tesla-true", label: "True" },
      { id: "before-tesla-false", label: "False" },
    ],
    video: {
      vimeo: "517415088",
      start: 343,
      title: "RoboCars Episode 1, from 5:43",
    },
  },
  {
    id: "ai-ten",
    title: "AI in ten years",
    prompt: "How will AI change the world over the next ten years?",
    kind: "single",
    hint: "Name the job you want, and what AI does to it",
    reveal:
      "Write the job you want. The lines that reach the screen are the ones worth saying out loud.",
    choices: [
      { id: "ai-ten-1", label: "Take jobs" },
      { id: "ai-ten-2", label: "Create jobs" },
      { id: "ai-ten-3", label: "Change the jobs we have" },
      { id: "ai-ten-4", label: "Fade as hype" },
    ],
  },
  {
    id: "ai-ride",
    title: "AI at the wheel",
    prompt: "Would you ride in a car an AI is driving?",
    kind: "single",
    hint: "",
    reveal:
      "The careful answer is the one that says when you would take the wheel. A self-driving car has to know that moment too. CajunBot was this school's first try at that problem.",
    choices: [
      { id: "ai-ride-yes", label: "Yes" },
      { id: "ai-ride-wheel", label: "Only if I can grab the wheel" },
      { id: "ai-ride-notyet", label: "Not yet" },
      { id: "ai-ride-no", label: "No" },
    ],
  },
  {
    id: "ai-learn",
    title: "Before you use AI",
    prompt: "What is the most useful thing to learn before you use AI?",
    kind: "single",
    hint: "",
    reveal:
      "The useful skill is telling a wrong answer from a right one. Coding, math, and a clear question are how you get there.",
    choices: [
      { id: "ai-learn-code", label: "How to code" },
      { id: "ai-learn-wrong", label: "How to spot a wrong answer" },
      { id: "ai-learn-math", label: "The math" },
      { id: "ai-learn-ask", label: "How to ask a clear question" },
    ],
  },
  {
    id: "ama",
    title: "Ask me anything",
    prompt: "Ask me anything about computing, AI, self-driving cars, or UL Lafayette.",
    kind: "open",
    hint: "A short question for the front of the room",
    reveal: "The reply under your question is the answer. You can leave this page and come back to it.",
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
