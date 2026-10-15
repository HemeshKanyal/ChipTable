# ChipTable

Digital poker chips for real-life card games. Real cards on the table, play chips on your phone. **Play money only.**

The build spec is in [`poker-chips-spec.md`](./poker-chips-spec.md). This README covers local setup; deploy steps arrive in Phase 7.

## Stack

Next.js (App Router, TypeScript strict) · Tailwind CSS v4 · Framer Motion · Firebase Auth (Google) + Cloud Firestore · Vitest

## Local development

You need **Node 20+** and **Java 21+** (the Firebase emulators run on the JVM).

```bash
npm install
cp .env.example .env.local   # defaults point at the emulators, so no Firebase project is needed

# terminal 1: Auth + Firestore emulators (UI at http://localhost:4000)
npm run emulators

# terminal 2: the app at http://localhost:3000
npm run dev
```

With the emulators running, "Continue with Google" opens the emulator's fake Google picker. Choose **Add new account** and enter any name and email. You can see the resulting `users/{uid}` document in the Emulator UI under Firestore.

### Trying multiplayer on one computer

Open a second browser profile (or a private window) and sign in as a different emulator account. Create a room in one window, then join it from the other with the code or the invite link.

### Playing a wallet-mode hand

1. Create the room in **Wallet** mode (or switch it in ⚙ settings), then get two or more people seated.
2. The host taps **Start hand**. The dealer button moves one seat clockwise each hand.
3. Anyone seated taps chips (or types an amount) and **Bet**s. Every bet shows in the feed in the middle of the table.
4. When the cards are turned over, the host taps **Showdown · vote**. Everyone seated gets 30 seconds to pick the winner, or several winners for a split.
5. The host accepts the majority (or picks among tied top choices), or redoes the vote. The pot flies to the winners.

**Call off hand** refunds everyone, for misdeals.

### Playing a guided hand

Guided mode runs real No-Limit Hold'em betting; the cards stay on the table.

1. Create the room in **Guided** mode (the default), get two or more people seated, and the host taps **Deal hand**. The button moves, the blinds go in, and the right player is up.
2. Only the player to act gets buttons: **Fold**, **Check** or **Call**, and **Bet/Raise** with a slider and quick sizes (min, ½ pot, ¾ pot, pot, all-in). Everyone else sees who we're waiting on, and can send them a **🐢 Nudge** (one every 15 seconds); it pops up and buzzes on their phone.
3. When a street ends, a big **Deal the FLOP (3 cards)** banner tells the dealer what to put out. If everyone is all-in, betting stops and the banner says which cards to run out.
4. Everyone folding to one player ends the hand at once, no vote. Otherwise, at showdown the host taps **Showdown · vote** and the table votes on every pot separately (side pots list only the players who can win them). Once the host has accepted every pot, the chips move.
5. If the player to act has left or gone quiet for 2 minutes, the host can **Fold for** them. **Call off hand** leaves every stack where it was.

During a guided hand, stacks shown at the table are live; the stored stacks settle when the hand ends.

### Testing from a phone on your Wi-Fi

1. Find your computer's LAN IP (e.g. `192.168.1.20`).
2. Start the app with that origin allowed. Without this, Next.js blocks dev assets for other hosts and the page never finishes loading:
   `DEV_ORIGINS=192.168.1.20 npm run dev`
3. Open `http://192.168.1.20:3000` on the phone. The app reaches the emulators on the same host automatically, since they listen on all interfaces.

### Running the emulators on other ports

If something else holds 9099/8080 (say, a second checkout's emulators), start yours on other ports and tell the app with `NEXT_PUBLIC_AUTH_EMULATOR_PORT` and `NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run emulators` | Firebase Auth + Firestore emulators (`demo-chiptable` project) |
| `npm test` | Vitest unit tests |
| `npm run test:rules` | Security Rules tests (starts its own Firestore emulator; stop `npm run emulators` first, or run `npx vitest run -c vitest.rules.config.mts` against the running one) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

## Using a real Firebase project

1. Create a project, enable **Authentication → Google**, and create a **Firestore** database.
2. Add a Web app and copy its config into `.env.local`, then set `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false`.
3. Deploy the rules: `npx firebase deploy --only firestore:rules --project <your-project-id>`.

See [`SECURITY.md`](./SECURITY.md) for what the rules guarantee and what they can't.

## Project layout

```
app/                 routes, root layout, global theme (globals.css)
components/          UI: auth/, home/, layout/, ui/
lib/firebase/        Firebase client init, emulator wiring, Firestore helpers
lib/chips.ts         chip denominations and amount → chip breakdown
lib/room/            pure room logic: codes, settings validation, seating, host succession
lib/hooks/           live Firestore subscriptions (room, My Rooms, presence)
tests/rules/         Security Rules tests against the emulator
lib/engine/          pure guided-mode game logic (see "Game engine" below)
lib/hand/            pure glue between the engine and the hand doc / UI (banners, raise sizes, nudges)
lib/firebase/guided.ts  guided hands: deal, act, per-pot votes, settle, nudges (Firestore transactions)
firestore.rules      Security Rules
```

## Game engine

`lib/engine/` is plain TypeScript with no Firebase or React. `startHand` posts the blinds, and `applyAction` takes a state and an action and returns the next state (it never mutates). `legalActions` tells the UI what the player to act may do, and `settle` pays out. The state is plain data, so it can be stored on the hand document as-is.

Rules it implements:

- **Blinds:** small and big blind left of the button. Heads-up, the button posts the small blind and acts first preflop, last after. Short stacks post what they have and are all-in; others still have to match the full big blind, and any over-call comes back.
- **Turn order:** preflop starts left of the big blind (who keeps their option). After the flop, action starts with the first live player left of the button. Folded and all-in players are skipped.
- **Raises:** a raise must be at least the last full bet or raise on that street (minimum bet is one big blind). A smaller raise is allowed only as an all-in and doesn't let players who already acted re-raise, unless several short all-ins together add up to a full raise (TDA rule). Nobody can raise when no one left could call.
- **Uncalled bets** go back to the bettor when the round ends.
- **Early showdown:** when at most one player can still bet, betting stops and `cardsToDeal` says what the dealer must still put out.
- **Side pots:** a pot is capped at each all-in level, with its own eligible players. Folded chips stay in; pots with the same players merge. A pot only one player can win is paid automatically.
- **Splits:** even shares, odd chips to the first winner clockwise from the button.
- **Not modelled:** dead button and missed-blind rules (the button always moves to the next player dealt in), antes, and straddles.

`currentPots` shows the pots mid-hand: only all-in players cap a pot, since anyone still betting can reach every level.

Tests: `lib/engine/*.test.ts`, including heads-up, multi-way all-in side pots, and a randomised test that plays 3,000 random hands and checks that chips are conserved, the right player always acts, every hand ends, payouts equal the pot, the pots shown always add up, and your own move never lowers what you've put in (the Security Rules rely on that).

## Build phases

- [x] **1. Foundation**: setup, theme tokens, Firebase + emulators, Google sign-in, users collection, felt layout
- [x] **2. Rooms**: create with settings, join by code/link/QR (+ password), My Rooms, seating, presence, host transfer
- [x] **3. Wallet mode**: start a hand, chip buttons + custom bets, live feed, 30s winner vote (split pots), host accept / redo / call off, payout animation
- [x] **4. Engine**: pure No-Limit Hold'em betting engine in `lib/engine/` with Vitest tests (blinds incl. heads-up, button rotation, turn order, min-raise, incomplete all-ins, side pots, settlement)
- [x] **5. Guided mode UI**: deal with auto blinds, turn-enforced Fold/Check/Call/Bet/Raise (slider + min/½/¾/pot/all-in), street and run-out banners, live side pots, a vote per pot, instant win on fold-out, host fold-for-absent, nudges
- [ ] 6. Rebuys, reset vote, history, leaderboard, seasons
- [ ] 7. Polish
