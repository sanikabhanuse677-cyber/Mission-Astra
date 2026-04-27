# Mission Astra: Lunar Descent

An interactive, scroll-based lunar mission simulation game built with **vanilla HTML, CSS, and JavaScript** — no build tools, no frameworks, no dependencies.

## How to Run in VS Code

### Option 1 — Just open it
1. Open the `mission-astra` folder in VS Code.
2. Right-click `index.html` → **Open with Live Server** (recommended).

### Option 2 — No extension
- Double-click `index.html` to open it in your browser.
- (Audio may require one click on the page to start due to browser autoplay rules.)

### Option 3 — Live Server extension
1. Install the **Live Server** extension by Ritwick Dey from the VS Code marketplace.
2. Open `mission-astra/index.html`, then click **"Go Live"** in the bottom-right of VS Code.

## Files

```
mission-astra/
├── index.html   ← page structure
├── styles.css   ← all styling
└── script.js    ← game logic + sound (Web Audio API)
```

## Controls

- **↑** Thrust
- **← / →** Rotate
- **SPACE** Action / Tap (used in timing/aim stages)
- On-screen buttons appear automatically on touch devices.

## Stages — Step by Step

### Stage 1 · Launch Phase
**Goal:** Keep the rocket vertical until it clears the atmosphere.
1. Hold **↑** to fire the main engine — the rocket starts climbing.
2. Watch the **tilt indicator** at the top of the canvas. Wind pushes you sideways.
3. Tap **←** / **→** in short bursts to counter the tilt — don't over-correct.
4. Stay within ±25° of vertical. Exceed it and the rocket breaks up.
5. Reach the target altitude bar — stage clears automatically.
*Pro tip: pulse the rotation keys instead of holding them.*

### Stage 2 · Orbit Raising
**Goal:** Land 4 well-timed burns to widen your orbit.
1. A marker sweeps across a horizontal bar with a **green window** in the middle.
2. Press **SPACE** (or tap) the moment the marker is inside the green zone.
3. A hit raises your orbit; a miss resets the marker.
4. Land **4 successful burns** to clear the stage.
*Pro tip: anticipate the marker — tap slightly before it enters the zone.*

### Stage 3 · Trans-Lunar Injection
**Goal:** Aim a trajectory line into the Moon, then commit.
1. A dotted trajectory line extends from your spacecraft toward the Moon.
2. Use **←** / **→** to rotate the angle until the line passes through the Moon.
3. Hold **↑** to charge thrust power — aim for the green band.
4. Press **SPACE** to commit the burn when both aim and power look right.
*Too low: fall back. Too high: overshoot. Just right: lunar arrival.*

### Stage 4 · Lunar Orbit Insertion
**Goal:** Brake at the right moment to be captured by lunar gravity.
1. You approach the Moon at high speed — too fast for natural capture.
2. A **green capture window** opens as you near the Moon.
3. Hold **↑** to fire retro-thrusters the instant you enter the window.
4. Keep braking until your speed drops into the safe capture range.
*Pro tip: listen for the audio cue when the window opens.*

### Stage 5 · Final Descent
**Goal:** Land softly on the pad — vertical speed under **2.0 m/s**.
1. You start with **limited fuel** — running out mid-descent means crashing.
2. Use **←** / **→** to rotate, **↑** to thrust against gravity.
3. Steer toward the highlighted **landing pad**. Landing elsewhere fails.
4. Stay nearly vertical at touchdown — a tilted lander tips over.
5. Slow down so vertical speed is **< 2.0 m/s** when you hit the surface.
*Pro tip: fall fast at first to save fuel, then full-throttle late ("suicide burn") to slow just before landing.*

Each stage unlocks a fact-based story panel after completion.

## Difficulty

Pick **Easy / Normal / Hard** in the briefing. It changes wind, fuel, gravity,
soft-landing speed limit, capture-window width, and pad size across all stages.

## Mission Clock + Score + Rank

- A live mission clock (top-left) tracks total mission time, including retries.
- After landing you'll get a **Mission Score** based on time and retry count,
  scaled by difficulty (Easy ×1.0, Normal ×1.5, Hard ×2.2), and a final rank:
  - **Cadet** → **Flight Officer** → **Lead Pilot** → **Mission Commander** → **Astra Elite**

## Notes

- Pure vanilla JavaScript — runs in any modern browser.
- All sound effects are synthesized live with the Web Audio API; no audio files needed.
- Educational simulation; no official logos or organization names are used.
