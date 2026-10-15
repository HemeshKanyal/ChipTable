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
- Only members can read the room, its players, hands, votes and nudges.
- The password hash lives in `rooms/{id}/secrets/join`, which only the host can read. Joiners only see the salt (in `codes/{code}`).

**Seats and stacks**
- New players start with exactly `settings.startingStack` and `totalRebuys == 0`.
- Players can never change their own `stack` or `totalRebuys`.
- A player can only claim an empty seat for themselves, release their own seat, hold one seat at a time, and use seat numbers below `maxPlayers`.
- A player's `status`/`seatIndex` must match the room's seat map after every write.
- Presence (`lastSeen`) must be the server's time.

**Hands and chips (wallet mode)**
- Only the host can start a hand, and only when none is running. Settings are locked while a hand is on.
- A contribution must take exactly as many chips from your stack as it adds to the pot, and only into your own column. The feed entry must match, and earlier feed entries can't be rewritten. The two documents check each other in the same write.
- Stacks can't go below zero; you can't bet while sitting out or once voting starts.
- Payouts must be non-negative and add up to exactly the pot. Each winner's stack rises by exactly their payout.
  - A win must match the host's decision recorded on the accepted vote.
  - A called-off hand must refund exactly what each player put in.

**Hands and chips (guided mode)**
- The engine state lives on the hand doc. Player stacks don't move during the hand; they settle once, when it ends.
- Only the host deals. Blinds must match the room's settings and the starting pot can't exceed SB + BB.
- **Only the player to act (`toActUid == auth.uid`) can write a move.** The host may fold, and only fold, for a player who left or hasn't sent a heartbeat for 2 minutes.
- Every move bumps `actionCount` by exactly one, so two clients can't both act on the same turn.
- Your total in the hand can only grow on your own move, and never past the stack you sat down with. Totals are never negative and always add up to the pot.
- The hand can only end early by the last player folding. Then the whole pot goes to the one player left, and that same write clears the room's current hand.
- At settlement each stack moves by exactly `payout − chips put in` from the finished hand doc, and can't end below zero. Payouts are non-negative and add up to the pot.
- A called-off guided hand records every player's chips as returned, so no stack changes.

**Votes**
- One ballot per voter (a map keyed by your uid), only for listed candidates, only from players seated when voting opened, and only until 30 seconds after the server opened the vote.
- Only the host closes a vote, and can accept only after time is up or everyone has voted.
- Guided showdowns open one vote per pot. A pot's candidates must be exactly the players the hand lists as able to win it, so a folded or short all-in player can't be voted a side pot.

**Rebuys**
- You can only ask for chips for yourself (1 to 1,000,000), tagged with the current season. You can cancel your own request.
- Only the host approves or denies. An approval must pay in the same write: the player's stack and `totalRebuys` grow by exactly the request's amount (checked through `lastRebuyId`). A request from an earlier season can't be paid.

**Room reset and seasons**
- Anyone at the table can open a reset vote, between hands only, and only when no other reset vote is open. Their own ballot is "yes"; everyone else votes yes or no once (changeable until 30s are up).
- **The rules count the yes votes themselves:** only the host can accept, and only when more than half of the voters said yes. The same write must archive the outgoing season (`seasons/{id}`, write-once), switch the room to a new season id, and put every stack it touches back to the starting amount with zero rebuys.
- Anyone can close a vote as failed once time is up (or everyone voted) without enough yes; the host can call it off any time.
- Hands record their season; every finished hand records each player's stack afterwards (for timelines).

**Nudges**
- One doc per sender (`nudges/{yourUid}`), so you can only nudge as yourself, at someone else in the room, with one of the 8 presets, and at most once every 15 seconds by the server's clock.

**Host**
- Only the host can change the name, settings or password, remove players, or hand over hosting.
- Settings are range-checked (stack 1–1,000,000, `sb ≥ 1`, `sb ≤ bb ≤ stack`, mode `guided`/`wallet`, 2–10 seats).
- Anyone else can take over hosting only when the host has left, or the server's clock says the host hasn't sent a heartbeat for 2+ minutes. The new host must be at the table and online.

## Known gaps (need server code to close)

| Gap | Why it's acceptable here |
| --- | --- |
| **The host is trusted to follow the vote.** Rules check that a payout matches the host's accepted decision, but not that it matches the majority (rules can't count ballots). | Spec: the host confirms the result. Everyone sees the breakdown, and the tally is stored on the hand. |
| **Payouts reach at most 10 players.** Rules have no loops, so payouts are summed with a fixed 10-term expression. | Tables seat at most 10. |
| **A host could finish a hand without crediting a winner's stack** in the same write. Rules check each stack that is written, but can't require that every winner's stack is written. | The app always writes them together in one transaction. |
| **Feed timestamps use the device clock.** Firestore doesn't allow server timestamps inside arrays. | Display only. |
| **Guided moves aren't replayed by the rules.** The player to act writes the next engine state; rules check who acted, the action count, and the chip totals (yours only grows, never past your stack, everything sums to the pot), but can't re-run the betting logic. So a modified client on its own turn could, say, skip the min-raise rule or move another player's total down. | Only the player whose turn it is can write, everyone watches the feed, and the host can call the hand off. |
| **Per-pot payouts trust the host.** Rules check that guided payouts add up to the pot and only go to listed winners, but can't check each pot's split against each accepted vote (no loops over pots). | Same as wallet mode: the host confirms results in front of everyone. |
| **Reset voters are listed by the proposer.** Rules check the proposer is at the table and in the list (max 10), but can't check the list matches the seat map. | The list is shown in the vote; the host confirms. |
| **A reset can't prove it touched every player.** Rules check each stack it writes, but can't require a write for every player doc. | The app resets every player in one transaction. |
| **Leaderboard and session stats are computed on the client** from hand docs, and `stacksAfter` isn't verified by the rules. | Display only; stacks themselves are protected. |
| **"Gone quiet" uses advisory presence.** The host can fold for a player whose heartbeat is 2+ minutes old. | Fold only, never bet; same trust as host takeover. |
| **Ballots aren't secret.** Members can read the vote doc. | It's a show of hands. |
| **Passwords are online-guessable.** Anyone with the code can retry member writes. There's no rate limit beyond Firestore's own. | Passwords are a casual extra; the code is the real gate. |
| **Members can see the code forever.** Changing the password doesn't remove existing members. | Matches how a real home game works. |
| **Removed players can rejoin** with the code (they keep their stack). There's no ban list yet. | Small, trusted groups. The host can change the password to stop new joins. |
| **Host takeover picks "the next player clockwise" on the client.** Rules only check that the new host is seated and online, not that they're exactly the next seat. | Any seated, online player is a reasonable host. |
| **Lowering `maxPlayers` below an occupied seat** is blocked in the UI, not in the rules (rules can't scan map keys). | Only the host can change it. |
| **Presence is advisory.** A modified client could keep sending heartbeats while away. | Worst case, host passes on a bit later. |
| **SHA-256 on the client**, with a per-room salt. This isn't a slow password hash. | The hash is only readable by the host. |
