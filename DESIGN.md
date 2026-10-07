> Science Day 2026 has already run. Start with README.md. This file is the brief from the night of 6 Oct 2026. By the morning of the event the QR code was a printed poster, the question list had changed, and Ask me anything replies were written for the phone.

# IAmGoingToUL — Science Day booth

A one-day site for the School of Computing and Informatics open house. Groups of high school students (and their teachers and parents) have about two or three minutes in the room. The projector is the show. The phone is the ballot. A second phone is the moderator.

Host it as a single public site on Fly.io: `https://iamgoingtoul.fly.dev`. Point `iamgoingtoul.com` at it later if you buy the name. Campus Wi-Fi will not carry 500 phones. The page has to load on cellular, so the URL must be public HTTPS and the page must stay small.

## What a visit feels like

A student looks at the projector, scans the code in the corner, and lands already able to answer. The phone assigns a moniker (`Zydeco Scout`). They tap one choice, optionally add a short line, and immediately see how the room voted. If the line is approved, that moniker shows up on the projector while they are still standing there.

Someone who types the address, or follows a link with no code, gets the browse page: the questions, and nothing else. No ballot, no comments, no counts.

## Four surfaces

| Surface | Who | Where |
| --- | --- | --- |
| Browse | Anyone on the open web | `/` |
| Play | A phone that redeemed a live code | `/play` |
| Host | You, projected | `/host` |
| Moderate | You, on your phone | `/mod` |

Host and Moderate share one password (set in the environment, not in the repo). They are different pages on purpose. The projected page has no approve button, because the room can read the screen.

### Browse

Question prompts only. A line at the top: scan the code in the lab to take part. No moniker yet. No results.

### Play

Header shows the moniker and a countdown for how long this phone can still answer.

One question at a time, current projector question first, with the others one tap away. A multiple-choice question is a stack of large buttons. An optional comment is a single line, 140 characters. Ask-me-anything is the comment and no buttons.

Submit once per question per phone. The choice is final. After submit, that question shows:

- the count and share for each choice
- the reveal sentence (the CajunBot point, in a sentence or two)
- comments you have approved, each with its moniker

Unapproved and rejected comments are absent. A phone that has not answered that question does not see its counts. That keeps the first tap honest.

### Host (the projector)

The code stays in the same corner all day. Changing the question does not move it. A camera at the back of the room needs a stable target.

```
+----+----------------------------------+----------------------+
| >> |  Question, large type            |  Live counts         |
|    |                                  |                      |
|    |  Choices as plain text           |  Approved comments   |
|    |                                  |  moniker + one line  |
|    |                                  |                      |
|    |         +--------+               |                      |
|    |         |   QR   |  3:12         |                      |
|    |         +--------+               |                      |
+----+----------------------------------+----------------------+
```

The left edge is a thin strip. Hover or click opens the question list over the question text. It can be pinned while you rehearse. It does not cover the QR code. A Present control closes it and leaves it closed. Number keys 1–7 select a question so you are not hunting with the mouse in front of a crowd.

The right side is the room, for the question on screen:

- vote totals, updating about once a second
- approved comments, newest at the top

Pending comments do not appear here, even as a placeholder. The moderation decision would be pointless if the gym could already read them.

Small controls, out of the way: pause new answers, and revoke every live code. Use those if a code gets passed around outside the building.

### Moderate (your phone)

One pending comment, full screen. The question, the moniker, the choice they made, the text. Two buttons: Approve and Reject. A count of how many are waiting. Approve publishes it to Play and to the projector. Reject drops it. The vote still counts either way.

Nothing in this queue is visible on `/host`.

## The code and the clock

The QR is a join code for the whole booth, not a key to one question. Scanning question 3 still lets that phone answer the others until the code dies.

The picture on the screen changes every 5 minutes. Each code is valid for 10 minutes from the moment it was minted. After a changeover, the code just removed still works, and so does the new one. Two codes are live for those five minutes. That is the skew: a phone that scanned near the end of a cycle is not cut off when the picture flips.

```
0:00   show code A     A good until 10:00
5:00   show code B     A good until 10:00, B good until 15:00
10:00  show code C     A is dead, B good until 15:00, C good until 20:00
```

The host page shows a countdown to the next picture so you know a flip is coming. The image swaps in place. Give it a short beat so a camera does not catch a half-drawn code.

Redeeming a code sets a cookie and sends the phone to `/play` with a clean address. Refreshing `/play` does not create a second moniker. Scanning a later code extends the same moniker up to the new expiry. When the cookie lapses, the phone is back to browse until they scan again. A few minutes is enough for this station; it is also what keeps a photographed code from becoming an all-day ballot.

Server clock only. Validate the signature, the expiry, and a revoke-before timestamp. The code itself is stateless:

```
payload = { iat, exp, n }
token   = base64url(payload) + "." + base64url(HMAC-SHA256(secret, payload))
url     = https://iamgoingtoul.fly.dev/j/<token>
```

`n` is a random id so a leaked code can be identified. Revoke-all stores a timestamp; any code minted before it fails.

Render the QR in the browser from that string (error correction level Q or H, black on white, quiet zone). Do not serve it as a cached image.

## Monikers

Assigned at redeem. Never typed. A fixed list of school-safe pairs (`Zydeco` + `Scout`, `Bayou` + `Pilot`, `Vermilion` + `Rover`, …) plus a number when the pair is taken. Store the moniker with every answer.

Say it on the phone in plain language: this is the name that can appear on the screen in the room.

## Questions

Choice questions may take one optional comment. The reveal is stored with the question and shown only after that phone has answered. Keep projector titles short.

1. **When will humans first set foot on Mars?**
   Before 2030 · In the 2030s · In the 2040s · After 2050
   Reveal: SpaceX is building Starbase, LA, a spaceport on the Louisiana Gulf Coast, in Vermilion Parish — about 50 miles south of Lafayette. Whenever the landing is, that work is already in the next parish. (Source: https://www.spacex.com/sites/starbase-la)

2. **A Mars colony needs people who can build which of these?** (pick any)
   Autonomous vehicles · Robotics · Power and life support · Software and AI · Communications
   Reveal: Rockets get you there. Computing is what keeps you there. That is the work of this school.

3. **True or false: UL Lafayette fielded a self-driving car before Tesla.** True · False
   Reveal: True. Team CajunBot ran in the DARPA Grand Challenge and the Urban Challenge, years before Tesla Autopilot. The first vehicle was a six-wheel all-terrain vehicle.

4. **Which of these vehicles is better suited for Mars?**
   CajunBot, a six-wheeled all-terrain vehicle · RaginBot, a Jeep Wrangler
   Reveal: CajunBot. Six wheels on an all-terrain chassis fit broken ground better than a Wrangler. An electric version of that shape still fits. The harder problem is the software that decides where the wheels go.

5. **How will AI change the world over the next ten years?**
   Take jobs · Create jobs · Change the jobs we have · Fade as hype
   Optional line: the job you want, and what AI does to it.
   Reveal: one spoken beat from you. The interesting lines go on the screen after you approve them.

6. **Ask me anything about computing, Mars, or UL Lafayette.** Comment only, 140 characters.
   No reveal. You answer out loud. Approved questions stack on the projector.

7. **If you joined a Mars mission, what would you rather build?**
   The vehicle that drives on Mars · The software that drives a Mars vehicle · The base people would live in · The systems that keep the crew alive
   Reveal: Any of these is a path through UL Lafayette's School of Computing and Informatics. Say which labs match which choice, out loud.

Drop 2 or 7 if the build is tight. Do not drop 3, 4, or 6.

## Data

SQLite on one Fly volume. One process. This is a few thousand rows for a single day.

- `questions` — id, position, title, prompt, kind (`single`, `multi`, `open`), reveal text
- `choices` — id, question id, label, position
- `participants` — id, moniker, created at, session expiry
- `answers` — participant id, question id, choice id nullable, created at. Unique on (participant, question, choice) for multi-select; unique on (participant, question) for single and open
- `comments` — id, participant id, question id, body, status `pending | approved | rejected`, created at
- `settings` — revoke-before timestamp, paused flag

Poll totals count answers, and they do not wait on the comment. Comments publish only from `pending` to `approved`.

## Requests

Public:

- `GET /j/:token` — check the code, create or extend the participant, set the cookie, redirect to `/play`
- `GET /api/questions` — browse: prompts and choices. Play: the same, plus whether this phone has answered
- `POST /api/answers` — `{ questionId, choiceIds, comment? }` while the cookie is live and the booth is not paused
- `GET /api/questions/:id/results` — only if this phone has answered; counts, reveal, approved comments

Admin cookie:

- `GET /api/host/code` — the code currently on screen, the URL, seconds until the picture changes, seconds until that code dies
- `GET /api/host/live?questionId=` — counts and the latest approved comments
- `POST /api/host/pause` and `POST /api/host/revoke`
- `GET /api/mod/next` — oldest pending comment
- `POST /api/mod/:id/approve` and `POST /api/mod/:id/reject`

Play and Host poll about once a second. A socket is extra machinery for a gym network. The projector is on a laptop you control; the phones only need the post to succeed.

## Rules that keep the room safe

- No names, emails, photos, or accounts. High school students. The moniker is the only identity.
- Comments cap at 140 characters. One comment per phone per question.
- A short denylist marks a comment in the queue so the worst ones are a single Reject. The mark does not publish anything. You still approve by hand.
- Rate-limit redeem and post by IP tightly enough to blunt a script, loosely enough that thirty phones on one carrier NAT still work.
- Admin password and HMAC secret live in Fly secrets.
- After the day, delete the SQLite file or keep the counts and drop the comment text.

## Build order

1. Questions, redeem, moniker, vote, results after vote.
2. Host page with a stable QR and the 5/10 clock.
3. Moderation page and the rule that Host only reads `approved`.
4. Browse page and the UL colors (vermilion `#CE1126`, white, near-black `#141414`).
5. Pause, revoke, Present, number keys.
6. Deploy to Fly, then scan from the back of a real room. Fix the QR size until a phone locks on in a second.

Leave these out of the first deploy: chaperone-versus-student charts, pinning one AMA question, a custom domain, animations.

## Tomorrow morning

- Laptop plugged in, sleep disabled, browser full screen on `/host`.
- Your phone on `/mod`, already logged in.
- A second person on `/mod` if you want both hands free to talk. Same password, same queue.
- One rehearsal scan from the doorway before the first group.
- If the queue gets ahead of you, the vote bars still move. Approve the lines you would be glad to read aloud.
