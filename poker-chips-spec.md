# Build Spec: "ChipTable" — Digital Poker Chips for Real-Life Card Games

You are building a mobile-first web app that replaces physical poker chips. Friends sit at a real table with real cards; each player opens the app on their phone and bets **digital play chips**. The app never deals cards; it only manages chips, pots, turns, votes, and history.

**Play money only.** There are no payments, deposits, cash-out or anything tied to real money. Do not add any payment features.

Build in the phases listed at the end. After each phase the app must run and be usable. Ask me before deviating from this spec in any significant way.

---

## 1. Tech stack

- **Next.js** (App Router) + **TypeScript** (strict)
- **Tailwind CSS** for styling
- **Framer Motion** for animations
- **Firebase**: Authentication (Google sign-in only) and Cloud Firestore with real-time listeners
- **No Cloud Functions.** We stay on the free Spark plan. All state changes go through **Firestore transactions** from the client, protected by strict **Security Rules**.
- Hosting on Vercel; config through `.env.local` (provide `.env.example`)
- Installable as a PWA (manifest + icons), portrait orientation

Keep all game logic (blinds, turn order, min-raise, side pots, settlement) in **pure TypeScript functions** in `lib/engine/`, separate from Firebase code, with **unit tests (Vitest)**. The UI and Firestore layer call these functions inside transactions.

---

## 2. Core concepts

### Users
- Google sign-in is required. Store `users/{uid}` with displayName, photoURL, and createdAt.
- A user can be in many rooms.

### Rooms (persistent, private, named)
- The creator becomes the **host** and sets:
  - Room name (required)
  - Starting stack (e.g. 1000)
  - Small and big blind
  - **Game mode**: `guided` or `wallet` (see §3). The host can change it between hands.
  - Max players: 2–10
  - Optional password
- **Joining** is private only: a 6-character join code, a shareable link and a QR code. Add a password prompt if one is set. There is no public room list.
- **Home screen** has two choices: "My Rooms" (rooms the user has joined before, with last-played time) and "Create New Room".
- Rooms persist. Stacks, winners, history and the leaderboard carry over between sessions.
- **Seats**: a player sitting down for the first time gets the starting stack. Returning players keep their stack. A player can be `seated`, `sitting out` or `left`.

### Host
- Can start hands, confirm votes, approve rebuys, confirm a room reset, kick players, and change settings between hands.
- **Host transfer**: if the host leaves the room or is offline for more than 2 minutes (use a presence heartbeat), host passes to the next seated player clockwise. The host can also hand over manually.

---

## 3. Game modes

### Guided mode (rules enforced)
The app runs a real Texas Hold'em betting structure. The cards stay physical.

- **Dealer button** rotates automatically each hand. Blinds are posted automatically, including heads-up rules: with 2 players, the button posts the small blind and acts first preflop.
- **Streets**: preflop → flop → turn → river → showdown. Show a big banner such as "Deal the FLOP (3 cards)" so the physical dealer knows when to deal.
- **Turn order** is enforced. Only the player whose turn it is sees active action buttons: Fold, Check, Call X, Bet/Raise (slider plus quick buttons: min, ½ pot, ¾ pot, pot, all-in).
- **Min-raise rules** are correct, including incomplete all-in raises not reopening the action.
- **All-ins and side pots**: compute the main pot and side pots correctly, track which players are eligible for each pot, and show them separately in the UI.
- If everyone folds but one player, that player wins immediately with no vote.
- If all remaining players are all-in, skip the betting rounds and prompt the dealer to run out the board.
- **No turn timer.** The game waits for the player. Other players can send a **Nudge**: a playful preset tease ("🐢 Today please", "⏰ The flop is getting old", "😴 Wake up", etc., about 8 presets). The target's phone shows an animated toast and vibrates. Rate limit: 1 nudge per sender per 15 seconds.

### Wallet mode (free-form)
A digital chip wallet with no turn enforcement.

- The host starts a hand, which creates an empty pot.
- Any seated player can put chips into the pot at any time (quick chip buttons plus a custom amount).
- Each contribution appears in a live feed ("Rahul +200").
- The hand ends with a **winner vote** (§4).

---

## 4. Voting system

### Winner vote (both modes, at showdown)
1. Voting opens for **30 seconds**. All seated players at the table can vote, including folded players.
2. Each voter selects one or more winners per pot. Selecting several winners means a split pot. In guided mode, **each side pot gets its own vote**, and only eligible players can be chosen for it.
3. When the timer ends or everyone has voted, the result shown to the **host** is the majority choice plus the full vote breakdown.
4. The host either **accepts**, which pays out the pot with an animation, or **redoes** the vote, which starts a fresh 30s round. If there is no majority, the host sees the breakdown and can redo or pick from the top choices.
5. Split pots divide evenly. Odd chips go to the first winner clockwise from the button.

### Room reset vote
- Any player can propose "Reset room": all stacks back to the starting amount and the current session archived.
- A 30s vote runs. On majority yes, the host confirms. On no majority, the proposal fails.
- History and the leaderboard **keep the archived session**; a reset starts a new "season".

### Rebuy / top-up
- A player requests an amount. The host gets an approve/deny prompt. Approved amounts are recorded in history as rebuys, and the leaderboard accounts for them in net profit.

---

## 5. History and leaderboard

- **Hand history**: every completed hand stores the date, mode, pot(s), each player's contributions, winners, and how the hand was decided (fold, or a vote with its tally).
- **Leaderboard per room/season**: current stack, net profit (stack − starting stack − rebuys), hands won, biggest pot won, and win rate.
- **Session view**: a summary of each session (one evening of play), with a timeline of stacks.
- **Hand review screen**: a scrollable list of past hands. Tapping one shows the full action log. This is for learning.

---

## 6. Data model (Firestore — suggested; refine if needed)

```
users/{uid}
rooms/{roomId}
  name, code, passwordHash?, hostUid, settings{startingStack, sb, bb, mode, maxPlayers},
  seasonId, status, createdAt, lastActiveAt
rooms/{roomId}/players/{uid}
  seatIndex, displayName, photoURL, stack, status, totalRebuys, lastSeen
rooms/{roomId}/hands/{handId}
  number, mode, buttonSeat, street, toActUid, currentBet, minRaise,
  pots[{amount, eligibleUids[]}], contributions{uid: amount}, actions[], status, result
rooms/{roomId}/votes/{voteId}
  type ('winner' | 'reset'), handId?, potIndex?, openedAt, endsAt,
  ballots{uid: choice}, status, hostDecision
rooms/{roomId}/requests/{requestId}   (rebuys)
rooms/{roomId}/nudges/{nudgeId}
rooms/{roomId}/seasons/{seasonId}      (archived stats on reset)
```

Hash room passwords client-side before storage (SHA-256 with a salt is fine; this is a casual app).

---

## 7. Security (free plan, no Cloud Functions)

- All chip movements happen inside **Firestore transactions** that read the current hand state and apply the pure engine functions.
- **Security Rules** must enforce at least the following:
  - Only signed-in room members can read room data, and only someone with the correct code (and password, if set) can join.
  - Players can only write their own action, and in guided mode only when `toActUid == request.auth.uid`.
  - A player's stack can never go negative, and a bet can't exceed their stack.
  - Only the host can confirm votes, approve rebuys, start hands, change settings and kick players.
  - Ballots: one per user per vote, editable only before `endsAt`.
- Write Firestore Rules unit tests using the Firebase emulator.
- Use the **Firebase Emulator Suite** for local development.
- Document any rule that can't be fully enforced without server code (e.g. full chip conservation) in `SECURITY.md`. This is acceptable for a friends' game.

---

## 8. Design and animation: full poker theme

The app should feel like sitting at a real casino table, and it must look polished.

- **Visual style**: dark green felt table texture with a subtle vignette, wooden or leather rail edge, and gold accents. Use an elegant serif for headings (e.g. Playfair Display) and a clean sans for numbers (e.g. Inter, with tabular numbers).
- **Chips**: SVG chips with classic denominations and colours: 1 white, 5 red, 25 green, 100 black, 500 purple, 1000 yellow. Show stacks as visual chip piles broken into denominations, not just numbers.
- **Table layout** (portrait phone): an oval table with seats around it showing avatar, name, stack, current bet and status. Mark the dealer button "D" and the SB/BB markers. The pot sits in the centre. The current user's seat is at the bottom, enlarged, with action controls.
- **Animations (Framer Motion)**:
  - Chips fly from a player's seat into the pot when they bet
  - Bets collect into the pot at the end of each street
  - The pot slides to the winner(s) with a short sparkle or celebration, and splits visibly for split pots
  - A pulsing glow ring around the player whose turn it is
  - A countdown ring on the voting modal
  - Smooth number roll for stack changes
  - A bouncy nudge toast with a shake
  - Respect `prefers-reduced-motion`
- **Sound and haptics**: chip clack, pot win, nudge, and "your turn" sounds, plus vibration on your turn and when nudged. Include a mute toggle saved per user.
- **Table View** (`/room/[id]/table`): a large-screen, read-only display for a laptop or tablet in the middle of the table, showing all seats, stacks, pots, street banner and animations. No sign-in is needed beyond room access.
- Fully responsive. Primary target is phones 360–430px wide. No horizontal scrolling.
- Handle loading, empty and error states gracefully. Show a reconnecting banner on network loss.

---

## 9. Learning helpers

- A **hand rankings cheat sheet** (bottom sheet, opened from an icon)
- **Pot odds** shown when facing a bet in guided mode ("Call 200 to win 800 → 20% equity needed")
- The hand history review screen (§5)

---

## 10. Build phases

Each phase should end in a working, testable state. Commit at the end of each phase.

1. **Foundation**: project setup, Tailwind theme tokens, Firebase config with emulators, Google sign-in, users collection, basic layout and felt theme.
2. **Rooms**: create a room with settings, join by code/link/QR with password, My Rooms list, seating, presence, host transfer.
3. **Wallet mode**: start a hand, contribute to the pot, live feed, winner vote with 30s timer, host confirm or redo, payout.
4. **Engine**: pure guided-mode engine (blinds, button rotation, turn order, min-raise, all-ins, side pots, settlement) with thorough Vitest tests, including heads-up and multi-way all-in side pot cases.
5. **Guided mode UI**: action controls, street banners, per-pot voting, nudges.
6. **Rebuys, room reset vote, history, leaderboard, seasons.**
7. **Polish**: full chip animations, sounds, haptics, Table View, learning helpers, PWA, Security Rules plus rules tests, `README.md` with setup and deploy steps.

## 11. Non-goals
- No real money, payments or cash-out
- No card dealing or card recognition
- No public room browsing or matchmaking
- No native app (PWA only)
