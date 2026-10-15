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

### Testing from a phone on your Wi-Fi

1. Find your computer's LAN IP (e.g. `192.168.1.20`).
2. Start the app with that origin allowed. Without this, Next.js blocks dev assets for other hosts and the page never finishes loading:
   `DEV_ORIGINS=192.168.1.20 npm run dev`
3. Open `http://192.168.1.20:3000` on the phone. The app reaches the emulators on the same host automatically, since they listen on all interfaces.

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
lib/engine/          (Phase 4) pure game logic
firestore.rules      Security Rules
```

## Build phases

- [x] **1. Foundation**: setup, theme tokens, Firebase + emulators, Google sign-in, users collection, felt layout
- [x] **2. Rooms**: create with settings, join by code/link/QR (+ password), My Rooms, seating, presence, host transfer
- [x] **3. Wallet mode**: start a hand, chip buttons + custom bets, live feed, 30s winner vote (split pots), host accept / redo / call off, payout animation
- [ ] 4. Engine
- [ ] 5. Guided mode UI
- [ ] 6. Rebuys, reset vote, history, leaderboard, seasons
- [ ] 7. Polish
