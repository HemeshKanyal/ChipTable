# Security model

ChipTable runs on Firebase's free Spark plan with **no Cloud Functions**. Every write comes straight from a client and is checked only by `firestore.rules`. That's fine for play chips among friends, but some guarantees need server code, and they're listed honestly below.

Rules are tested in `tests/rules/` (`npm run test:rules`), using the app's real data-layer functions from `lib/firebase/rooms.ts`.

## What the rules enforce

**Accounts**
- Only signed-in users can read or write anything.
- `users/{uid}`: only you can write it; only `displayName`, `photoURL` and `createdAt` are allowed; `createdAt` is fixed.

**Joining (private rooms)**
- Rooms can't be listed or browsed. `codes/{code}` allows `get` but not `list`, so you need the exact 6-character code.
- To become a member you write `rooms/{id}/members/{uid}`. The rules accept it only if it contains the room's current code and the correct salted password hash (or `null` when the room has no password). It's write-once.
- Only members can read the room, its players, and (later) hands and votes.
- The password hash lives in `rooms/{id}/secrets/join`, which only the host can read. Joiners only see the salt (in `codes/{code}`).

**Seats and stacks**
- New players start with exactly `settings.startingStack` and `totalRebuys == 0`.
- Players can never change their own `stack` or `totalRebuys`.
- A player can only claim an empty seat for themselves, release their own seat, hold one seat at a time, and use seat numbers below `maxPlayers`.
- A player's `status`/`seatIndex` must match the room's seat map after every write.
- Presence (`lastSeen`) must be the server's time.

**Host**
- Only the host can change the name, settings or password, remove players, or hand over hosting.
- Settings are range-checked (stack 1–1,000,000, `sb ≥ 1`, `sb ≤ bb ≤ stack`, mode `guided`/`wallet`, 2–10 seats).
- Anyone else can take over hosting only when the host has left, or the server's clock says the host hasn't sent a heartbeat for 2+ minutes. The new host must be at the table and online.

## Known gaps (need server code to close)

| Gap | Why it's acceptable here |
| --- | --- |
| **Chip conservation.** Rules can't sum stacks across documents, so they can't prove chips are neither created nor destroyed across a whole hand. Arriving with Phases 3–5: each write will be checked against the hand state it touches, but not globally. | Friends' game, play chips only, full history visible to everyone. |
| **Passwords are online-guessable.** Anyone with the code can retry member writes. There's no rate limit beyond Firestore's own. | Passwords are a casual extra; the code is the real gate. |
| **Members can see the code forever.** Changing the password doesn't remove existing members. | Matches how a real home game works. |
| **Removed players can rejoin** with the code (they keep their stack). There's no ban list yet. | Small, trusted groups. The host can change the password to stop new joins. |
| **Host takeover picks "the next player clockwise" on the client.** Rules only check that the new host is seated and online, not that they're exactly the next seat. | Any seated, online player is a reasonable host. |
| **Lowering `maxPlayers` below an occupied seat** is blocked in the UI, not in the rules (rules can't scan map keys). | Only the host can change it. |
| **Presence is advisory.** A modified client could keep sending heartbeats while away. | Worst case, host passes on a bit later. |
| **SHA-256 on the client**, with a per-room salt. This isn't a slow password hash. | The hash is only readable by the host. |
