# Al-Bawardi — Game Plan for a Mobile Cowboy Duel Game

## 1. Game Summary and What Makes It Special

**Game name: "Al-Bawardi" (البواردي).** In Gulf heritage, a *bawardi* is a skilled rifleman. The name has local roots and strong resonance with the target audience, and it fits a shooting and dueling game without imitating the name High Noon.

**The idea in one sentence:** A 20–40 second cowboy duel where the phone is the gun: lower it to your side, wait for the signal, draw, aim with your hand, tap the screen to fire, and reload with a flick of the wrist.

### The Four Pillars (every decision in this document is measured against them)

1. **Your body is the weapon.** Every core action (draw, aim, reload) is a real physical movement; touch is only the trigger. This is what a button-based game cannot offer.
2. **Silence, then explosion.** Seconds of quiet tension, then two seconds of chaos. Sound and rhythm matter more than graphics.
3. **Skill, not luck.** The winner is usually the fastest and most accurate, not whoever rolled the better random number. Any randomness is small and visible.
4. **From link to duel in one minute.** No heavy download, no mandatory sign-up, no long menus before the first shot.

### What Makes It Special (ideas proposed beyond the original brief)

- **The falling coin as the start signal:** A coin is tossed into the air with a random fall time; the moment it hits the ground (a "tink" sound plus dust) is the signal. This builds visual tension instead of a countdown that can be memorized.
- **False signals:** A crow taking off, a saloon door banging, a distant bell. Sounds that fray the nerves and punish anyone who draws on a guess (early draw = round lost).
- **"Composure" instead of health alone:** An arm hit makes your aim reticle shake, so the duel doesn't end on the first graze but gets harder for the wounded player. This creates skill-based comeback moments.
- **The hat shot:** Hitting the opponent's hat does no damage, but it sends the hat flying and it's saved as a trophy in your collection. Show-off and playful humiliation with no balance impact.
- **Shareable final-shot replay:** A slow-motion replay of the last shot, exported as a short video or image with a challenge link. This is the main virality engine on TikTok and WhatsApp.
- **Ghost duels:** Every duel records the player's draw timing and aim path, so you can duel the "ghost" of a real player even when nobody is online. This solves the low-player-count problem at launch, the biggest problem for any new online game.

## 2. Game Loop, Step by Step

Goal: **first shot within 60 seconds of opening the link** for the first time, and **under 10 seconds** between the end of one duel and the start of the next.

### First Journey (new player)

1. **Open the link:** A light title screen (under 1.5 MB for the first load) with one big button: "Enter the Street." That same tap unlocks audio and requests sensor permission on iPhone (the permission must be requested from a user tap).
2. **Automatic guest play:** A silent guest account is created with a random ID. No name, no email. Account linking is offered later, after the first win or the first cosmetic purchase.
3. **Explain permission before requesting it:** One card with an animation of a hand holding the phone and the line: "The game needs your phone's movement to aim." Then the system prompt appears. If the player refuses: switch straight to touch controls without frustration, with a "Try motion again" button.
4. **Test and calibration (15 seconds):** "Hold the phone in front of you as if aiming" → a bottle on screen moves with your hand → "Lower it to your side" → "Raise it fast." We measure axis direction, sensor rate, and the right draw threshold for this device.
5. **Interactive training:** Instead of explanation pages, three tin cans on a fence: draw and hit one can, then reload, then hit two cans. Each move is taught in the moment.
6. **First duel against the computer:** A deliberately weak opponent ("Limping Kid") who loses most of the time, so the first experience is a win.
7. **Result and reward:** The final-shot slow-mo, XP, and the first reward (a hat). Then the main hub unlocks fully.

### Regular Loop (returning player)

1. The main hub (the Saloon) → a big "Quick Duel" button that uses the last weapon and character you played.
2. Matchmaking (target under 20 seconds, after which a ghost opponent is offered automatically).
3. **Walk-out scene (3 seconds, skippable):** Both duelists walk into the street; opponent's name, flag, and rank.
4. **Ready:** "Holster your gun" → the game waits until the phone is steady in the holster position.
5. **Tension (random 2–6 seconds):** Silence, wind, heartbeats, possible false signals, then the coin toss.
6. **Draw and exchange (1–5 seconds):** Draw, aim, fire, reload when needed.
7. **End of round:** The loser falls in slow motion; your draw time and accuracy are shown.
8. **Next round** (best of 3 by default) or the match result screen.
9. **Result screen:** XP, coins, challenge progress, a "Revenge" button (rematch the same opponent), a "New Duel" button, and "Share the Replay."

## 3. Mobile Control Design

The core decision: **up/down tilt comes from gravity (stable, no drift), and left/right rotation comes from the gyroscope (computed relative to the moment of the draw)**. This gives steady, precise aiming over a duel that lasts seconds, and avoids Euler-angle problems.

### How to Hold It

- **Portrait orientation**, one hand, thumb on the screen as the trigger. The screen faces the player like a gun sight.
- **Holster:** The phone hangs at the thigh, top pointing at the ground (more than 60° below horizontal).
- **Aiming:** The phone is raised roughly vertical in front of the eye, and the player sees the opponent "through" the screen.

### Input States (Input State Machine)

| State | Entry condition | What happens | Exit |
| --- | --- | --- | --- |
| Not ready | Start of round | "Holster your gun" message | Phone at holster angle and steady for 400ms |
| Holstered | Holster angle + steady | Tension begins. Touch disabled | Signal, or early exit |
| Early draw (foul) | Leaving holster by more than 25° before the signal | Round lost immediately, with a "shaky hand" animation | End of round |
| Twitch | 10–25° movement before the signal | Light warning vibration, no penalty | Return to holster |
| Draw | Signal, then crossing 30° below horizontal | Draw time recorded. Reticle appears at bottom of screen | Reaching aim angle |
| Aiming | Tilt within ±35° of horizontal | Reticle follows the hand. Tap = fire | Out of ammo, reload gesture, or end of round |
| Reloading | Weapon gesture (below) or out of ammo | Reload steps per weapon | Weapon closed |
| Finished | One side dies or time runs out | Input stops | Next round |

### Draw Detection and Preventing Cheating and False Readings

- **Holster is measured from the gravity vector** (`accelerationIncludingGravity` after a low-pass filter), not directly from `beta`, because gravity doesn't drift over time.
- **Hysteresis:** Enter holster at 60°, exit at 35°. Prevents flickering at the boundary.
- **Twitch zone:** Small movements before the signal don't count as a foul. Beginners aren't punished for a shaky hand.
- **Draw time = from the moment the signal is displayed on screen (not when it's sent) to the first shot.** We also record the phone-raise time for stats.
- **Anything under 100ms after the signal is treated as a guess** and counts as an early draw. The fastest human visual reaction is roughly 150ms, so 100ms is a safe floor. This number will be calibrated from real data.
- **Firing before reaching aim angle is allowed** (a hip shot) but with large spread. It rewards speed with risk.

### Aiming

- **Input:** `rotationRate` from `devicemotion` is integrated to compute left/right rotation. Tilt from gravity is fused with the gyroscope using a complementary filter for smoothness without drift.
- **Why not use alpha/beta/gamma directly:** When the phone is held vertical (beta ≈ 90°), gimbal lock occurs and alpha and gamma jump. That is exactly the aiming pose.
- **Smoothing:** One Euro filter: reduces jitter during slow movement and reduces lag during fast movement. Better than a moving average for aiming games.
- **Default sensitivity:** 1° of rotation = 2.2% of screen width. Play range ±22° horizontal and ±14° vertical. Adjustable from 0.5× to 2×.
- **Movement limits:** At the edge, the reticle stops with soft resistance, and the scene shifts slightly (parallax) so the player feels they've reached the limit instead of losing the reticle.
- **No aim assist in competitive play.** Against the computer only: slight "friction" slowing the reticle over the opponent for beginners, fading out gradually.

### Firing

- **`pointerdown`, not `click`** (saves 50–300ms), with `touch-action: none` on the play area.
- **Anywhere on the screen is a trigger** except a small top strip with the pause button. Prevents palm-touch errors: ignore very large touches (large `width/height` in the touch event) or simultaneous ones.
- **"Trigger pull" mechanic:** Tapping the screen physically shakes the phone, so accuracy requires a calm tap. This is a real skill; we don't try to remove it.
- **Feedback:** Gunshot sound, reticle recoil, and muzzle flash in the same frame (under 16ms from the tap). A hit shows a hit marker and a distinct impact sound.

### Reloading (each weapon has its own feel)

| Weapon | Gesture | Details |
| --- | --- | --- |
| Revolver | Quick wrist roll left (open cylinder) → tap per round → roll right (close) | You can close after two rounds instead of six. A tactical decision under pressure |
| Lever-action rifle | Flick the phone down and back (cycle the lever) after every shot. Full reload by taps | Without the flick, the next shot won't fire. A "shot, flick, shot" rhythm |
| Double-barrel shotgun | Tip the top of the phone down hard (break the action) → two taps → quick raise (close) | Slowest reload but the heaviest feel |

**Design warning:** A wrist roll can make the system rotate the screen to landscape. So gestures are quick "flicks" (under 250ms), and we watch `orientationchange` and redraw without breaking the game. Tested in Phase 0.

### Calibration

1. **Axis direction:** "Hold the phone in front of you" → we measure gravity direction and set axis signs for this browser (they differ between iOS and Android in some versions).
2. **Holster:** "Lower it to your side" → we record this player's natural holster angle and set thresholds around it.
3. **Sensor rate:** We count readings per second during the test. Below 40Hz → show a warning and raise smoothing. No `rotationRate` (phone without gyroscope) → touch controls.
4. **Preferred hand:** Right or left; mirrors the trigger UI and gestures.
5. Calibration is saved per device, and a quick re-test (3 seconds) runs at the start of each session.

### Permission Flow and Fallback Controls

1. **iPhone:** The "Enter the Street" button calls `DeviceMotionEvent.requestPermission()` and `DeviceOrientationEvent.requestPermission()` directly inside the tap handler, before any other `await`, because the request needs a live user gesture.
2. **Android Chrome:** No permission prompt. We just verify events actually arrive within 500ms.
3. **Refused or no data:** Switch to touch controls. If refused on iPhone: explain that permission comes back by reloading the page.
4. **In-app browsers (TikTok, Instagram, Snapchat):** Detect via `userAgent` and show "Open in Safari/Chrome for the best experience" with a copy-link button, because sensors aren't guaranteed there.

**Touch controls (phone fallback):** Thumb on a "holster button" at the bottom of the screen = holstered. Lifting the thumb after the signal = draw. Dragging a finger on the screen = moving the reticle (relative). A second-finger tap or lifting the finger = fire (chosen by testing). Swipe down = reload.

**Desktop:** Hold Space = holster. Release after the signal = draw. Mouse (Pointer Lock) = aim. Left click = fire. Mouse wheel = spin the cylinder and reload (a nice touch for the revolver). R = reload for other weapons.

**Fairness rule:** The mouse is far more precise than a phone. So **ranked play is separated by control method** (motion, touch, mouse). Friend challenges are open to everyone, with a badge showing each player's method.

## 4. Weapons, Hits, Rounds, and Progression

Only three core weapons, each winning at a different distance, and the distance is revealed before weapon choice. This turns the choice into a tactical decision instead of "the strongest gun."

### Weapons (starting balance numbers)

| Property | Revolver | Lever-action rifle | Double-barrel shotgun |
| --- | --- | --- | --- |
| Draw | Fastest: reticle appears instantly | Heavy: 120ms reticle inertia | Medium: 60ms inertia |
| Ammo | 6 | 4 | 2 |
| Min time between shots | 350ms | 300ms + mandatory lever flick | 250ms |
| Random spread | 0.6° | 0.2° | 9 pellets, 5° spread |
| Torso damage | 35 | 60 | 14 per pellet (close), 7 (far) |
| Head damage | Lethal | Lethal | 28 per pellet |
| Recoil | Medium | High | Very high |
| Best distance | Medium | Long | Close |

**Distances:** Three distances on the street: close (≈10 m), medium (≈20 m), long (≈35 m). Distance changes the opponent's size on screen, and therefore how hard the head is to hit.

**Blind pick:** Before the match, the map and distance are revealed, and each player picks a weapon within 5 seconds without seeing the opponent's choice. Both weapons are revealed in the walk-out scene.

### Hits and Damage

- **Health:** 100 per player per round.
- **Hit zones:** Head (lethal for revolver and rifle), torso (full damage), arm (20 damage + composure drop), leg (20 damage), hat (no damage, flies off and is saved as a trophy).
- **Composure:** An arm hit increases your reticle shake by 50% for two seconds. Any hit pushes your reticle 3° away. The first hit gives a real advantage, but the opponent can still answer.
- **Why shots are instant (hitscan):** Bullet travel time adds complexity without fun on a phone screen, and makes online hit judgment harder.
- **Against randomness:** Random spread is smaller than the width of the head at medium distance. A player who aims correctly usually hits; randomness only shows on borderline shots.

### End of Round and Match

- **Win:** First to drop the opponent. After 8 seconds from the signal, if both are alive, the one with more health wins.
- **Early draw:** Round lost immediately. If both draw early: the round is replayed.
- **Tie:** If the two lethal shots are less than 10ms apart (server time), both fall = "double death" and a sudden-death round.
- **Formats:** "Quick" best of 3 (default), "Decisive" single round, and "Final" best of 5 for seasons and tournaments.

### Opponent Behavior (shown against the computer and online)

- **Before the signal:** Breathing, fingers twitching near the holster, narrowing eyes, adjusting the hat. Online these are cosmetic only, with no information about the real player.
- **After the signal (online):** The opponent's arm rises according to their real draw progress, and their muzzle direction tracks their actual aim (smoothed and delayed 100ms). You see them "coming for you," which raises the tension.
- **Hits:** A different reaction per zone: a flinch for the torso, a spin for the arm, the hat flying off, and a dramatic fall on death.
- **Computer characters:**

| Opponent | Reaction time | Accuracy | Trait |
| --- | --- | --- | --- |
| Limping Kid | 650ms | Low | For teaching, usually loses |
| The Crow Sisters | 480ms | Medium | Two in a row, the second faster |
| Old Silas | 520ms | Very high | Slow but never misses the torso |
| The Hothead | 380ms | Low | Shoots a lot and reloads fast |
| The Stranger | 300ms | High | More false signals and feints |
| "The Ghost" | From a real player's recording | Real | Duel against a player's replay |

Each character's reaction time is a distribution (mean + variance), not a fixed number, and all names are provisional.

### Progression and Customization

- **XP level:** Every duel gives XP (more for a win, with a bonus for the first daily win). Levels unlock cosmetics, and unlock the shotgun at level 2 and the rifle at level 3.
- **All weapons are equal for everyone.** No stronger weapon can be bought. Upgrades are cosmetic: engravings, grips, metal colors.
- **Mastery:** Challenges per weapon (e.g., 50 headshots with the revolver) unlock rare weapon skins and titles.
- **Hat collection:** Every hat you shoot off is saved as a trophy with its owner's name. A fun, free collection goal.
- **Customization:** Hat, bandana, coat, boots, holster, weapon engraving, show-off move (revolver spin, hat tip), victory pose, and replay card frame.
- **Currencies:** "Silver" is earned only by playing and buys most cosmetics. "Gold" is bought or earned slowly, and is for cosmetics only. **Nothing purchasable affects performance.**
- **Season (6 weeks):** A complete free track, and an optional paid track with extra cosmetics.
- **Daily contracts:** 3 small tasks (e.g., win with the shotgun, shoot off a hat) + a weekly "Wanted" against a tough computer opponent with a big reward.
- **Special items:** Not recommended in ranked play. If added (blinding mirror, whiskey flask restoring composure), they belong only in the unranked "Wild West" mode.

## 5. Modes and Screens

The order is intentional: each mode is built only after the previous one proves fun. All modes use the same duel with no extra rules, except "Wild West."

### Modes

| Mode | Description | Phase |
| --- | --- | --- |
| Shooting Range | Tin cans, moving targets, reaction test. No losing | Prototype |
| Wanted Trail | A series of "Wanted" posters against computer characters with rising difficulty. Story and tutorial mode | Vertical slice |
| Ghost Duel | Against a recording of a real player at your level. Works even if nobody is online | Online |
| Challenge a Friend | Link or 4-letter code, works directly from WhatsApp | Online |
| Quick Duel | A random real opponent. If search takes over 20 seconds, show a ghost (clearly labeled as a ghost) | Launch |
| Ranked and Seasons | Glicko-2 rating, separate per control method, ranks: Greenhorn → Deputy → Sheriff → Marshal → Legend | Once there are enough players |
| Daily Challenge | Same opponent and distance for all players, ranked by fastest draw | Post-launch |
| Wild West | Duels with special items and crazy rules, unranked | Optional, later |

**A tempting later idea:** A three-way duel (Mexican standoff). Fun, but it requires aiming at two targets and changes the whole game. I recommend postponing it until after launch.

### Screens

1. **Title:** Logo, one "Enter the Street" button, sound settings.
2. **Motion and permission explainer:** One card with an animation.
3. **Test and calibration:** A live reticle following the hand, visual steps rather than long text.
4. **Interactive training:** The three cans.
5. **The Saloon (main hub):** A big "Quick Duel" button, and smaller entries: Challenge a Friend, Wanted Trail, Training, Wardrobe, Season.
6. **Wardrobe:** The character at large size with live cosmetic preview, and default weapon selection.
7. **Matchmaking:** Simple animation + cancel button + timer.
8. **Challenge lobby:** The code, a share button, and a "ready" indicator for both players.
9. **Weapon pick:** Map and distance, three cards, 5-second timer.
10. **Walk-out scene:** Both duelists, names, flags, ranks.
11. **The duel:** Almost no UI. Aim reticle, small bullets in the corner, both players' health as a thin bar at the top, and a small pause button.
12. **End of round:** Slow motion, draw time, and the result.
13. **End of match:** Rewards, progress, Revenge / New Duel / Share Replay.
14. **Profile:** Stats (fastest draw, average, headshot rate), hat collection, titles.
15. **Settings:** Sensitivity, hand, control method, recalibrate, vibration, sound, language (Arabic/English).

**UI rules:** Large buttons (at least 48pt) in the lower half of the screen. Full right-to-left support in Arabic. No text during the duel except "DRAW!" at the signal moment.

## 6. Art and Audio Direction

The decision: **2.5D with painted layers and parallax that follows the phone's movement**, with 2D characters animated by skeletal rigs. The opponent always faces you and the camera is nearly fixed, so full 3D costs download size and battery with no gain the player can feel.

### Why 2.5D

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| Flat 2D | Lightest and fastest | The scene feels dead when the phone moves | Weak for motion aiming |
| 2.5D layers | Real depth when you move the phone, download under 5MB, 60 fps on mid-range devices | Layers need careful design | **Chosen** |
| Full 3D | Lighting and free camera | Heavy models, longer load, heat and battery on iPhone | Not justified for this experience |

### Visual Identity

- **Style:** Hand-drawn with thick ink lines and flat color with strong shadows, inspired by old printed Western movie posters. An identity distinct from any well-known cowboy game.
- **Colors:** Ochre and burnt earth for the ground, a faded turquoise sky, deep blue shadows. A single red used only for blood and signals, so it keeps its meaning.
- **Layers (farthest first):** Sky and mountains → street facades (saloon, bank, sheriff's office) → the opponent → dust and tumbleweeds → the player's hand and gun at the bottom of the screen.
- **Times of day as maps:** Scorching noon (heat haze), sunset (long shadows), night with moon and lanterns. The same street in three moods = more content at lower cost.
- **Effects:** Heat haze with a light distortion filter, dust particles, muzzle flash, weighted screen shake, and slow motion on the decisive shot.
- **Animation:** Spine (paid license) or DragonBones (free) for skeletal animation. We need: stance, breathing, draw, fire, reload, 4 hit reactions, 3 falls, show-off, victory.
- **UI:** Wood and old poster paper, a bold Arabic typeface with a printed feel, and numbers in a classic Western typeface.

### Audio (half the experience)

- **Tension:** Near-total silence. Wind, a creaking sign, heartbeats speeding up over time. **Music stops completely before the signal.**
- **The signal:** The sound of the coin hitting the ground: sharp, clear, and short, audible even at low volume.
- **The gunshot:** Three layers: a sharp crack + body + an echo bouncing between the street's buildings. A different sound per weapon.
- **Reloading:** A sound for every step (opening the cylinder, each round, cycling the lever, breaking the shotgun). Sound is what makes the gesture feel real.
- **Hits:** A muffled body impact, a metallic ring for the hat, the whistle of a stray bullet close to your ear.
- **Music:** Original, guitar, harmonica, and whistling, only in menus and at the moment of victory.
- **Tech:** All sounds preloaded into Web Audio as buffers for instant playback. On iPhone, Web Audio goes silent when the phone is in silent mode. We try `navigator.audioSession.type = "playback"` and show a "Turn on sound" hint if it doesn't work.

### Vibration

- **Android:** `navigator.vibrate` for recoil (30ms) and hits (80ms).
- **iPhone Safari:** Doesn't support `navigator.vibrate`. We compensate with sound and visuals. **Inside Telegram**, vibration works on iPhone through the Mini Apps `HapticFeedback`, another reason for a Telegram version (Section 7).

## 7. Technical Architecture

The choice: **TypeScript + PixiJS for rendering + DOM UI with Preact + a Colyseus server on Node + PostgreSQL**. One codebase in one language across client and server, a light first load, and proper Arabic support.

### Rendering Engine

| Option | Approx. size | Fit for 2.5D | Verdict |
| --- | --- | --- | --- |
| **PixiJS 8** | Small | Excellent: filters, particles, Spine | **Chosen:** rendering only, full control stays with us |
| Phaser | Medium | Good | Strong alternative, but its framework imposes structure we don't need |
| Three.js / Babylon | Medium to large | 3D | More than needed |
| PlayCanvas | Medium | 3D with editor | Excellent for 3D, not what we need |
| Godot (web export) | Large (WASM) | Good | Slower load plus memory and audio issues on Safari |
| Unity WebGL | Very large | Good | Heaviest on iPhone, rejected for an "open the link and play" experience |

**Why the UI is in the DOM, not inside the renderer:** Arabic text (letter joining, right-to-left, fonts) comes out correct and easy in HTML, and is hard and painful inside Canvas. The duel itself is in Pixi, with menus on top.

### Client Structure

- **Fixed-step 60Hz game loop** independent of rendering, so logic isn't affected by frame drops.
- **Isolated input module:** Takes sensors, touch, or mouse and outputs the same things (holster state, aim direction, fire, reload step). The rest of the game doesn't know the input source.
- **Every sensor event carries its time** (`event.timeStamp`), and events are processed in time order, not frame order.
- **Wake Lock** keeps the screen from sleeping during play.
- **PWA:** A manifest + Service Worker caching assets. The second load is nearly instant, and adding to the home screen gives fullscreen on iPhone.

### Server

| Option | Pros | Cons |
| --- | --- | --- |
| **Colyseus (Node)** | Ready rooms and matchmaking, TypeScript shared with client, open source, runs on a regular VPS | Scaling to thousands of rooms needs Redis and multiple processes |
| Raw WebSocket (uWebSockets) | Fastest and lightest | We build matchmaking and reconnection ourselves |
| Nakama | Accounts, leaderboards, matchmaking included | Game logic in Lua/Go/TS inside its system, learning curve |
| Cloudflare Durable Objects | Close to players globally, serverless | Environment limits, harder local development |

**Colyseus is chosen** because a duel is only two players with few events, so load is light, and development speed matters most. **Transport: WebSocket**, because a duel is sparse events, not a continuous stream, so TCP's downsides barely matter.

**Region:** Target players are in the Gulf, so the first server goes in a nearby region (Bahrain, UAE, or Frankfurt). We measure round-trip time from Kuwait and Saudi Arabia before deciding.

### Online Duel Sync (the heart of fairness)

1. **Clock sync:** On join, 8 pings, taking the clock offset from the lowest-latency sample. Repeated between rounds.
2. **Scheduled signal:** The server decides the signal time secretly, and ahead of it by a margin (largest latency between the players + 50ms) sends: "Display the signal at time T." Both devices display it at roughly the same real moment.
3. **Measure reaction, not message arrival:** Each player's draw time = their fire time − T on their synced clock. The player with slower internet isn't wronged at the signal moment.
4. **Client messages:** `DRAW{t}`, `FIRE{t, aim direction, sequence number}`, reload steps, and aim streaming at 20 times per second (for display to the opponent and plausibility checks).
5. **The server judges:** It recomputes the hit from the submitted aim direction and the opponent's body zones. It accepts the claimed time only if it's after T+100ms, not in the future, and not older than (arrival time − half the latency − 150ms). Otherwise it's adjusted to arrival time.
6. **Ordering:** Events are ordered by claimed time. A lethal shot at t cancels the opponent's shots after t, while their shots before it still count (both can hit). The server waits 120ms before announcing a death, so any earlier shot from the other side can arrive.
7. **Fast feel:** The client shows its own shot and hit marker immediately (prediction). The death announcement comes from the server 100–200ms later, and the slow-motion moment naturally covers that delay.

**Disconnection:** 10-second reconnect window. Before the signal: the round pauses and is replayed. After the signal: the round is resolved with the events received. Repeated disconnects = match lost. Round-trip over 250ms: a warning before matchmaking, and matchmaking prefers opponents in the same region.

### Anti-Cheat (realistically)

The browser client is fully exposed, so we can't prevent cheating 100%. The plan relies on the server and statistics:

- **The server is the judge** of hits, damage, ammo, and reload timing.
- **Plausibility checks:** Aim rotation speed within human limits, a draw faster than 100ms = foul, and the aim path must be continuous (not a direct jump to the head).
- **Long-term statistics:** Each player's average draw time and headshot rate compared to the overall distribution. Outliers are silently moved into an isolated matchmaking pool.
- **Ranked requires a linked account** (not a guest) to reduce throwaway accounts.

### Data and Persistence

- **PostgreSQL** (Supabase is fine to start): accounts, profiles, inventory, currencies, matches, ratings.
- **Ghost recordings:** Aim path and event times, compressed (≈2KB per round).
- **On device (IndexedDB):** Calibration, settings, a cached copy of the profile.
- **Accounts:** Guest with a device ID → later linking to Google, Apple, or Telegram. Currencies and inventory live on the server only.
- **Telemetry:** Sensor rate per device, draw times, foul rate, disconnects. Without it we can't balance the game.

### Distribution

1. **Web + PWA:** A direct link, and the foundation for everything.
2. **Telegram Mini App (strongly recommended):** Bot API 8.0 added fullscreen and motion sensors (acceleration, orientation, rotation) to Mini Apps, plus orientation lock and haptics. This solves Safari's three biggest problems at once, and enables friend challenges right inside chats. Same code with a Telegram input layer.
3. **Store app (later):** Capacitor wraps the same code and provides native sensors, haptics, and orientation lock. Only if the numbers justify it.

## 8. Technical Risks to Test First

The two biggest risks: **sensors on iPhone across different browsers**, and **the sense of fairness online**. Both are tested on real devices before any final art.

| # | Risk | What we know | How we test | Fallback |
| --- | --- | --- | --- | --- |
| 1 | Motion permission on iPhone | Requires HTTPS and a user tap, otherwise the request is rejected ([dev.to](https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2)) | Test page: accept, refuse, reload, PWA from home screen | Touch controls + explanation of how to re-enable |
| 2 | In-app browsers (TikTok, Instagram, regular Telegram) | Sensors may be unavailable or return "denied" | Open the link from each app on iPhone and Android | "Open in browser" message + Telegram Mini App version |
| 3 | Game inside an iframe | On Safari the request returns denied inside a cross-origin iframe ([WebKit](https://bugs.webkit.org/show_bug.cgi?id=221399)) | Try embedded game platforms | Don't host the game inside an iframe; use a direct link |
| 4 | Gimbal lock when held vertical | Euler angles jump at beta ≈ 90° | Log readings while aiming | Gyroscope + gravity instead of alpha/beta/gamma |
| 5 | Different axis directions and signs | Varies across platforms and some versions | Calibration on 8 devices | Detect signs during calibration |
| 6 | Sensor rate and latency | Usually around 60Hz but varies | Measure Hz and motion-to-reticle latency (slow-motion camera) | Stronger smoothing, warning for weak devices |
| 7 | iPhone Low Power Mode | Drops rendering to 30 fps | Enable it during testing | Frame-independent logic + a warning |
| 8 | Screen rotation during reload gestures | Safari doesn't allow orientation lock | Quick wrist rolls with rotation lock on and off | Shorter gestures, and a design that survives orientation changes |
| 9 | Audio on iPhone | Web Audio goes silent in silent mode ([adactio](https://adactio.com/tags/webaudio)) | Test silent mode and `audioSession` | Clear hint + visual effects are enough |
| 10 | Phones without a gyroscope | Some cheap Android devices | `rotationRate` is empty | Automatic touch controls |
| 11 | Online latency | Any gap feels unfair in a reaction game | Matches between Kuwait and Saudi Arabia + simulated 50–250ms latency and packet loss | Scheduled signal + server judgment |
| 12 | Cheating | The client is exposed | A simple bot firing 120ms after the signal | Plausibility checks and statistics (Section 7) |

**Minimum device matrix:** A recent iPhone + an iPhone about 4 years old, a mid-range Samsung, a cheap Android phone, and an iPad. On each: Safari or Chrome, PWA mode, TikTok's in-app browser, and the Telegram Mini App.

## 9. Build Plan

Six phases over roughly 16 weeks for one part-time developer with AI assistance. **We don't move to a phase until the previous phase's gate passes** (Section 10). Numbers are estimates.

### Phase 0 — Sensor Lab (Week 1)

- One web page on HTTPS: permission button, raw readings display, Hz counter, a reticle following the hand via gyroscope + gravity, holster and draw detection, and log export.
- Opened on every device in the matrix and every in-app browser.
- **Output:** A table of "device × browser × works? × Hz × notes."

### Phase 1 — Grey-Box Duel Prototype (Weeks 2–3)

- Boxes and shapes, no art. A static opponent. The full loop: holster → tension → coin → draw → aim → fire → revolver reload → result.
- Temporary but sharp sounds (sound is part of the fun test).
- A hidden tuning panel to change sensitivity, thresholds, and smoothing during testing.
- **The only question:** Are drawing and aiming fun without any polish?

### Phase 2 — Vertical Slice (Weeks 4–7)

- One street in the final style, two animated characters, all three weapons, 5 computer opponents, interactive training, and full calibration.
- Touch and mouse fallback controls.
- Best of 3, slow motion, result screen.
- **This is the version we show people and measure engagement with.**

### Phase 3 — Core Online (Weeks 8–10)

- Colyseus server, clock sync, scheduled signal, server judgment.
- Challenge a friend via link and code, and reconnection.
- Ghost recording and ghost duels.
- Real cross-city testing + latency simulation.

### Phase 4 — Launchable Game (Weeks 11–14)

- Guest and linked accounts, progression, silver, wardrobe, 20+ cosmetics, hat collection.
- Quick duel and matchmaking, and the full Wanted Trail.
- PWA, telemetry, shareable final-shot replay.
- Telegram Mini App version.

### Phase 5 — Launch and Seasons (Week 15 onward)

- Closed beta → public launch. Ranked and seasons only once there are enough active players for matchmaking (e.g., 200 daily).
- Daily challenge, season track, and statistical anti-cheat.
- Store app decision based on the numbers.

## 10. Success Criteria and Open Decisions

Every gate has a measurable number, not a feeling. If a gate fails: adjust and retest within the same phase, and don't add features on a weak foundation.

### Phase Gates

| Phase | Success criterion |
| --- | --- |
| 0 Sensor Lab | Sensors work in Safari (iPhone) and Chrome (Android) on every device in the matrix. Rate ≥ 50Hz. Motion-to-reticle latency ≤ 50ms. We know exactly which in-app browsers fail |
| 1 Grey-Box Prototype | 8 out of 10 testers ask for "one more" without prompting. Unintentional early draws under 5%. Most players' draw time between 350–700ms. Nobody reports dizziness or hand pain after 10 duels |
| 2 Vertical Slice | A new player reaches the first shot within 60 seconds. 70% complete training. Average session ≥ 8 duels. 60 fps on a mid-range phone, first load ≤ 5MB |
| 3 Online | With latency up to 150ms: 80% of testers rate the result "fair." Mismatch between what the player saw and the server's verdict under 2% of rounds. Reconnection succeeds after a 5-second drop |
| 4 Launchable | Day-2 retention ≥ 30% in the beta. Matchmaking ≤ 20 seconds (with ghosts). Zero play-blocking crashes for a week |
| 5 Launch | Day-7 retention ≥ 12%. 10% of matches include a replay share or challenge link. Suspicious account rate under monitoring |

### Open Decisions to Settle by Playtesting

- [ ] **The signal:** The falling coin, or a simpler signal (the word "DRAW!" + a sound). The coin is prettier but may be less clear.
- [ ] **False signals:** How often? Fun for experts, possibly frustrating for beginners. Maybe enabled only from a certain rank.
- [ ] **Firing in touch controls:** A second-finger tap or lifting the finger.
- [ ] **Reloading:** Full motion gestures or easier taps. Motion is more fun but may trigger screen rotation or hand fatigue.
- [ ] **Leaning to dodge:** Tilting the phone left/right moves your character and makes your head harder to hit, in exchange for lower accuracy. Extra depth, but it conflicts with the revolver reload gesture.
- [ ] **Tie window:** 10ms or wider. Wider = more "double deaths" and more excitement, but the faster player may feel wronged.
- [ ] **Weapon numbers:** All numbers in Section 4 are provisional and tuned from match data.
- [ ] **Match length:** Best of 3 or a single round as the default.
- [ ] **Default sensitivity** and movement range (±22°): measured from calibration data.
- [ ] **Server region:** After measuring actual latency from Kuwait, Saudi Arabia, and the UAE.
- [ ] **Name and identity:** The name is settled as "Al-Bawardi." Still open: how much to blend Gulf character with Wild West atmosphere, such as Gulf-style cosmetics and characters in customization.

### Sources

- [Requesting motion permission in iOS 13+ (dev.to)](https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2)
- [Permission issue inside iframes on Safari (WebKit Bugzilla 221399)](https://bugs.webkit.org/show_bug.cgi?id=221399)
- [Web Audio behavior with silent mode on iOS (adactio)](https://adactio.com/tags/webaudio)
- [AudioSession.type property (MDN)](https://developer.mozilla.org/docs/Web/API/AudioSession/type)
- [Telegram Bot API 8.0 announcement: fullscreen and sensors](https://telegram.space/s/NewsAndTipsNT?after=2929)
