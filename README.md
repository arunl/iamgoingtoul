# I am going to UL

The live questions are a class check-in. Science Day 2026 is archived in `src/archive/science-day-2026.js` and is not loaded.

For class: open `/host` on the projector and sign in. Students scan the code. Each person answers Git, AI tools, agents, and hard parts. Each team agrees, then one phone answers Team Git and Cover next. Keys `1` through `6` change the question. Bars update as phones answer. A team’s “what should we cover” line shows on the projector as soon as it is sent. Save a team name on the phone before those two.

Booth site for Science Day, School of Computing and Informatics, University of Louisiana at Lafayette. Built the night of 6 Oct 2026 and used on 7 Oct 2026. Groups of high school students, teachers, and parents had about two or three minutes in the room. The projector was the show. The phone was the ballot.

Next year, replace the questions. The booth around them can stay. This file is the record of what ran. `DESIGN.md` is the brief from the night before, and it drifted before the doors opened.

## What a visit was

A student scanned a code, got a moniker such as Zydeco Scout, answered, and saw the room totals. A written line reached the projector only after someone approved it. Ask me anything also got a short written reply on the phone, because students left the room before they could hear an answer and kept engaging afterward.

Anyone who opened the site without a code could read the questions and nothing else. No names, emails, photos, or accounts. The moniker is the only identity. Comments are capped at 140 characters. A denylist in `src/denylist.js` marks a comment in the review queue. The mark does not publish it.

The room was Oliver 101, a lecture room, so walk-by traffic was poor. A printed code outside the room mattered more than a code that lived only on the projector.

Campus Wi-Fi will not carry a few hundred phones. The page has to load on cellular, so the address has to be public HTTPS and the page has to stay small.

## Pages

| Page | Path | Who |
| --- | --- | --- |
| Browse | `/` | Anyone |
| Phone | `/play` | A phone that scanned a live code |
| Projector | `/host` | Password. The screen in the room |
| Review | `/mod` | Password. Approve, reject, or take a line off the screen |
| Answers | `/ask` | Password. The drafted reply for each Ask me anything question |
| Print | `/print` | Password. The sheet to post |
| Help | `/help` | The support guide in `help/index.html`, written for a helper in the room |
| Redeem | `/j/<token>` | The QR target. Sets a cookie and sends the phone to `/play` |

One password covers the projector, review, answers, and the print sheet. The admin cookie lasts 36 hours. Host and review are separate pages so the approve button is never on the projector.

`help/index.html` is the guide that was shared with support. Its links name this year's host. The pictures in `help/images/` are from a practice run.

## Questions

The live list is `src/questions.js`. The server copies it into SQLite on startup. Removing a question id deletes that question’s answers the next time the server starts. Kinds are `single`, `multi`, and `open`. `audience` is `you` or `team`. A team question counts once per team name, and the other phones on that team see the result.

The class check-in is:

1. How comfortable are you using Git with a team?
2. How comfortable are you using AI tools while you code?
3. Which AI tools are you using?
4. What are you finding difficult?
5. How does your team use Git?
6. What topic should we cover for your team?

Science Day 2026 used these seven, now in `src/archive/science-day-2026.js`:

1. When will humans first set foot on Mars?
2. A Mars colony needs people who can build which of these? (pick any)
3. True or false: UL Lafayette fielded a self-driving car before Tesla. The projector cues [RoboCars Episode 1](https://vimeo.com/517415088) at 5:43 (`vimeo` `517415088`, `start` `343`). Press play if the browser does not start it.
4. How will AI change the world over the next ten years?
5. Would you ride in a car an AI is driving?
6. What is the most useful thing to learn before you use AI?
7. Ask me anything about computing, AI, self-driving cars, or UL Lafayette.

Two questions were dropped the morning of the event. "If you joined a Mars mission, what would you rather build?" did not stand on its own. "Which vehicle is better suited for Mars?" (CajunBot vs RaginBot) did not add enough beyond the before-Tesla question. Mars was taken out of Ask me anything because a guessed answer would have been obvious. The CajunBot and RaginBot photos are still in `public/` (`cajunbot.jpg`, `raginbot.png`) and no current question uses them. `public/ul-lafayette.png` is the wordmark in the title.

Removing a question id from `src/questions.js` deletes that question's answers and comments the next time the server starts. Adding a question is an entry in that array. Choice ids and question ids are stable keys. Keep them stable if an old database is still attached.

Colors used throughout: vermilion `#CE1126`, white, near-black `#141414`.

## The code

The QR is one code for the whole day, so it can be printed and posted. It is minted once, stored as the `poster_token` setting, and reused until it expires or someone revokes it. Default life is 16 hours (`POSTER_TTL_MS`). `ROTATE_MS` and `TOKEN_TTL_MS` in `src/tokens.js` are leftovers from the overnight plan, which flipped the picture every 5 minutes. That plan was dropped the morning of the event.

Redeeming sets a `booth` cookie and sends the phone to `/play` with a clean address. Refreshing does not mint a second moniker. Scanning again keeps the same moniker and extends it up to the new code's expiry. Revoke sets `revoke_before` and clears the stored code, so the printed sheet dies and the next visit to `/host` or `/print` mints another. Phones that already scanned keep their cookie until that cookie's own expiry. Pause stops new answers. Totals already on screen stay. Clear answers erases votes, comments, drafts, and monikers. The questions stay. Use it to wipe a practice run, not to remove one line.

The token is stateless HMAC-SHA256 over `{ iat, exp, n }`. `n` identifies a leaked code. Server clock only, with a few seconds of skew.

On the projector, Present hides the question list and Edit brings it back. Number keys `1` through the question count select a question. Escape closes the list. The QR stays put when the question changes. Pending comments never appear on `/host`.

Review has no skip. The phone stays on the oldest waiting line until Approve or Reject. Reject cannot be undone. A vote still counts either way. Take off screen sets an approved comment back to rejected and the projector drops the text on its next poll. Accidentally approving a line is the worse mistake. When unsure, reject it.

Play and the projector poll. There is no socket. Phones only need the post to succeed.

## Ask me anything replies

`src/gemini.js` writes two or three plain sentences for each Ask me anything submission, as soon as it arrives, before review. The draft is stored in `drafts` and shown as the reply.

A phone sees the Ask me anything thread after that phone has submitted its own question. The thread includes every question that was not rejected, and the reply under each one. The projector shows a question only after it is approved, with the same reply.

The reply answers the question the student asked. It does not pitch the university. It does not invent credits, tuition, fees, deadlines, admission rules, course numbers, or office procedures. When a question needs one of those, it says it does not have the official figure and points to louisiana.edu. The student text is untrusted.

`GEMINI_API_KEY` empty, or the word `disabled`, skips drafts. The default model is `gemini-flash-lite-latest` (`GEMINI_MODEL` overrides it).

On the morning of the event the reply sat on "Drafting a short answer" because the free quota for `gemini-3.8-flash` was used up. The Answers page then called Gemini again on every refresh, which spent what was left. No new key and no paid quota were added. Drafts moved to Flash Lite, which has its own free quota. If `GEMINI_MODEL` points at another model and that call returns 429 or 404, one attempt goes to `gemini-flash-lite-latest`. A failed draft is remembered for two minutes, so opening the page does not call again. New draft on `/ask` still does. A reply that succeeded is stored and later views read the database.

A separate call detail: non-lite models are asked to skip hidden reasoning (`thinkingBudget` 0), and a 400 is retried without that flag. Thought text is dropped. That keeps a short reply from being eaten by reasoning tokens. It is not what cleared the quota error.

The key used in 2026 was a host secret. It is not in this repo.

## Run it

Node 24 or newer. SQLite is `node:sqlite` in that runtime. The experimental-warning flag in `package.json` is there because of that module.

```
npm ci
npm start
npm run smoke
```

Copy `.env.example` to `.env` before `npm start` and fill in `ADMIN_PASSWORD` and `HMAC_SECRET`.

Required in the environment, or in `.env` (loaded only for keys that are not already set):

| Name | Role |
| --- | --- |
| `ADMIN_PASSWORD` | Projector, review, answers, print |
| `HMAC_SECRET` | Join codes and the admin cookie |
| `PUBLIC_URL` | Origin encoded in the QR. Phones open this |
| `PORT` | Default `8080` |
| `DATABASE_PATH` | Default `data/booth.sqlite` |
| `GEMINI_API_KEY` | Optional. `disabled` runs the booth with no drafts |
| `GEMINI_MODEL` | Optional |

`npm run smoke` starts the server on a throwaway database and does not need a Gemini key.

Rate limits are in memory, per IP: redeem 120/minute, answers 120/minute, login 20 per 10 minutes, draft refresh 30/minute. They are loose enough for a carrier NAT and tight enough to blunt a script.

## This year's host

In 2026 the process ran on Fly.io as app `iamgoingtoul` in region `dfw`, at `https://iamgoingtoul.fly.dev`. SQLite lived on the volume `booth_data` mounted at `/data`. `Dockerfile`, `fly.toml`, and `.dockerignore` are that deploy. `auto_stop_machines` was off so a cold start would not eat the first scan of a group.

Next year can be any host that runs `node src/server.js`, sets the variables above, and serves `PUBLIC_URL` over HTTPS. Nothing in the booth assumes a later year will be Fly. Those three files can stay as the record of how 2026 was hosted.

The day's votes and comment text are in that volume, and in local `data/` if a practice database is still there. They are not in git. `.env` is not in git. After the day, the useful split is to keep counts if you want them and drop the comment text, since the writers are minors.

## Layout

```
src/server.js     routes
src/db.js         schema, seed, votes, queue, drafts
src/questions.js  the questions
src/tokens.js     join codes
src/gemini.js     Ask me anything replies
src/pages.js      HTML
src/client/       projector, phone, review, answers
src/monikers.js   school-safe pairs
src/denylist.js   queue flags
public/           wordmark and unused vehicle photos, served at /media
help/             support guide, served at /help
scripts/smoke.mjs
```
