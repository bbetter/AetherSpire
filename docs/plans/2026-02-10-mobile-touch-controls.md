# Mobile Touch Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the game fully playable on mobile devices with virtual joystick, action buttons, pinch-to-zoom, orientation guidance, and touch-friendly UI.

**Architecture:** All mobile touch logic lives in a new `client/src/game/touch.ts` module. It exports a `setupTouchControls()` function that creates HTML overlay elements (joystick, buttons, orientation banner) and returns a controller object. The game loop in `main.ts` reads joystick direction from the controller each frame and uses it alongside existing WASD input. Action buttons fire callbacks that invoke the same functions keyboard input does.

**Tech Stack:** Vanilla DOM + CSS for touch overlays (not Pixi — overlays must sit on top of canvas and handle touch events directly). Touch API (`touchstart`, `touchmove`, `touchend`). No external libraries.

---

### Task 1: Viewport & CSS — Prevent Page Zoom/Bounce on Mobile

**Files:**
- Modify: `client/index.html`

**Step 1: Update viewport meta and add touch CSS**

In `client/index.html`, replace the existing `<meta name="viewport">` line and add CSS rules to prevent mobile browser zoom, overscroll, and text selection on the game.

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```

Add to the existing `<style>` block:

```css
html, body {
  margin: 0; padding: 0; width: 100%; height: 100%; background: #111; color: #e6e6e6;
  overflow: hidden;
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  overscroll-behavior: none;
}
```

The `#app` and `canvas` rules stay the same.

**Step 2: Verify on desktop**

Run: `cd /home/andrii/MyProjects/AetherSpire && npm run build`
Expected: Build succeeds. Desktop browser still works — viewport meta only affects mobile.

**Step 3: Commit**

```
feat: add mobile viewport meta and touch CSS
```

---

### Task 2: Create `touch.ts` — Mobile Detection, Joystick & Action Buttons

**Files:**
- Create: `client/src/game/touch.ts`

**Step 1: Create the touch module**

Create `client/src/game/touch.ts` with the following structure. This is the bulk of the mobile work.

```typescript
// client/src/game/touch.ts

export interface TouchController {
  /** Current joystick direction, normalized. (0,0) when idle. */
  getDirection(): { vx: number; vy: number };
  /** Call each frame to update button visibility based on game state. */
  updateState(state: {
    hasNearInteractable: boolean;
    interactLabel: string;
    isFixing: boolean;
    isContextMenuOpen: boolean;
    contextMenuOptions: { label: string; disabled: boolean }[];
    gameOver: boolean;
    gameStarted: boolean;
  }): void;
  /** True if device has touch support. */
  isMobile: boolean;
  /** Provide pinch-zoom callback. */
  onPinchZoom: ((delta: number) => void) | null;
  /** Clean up event listeners. */
  destroy(): void;
}

export function setupTouchControls(callbacks: {
  onInteract: () => void;
  onCancel: () => void;
  onPing: () => void;
  onContextMenuSelect: (index: number) => void;
}): TouchController {
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // ── State ──
  let joyVx = 0;
  let joyVy = 0;
  let joystickTouchId: number | null = null;
  let pinchStartDist: number | null = null;
  let onPinchZoom: ((delta: number) => void) | null = null;

  // Don't create DOM elements if not mobile
  if (!isMobile) {
    return {
      getDirection: () => ({ vx: 0, vy: 0 }),
      updateState: () => {},
      isMobile: false,
      onPinchZoom: null,
      destroy: () => {},
    };
  }

  // ── Orientation Banner ──
  const orientBanner = document.createElement("div");
  orientBanner.id = "orient-banner";
  orientBanner.innerHTML = "Rotate your device to <b>landscape</b> for the best experience";
  Object.assign(orientBanner.style, {
    position: "fixed",
    top: "0",
    left: "0",
    right: "0",
    padding: "10px",
    background: "rgba(184, 134, 11, 0.9)",
    color: "#fff",
    textAlign: "center",
    fontSize: "14px",
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    zIndex: "100",
    display: "none",
    transition: "opacity 0.3s",
  } as CSSStyleDeclaration);
  document.body.appendChild(orientBanner);

  function checkOrientation() {
    const isPortrait = window.innerHeight > window.innerWidth;
    orientBanner.style.display = isPortrait ? "block" : "none";
  }
  window.addEventListener("resize", checkOrientation);
  checkOrientation();

  // ── Touch Overlay Container ──
  const overlay = document.createElement("div");
  overlay.id = "touch-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "40",
    pointerEvents: "none",
    touchAction: "none",
  } as CSSStyleDeclaration);
  document.body.appendChild(overlay);

  // ── Joystick ──
  const joyBase = document.createElement("div");
  const JOY_SIZE = 120;
  const KNOB_SIZE = 50;
  Object.assign(joyBase.style, {
    position: "absolute",
    width: `${JOY_SIZE}px`,
    height: `${JOY_SIZE}px`,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.1)",
    border: "2px solid rgba(184,134,11,0.4)",
    display: "none",
    pointerEvents: "none",
  } as CSSStyleDeclaration);
  overlay.appendChild(joyBase);

  const joyKnob = document.createElement("div");
  Object.assign(joyKnob.style, {
    position: "absolute",
    width: `${KNOB_SIZE}px`,
    height: `${KNOB_SIZE}px`,
    borderRadius: "50%",
    background: "rgba(184,134,11,0.5)",
    border: "2px solid rgba(218,165,32,0.6)",
    left: `${(JOY_SIZE - KNOB_SIZE) / 2}px`,
    top: `${(JOY_SIZE - KNOB_SIZE) / 2}px`,
    pointerEvents: "none",
  } as CSSStyleDeclaration);
  joyBase.appendChild(joyKnob);

  let joyOriginX = 0;
  let joyOriginY = 0;
  const JOY_MAX_RADIUS = JOY_SIZE / 2 - KNOB_SIZE / 4;

  // ── Action Buttons ──
  function createButton(label: string, bottom: string, right: string, size: string): HTMLDivElement {
    const btn = document.createElement("div");
    Object.assign(btn.style, {
      position: "absolute",
      bottom,
      right,
      width: size,
      height: size,
      borderRadius: "50%",
      background: "rgba(255,255,255,0.08)",
      border: "2px solid rgba(184,134,11,0.4)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "rgba(218,165,32,0.8)",
      fontSize: "16px",
      fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontWeight: "bold",
      pointerEvents: "auto",
      touchAction: "none",
      userSelect: "none",
      WebkitUserSelect: "none",
      transition: "background 0.15s",
    } as CSSStyleDeclaration);
    btn.textContent = label;
    overlay.appendChild(btn);
    return btn;
  }

  // Main interact button (big, bottom-right)
  const interactBtn = createButton("E", "80px", "24px", "64px");
  interactBtn.style.display = "none";

  // Cancel button (above interact)
  const cancelBtn = createButton("X", "160px", "32px", "48px");
  cancelBtn.style.display = "none";
  cancelBtn.style.background = "rgba(204,68,51,0.15)";
  cancelBtn.style.borderColor = "rgba(204,68,51,0.5)";
  cancelBtn.style.color = "rgba(255,100,80,0.8)";

  // Ping button (smaller, above cancel)
  const pingBtn = createButton("Q", "220px", "36px", "40px");
  pingBtn.style.fontSize = "13px";

  // ── Context Menu Touch Buttons ──
  const ctxContainer = document.createElement("div");
  Object.assign(ctxContainer.style, {
    position: "absolute",
    bottom: "80px",
    left: "50%",
    transform: "translateX(-50%)",
    display: "none",
    flexDirection: "column",
    gap: "8px",
    pointerEvents: "auto",
    zIndex: "50",
  } as CSSStyleDeclaration);
  overlay.appendChild(ctxContainer);

  const ctxButtons: HTMLDivElement[] = [];
  for (let i = 0; i < 3; i++) {
    const btn = document.createElement("div");
    Object.assign(btn.style, {
      padding: "12px 24px",
      borderRadius: "6px",
      background: "rgba(18,14,8,0.92)",
      border: "2px solid rgba(184,134,11,0.5)",
      color: "rgba(218,165,32,0.9)",
      fontSize: "15px",
      fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      textAlign: "center",
      minWidth: "200px",
      touchAction: "none",
      userSelect: "none",
      WebkitUserSelect: "none",
    } as CSSStyleDeclaration);
    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onContextMenuSelect(i);
    }, { passive: false });
    ctxContainer.appendChild(btn);
    ctxButtons.push(btn);
  }

  // ── Touch Handlers ──

  // Left-side touch = joystick
  function onTouchStart(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const screenW = window.innerWidth;

      // Left 40% = joystick zone
      if (t.clientX < screenW * 0.4 && joystickTouchId === null) {
        e.preventDefault();
        joystickTouchId = t.identifier;
        joyOriginX = t.clientX;
        joyOriginY = t.clientY;
        joyBase.style.display = "block";
        joyBase.style.left = `${t.clientX - JOY_SIZE / 2}px`;
        joyBase.style.top = `${t.clientY - JOY_SIZE / 2}px`;
        joyKnob.style.left = `${(JOY_SIZE - KNOB_SIZE) / 2}px`;
        joyKnob.style.top = `${(JOY_SIZE - KNOB_SIZE) / 2}px`;
        joyVx = 0;
        joyVy = 0;
      }
    }

    // Pinch-to-zoom: detect two-finger touch
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.hypot(dx, dy);
    }
  }

  function onTouchMove(e: TouchEvent) {
    // Joystick
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joystickTouchId) {
        e.preventDefault();
        const dx = t.clientX - joyOriginX;
        const dy = t.clientY - joyOriginY;
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(dist, JOY_MAX_RADIUS);
        const angle = Math.atan2(dy, dx);
        const knobX = Math.cos(angle) * clamped;
        const knobY = Math.sin(angle) * clamped;

        joyKnob.style.left = `${(JOY_SIZE - KNOB_SIZE) / 2 + knobX}px`;
        joyKnob.style.top = `${(JOY_SIZE - KNOB_SIZE) / 2 + knobY}px`;

        // Normalize direction (dead zone of 10px)
        if (dist > 10) {
          joyVx = knobX / JOY_MAX_RADIUS;
          joyVy = knobY / JOY_MAX_RADIUS;
        } else {
          joyVx = 0;
          joyVy = 0;
        }
      }
    }

    // Pinch-to-zoom
    if (e.touches.length === 2 && pinchStartDist !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const delta = (newDist - pinchStartDist) * 0.005;
      pinchStartDist = newDist;
      if (onPinchZoom) onPinchZoom(delta);
      e.preventDefault();
    }
  }

  function onTouchEnd(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joystickTouchId) {
        joystickTouchId = null;
        joyBase.style.display = "none";
        joyVx = 0;
        joyVy = 0;
      }
    }
    if (e.touches.length < 2) {
      pinchStartDist = null;
    }
  }

  document.addEventListener("touchstart", onTouchStart, { passive: false });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("touchend", onTouchEnd, { passive: false });
  document.addEventListener("touchcancel", onTouchEnd, { passive: false });

  // Button event handlers
  interactBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onInteract();
    interactBtn.style.background = "rgba(184,134,11,0.25)";
    setTimeout(() => { interactBtn.style.background = "rgba(255,255,255,0.08)"; }, 150);
  }, { passive: false });

  cancelBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onCancel();
    cancelBtn.style.background = "rgba(204,68,51,0.35)";
    setTimeout(() => { cancelBtn.style.background = "rgba(204,68,51,0.15)"; }, 150);
  }, { passive: false });

  pingBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onPing();
    pingBtn.style.background = "rgba(184,134,11,0.25)";
    setTimeout(() => { pingBtn.style.background = "rgba(255,255,255,0.08)"; }, 150);
  }, { passive: false });

  // ── updateState — show/hide buttons based on game state ──
  function updateState(state: {
    hasNearInteractable: boolean;
    interactLabel: string;
    isFixing: boolean;
    isContextMenuOpen: boolean;
    contextMenuOptions: { label: string; disabled: boolean }[];
    gameOver: boolean;
    gameStarted: boolean;
  }) {
    if (!state.gameStarted || state.gameOver) {
      interactBtn.style.display = "none";
      cancelBtn.style.display = "none";
      pingBtn.style.display = "none";
      ctxContainer.style.display = "none";
      return;
    }

    // Context menu mode — show touch options instead of pixi context menu
    if (state.isContextMenuOpen) {
      interactBtn.style.display = "none";
      cancelBtn.style.display = "none";
      pingBtn.style.display = "none";
      ctxContainer.style.display = "flex";
      state.contextMenuOptions.forEach((opt, i) => {
        if (ctxButtons[i]) {
          ctxButtons[i].textContent = opt.label;
          ctxButtons[i].style.opacity = opt.disabled ? "0.35" : "1";
          ctxButtons[i].style.pointerEvents = opt.disabled ? "none" : "auto";
        }
      });
      return;
    }

    ctxContainer.style.display = "none";

    // Fixing mode — show cancel only
    if (state.isFixing) {
      interactBtn.style.display = "none";
      cancelBtn.style.display = "flex";
      pingBtn.style.display = "none";
      return;
    }

    // Normal mode
    cancelBtn.style.display = "none";
    pingBtn.style.display = "flex";

    if (state.hasNearInteractable) {
      interactBtn.style.display = "flex";
      // Show short label inside the button
      const short = state.interactLabel.replace(/^\[E\]\s*/, "");
      interactBtn.textContent = short.length > 8 ? short.slice(0, 8) + "…" : short;
    } else {
      interactBtn.style.display = "none";
    }
  }

  const controller: TouchController = {
    getDirection: () => ({ vx: joyVx, vy: joyVy }),
    updateState,
    isMobile: true,
    get onPinchZoom() { return onPinchZoom; },
    set onPinchZoom(cb) { onPinchZoom = cb; },
    destroy: () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("resize", checkOrientation);
      overlay.remove();
      orientBanner.remove();
    },
  };

  return controller;
}
```

**Step 2: Verify build**

Run: `cd /home/andrii/MyProjects/AetherSpire && npm run build`
Expected: Build succeeds (file exists but isn't imported yet, tree-shaking ignores it).

**Step 3: Commit**

```
feat: add touch.ts module with joystick, buttons, pinch-zoom, orientation banner
```

---

### Task 3: Integrate Touch Controls into `main.ts`

**Files:**
- Modify: `client/src/main.ts`

This task wires the touch controller into the game loop and input handlers.

**Step 1: Add import and setup**

At the top of `main.ts`, after the existing imports (line ~8), add:

```typescript
import { setupTouchControls } from "./game/touch";
```

After `const camera = { ... }` (around line 31), add the touch controller setup:

```typescript
// ── Touch Controls ──
const touch = setupTouchControls({
  onInteract: () => {
    if (!gameStarted || gameOver) return;
    // Reuse same logic as KeyE press
    simulateInteract();
  },
  onCancel: () => {
    if (fixing) cancelFix();
    else if (contextMenu.visible) closeContextMenu();
  },
  onPing: () => {
    if (!gameStarted || fixing || contextMenu.visible) return;
    const now = performance.now();
    if (now - lastPingSentAt < PING_COOLDOWN_MS) return;
    lastPingSentAt = now;
    connection.sendPingLocation("local-match", playerId, player.x, player.y, currentLayer);
  },
  onContextMenuSelect: (index: number) => {
    if (!contextMenu.visible) return;
    contextMenu.selectedIndex = index;
    confirmContextMenu();
  },
});

// Wire pinch-zoom
touch.onPinchZoom = (delta: number) => {
  camera.zoom = Math.max(0.8, Math.min(2.5, camera.zoom + delta));
};
```

**Step 2: Extract `simulateInteract()` function**

Extract the E key interaction logic into a named function so both keyboard and touch can call it. Find the `if (event.code === "KeyE" && !fixing)` block (around line 792) and extract the body into a function defined before the keydown listener:

```typescript
function simulateInteract() {
  if (!gameStarted || fixing) return;

  // If context menu is open, confirm selection
  if (contextMenu.visible) {
    confirmContextMenu();
    return;
  }

  // Priority 1: Nearby issue
  const nearIssue = findNearestIssue();
  if (nearIssue) {
    if (nearIssue.status === "in_progress") {
      connection.sendStartFix("local-match", playerId, nearIssue.id, "default");
      const now = Date.now();
      const elapsed = now - (nearIssue.fixStartedAt || now);
      const remaining = Math.max(0, (nearIssue.fixDurationMs || 0) - elapsed);
      const boostedRemaining = remaining * 0.6;
      fixing = {
        active: true,
        issueId: nearIssue.id,
        startedAt: performance.now(),
        durationMs: boostedRemaining,
        label: "Helping fix...",
      };
      playFixStart();
    } else {
      openContextMenu(nearIssue);
    }
    return;
  }

  // Priority 2: Open/close door
  if (world) {
    const doors = world.getDoors();
    const nearDoor = findNearestDoor(doors, player.x, player.y);
    if (nearDoor && nearDoor.dist <= 60) {
      connection.sendDoor("local-match", nearDoor.id, !nearDoor.open);
      return;
    }

    // Priority 3: Use hatch
    const nearHatch = findNearestHatch();
    if (nearHatch && nearHatch.dist <= 60 && performance.now() >= hatchCooldownUntil) {
      connection.sendUseHatch("local-match", playerId, nearHatch.id);
      return;
    }
  }
}
```

Then change the `KeyE` handler in keydown to just call `simulateInteract()`:

```typescript
if (event.code === "KeyE" && !fixing) {
  simulateInteract();
  return;
}
```

**Step 3: Add joystick direction to the movement block**

In the game loop movement section (around line 578-613), merge joystick input with keyboard:

Replace the existing vx/vy keyboard block:

```typescript
  } else if (!contextMenu.visible && !gameOver) {
    // Movement (only when not fixing, not in context menu, not game over)
    let vx = 0;
    let vy = 0;
    if (keys.has("KeyW")) vy -= 1;
    if (keys.has("KeyS")) vy += 1;
    if (keys.has("KeyA")) vx -= 1;
    if (keys.has("KeyD")) vx += 1;
```

With:

```typescript
  } else if (!contextMenu.visible && !gameOver) {
    // Movement: merge keyboard + joystick
    let vx = 0;
    let vy = 0;
    if (keys.has("KeyW")) vy -= 1;
    if (keys.has("KeyS")) vy += 1;
    if (keys.has("KeyA")) vx -= 1;
    if (keys.has("KeyD")) vx += 1;
    // Joystick input (overrides keyboard if active)
    const joy = touch.getDirection();
    if (joy.vx !== 0 || joy.vy !== 0) {
      vx = joy.vx;
      vy = joy.vy;
    }
```

**Step 4: Update touch button state each frame**

At the end of the game loop (after the interaction hints section, around line 711), add:

```typescript
  // Update touch controls
  if (touch.isMobile) {
    const nearIssue = !fixing && !contextMenu.visible && !gameOver ? findNearestIssue() : null;
    const nearDoor = !fixing && !contextMenu.visible && !gameOver && world
      ? findNearestDoor(world.getDoors(), player.x, player.y)
      : null;
    const nearHatch = !fixing && !contextMenu.visible && !gameOver && world
      ? findNearestHatch()
      : null;
    const hasInteractable = !!(nearIssue || (nearDoor && nearDoor.dist <= 60) || (nearHatch && nearHatch.dist <= 60));

    let interactLabel = "";
    if (nearIssue) {
      const isJoining = nearIssue.status === "in_progress";
      interactLabel = isJoining ? "Help" : "Fix";
    } else if (nearDoor && nearDoor.dist <= 60) {
      interactLabel = nearDoor.open ? "Close" : "Open";
    } else if (nearHatch && nearHatch.dist <= 60) {
      interactLabel = currentLayer === "deck" ? "Cargo" : "Deck";
    }

    const ctxOptions = contextMenu.issue && latestState ? [
      { label: `Manual (${contextMenu.issue.baseFixTime}s)`, disabled: false },
      {
        label: `Tool (${contextMenu.issue.fixTimeWithTool}s)`,
        disabled: !latestState.teamInventory.includes(contextMenu.issue.requiredTool),
      },
      { label: "Cancel", disabled: false },
    ] : [];

    touch.updateState({
      hasNearInteractable: hasInteractable,
      interactLabel,
      isFixing: !!fixing,
      isContextMenuOpen: contextMenu.visible,
      contextMenuOptions: ctxOptions,
      gameOver,
      gameStarted,
    });
  }
```

**Step 5: Update interaction hint text for mobile**

In the interaction hints section (around line 688-711), update the hint text to not show `[E]` on mobile:

Replace each `world.setInteractionText(...)` call to use a conditional prefix:

```typescript
    const prefix = touch.isMobile ? "" : "[E] ";
```

And use `prefix` in the hint text. For the fixing state:
```typescript
  } else if (fixing) {
    world.setInteractionText(touch.isMobile ? "" : "[ESC] Cancel fix | [WASD] Cancel & move");
  } else if (contextMenu.visible) {
    world.setInteractionText(touch.isMobile ? "" : "[W/S] Navigate | [E] Confirm | [ESC] Cancel");
  }
```

On mobile, the touch overlay buttons serve as the hint, so the text hints can be hidden.

**Step 6: Cancel fix on joystick movement (same as WASD cancels fix)**

In the movement section where joystick input is merged, add fix-cancel logic. Right after `if (joy.vx !== 0 || joy.vy !== 0)`, the existing movement code already runs — the fix was already cancelled by the `else if (!contextMenu.visible && !gameOver)` guard (the movement block only runs when `fixing` is falsy). But we need to handle the case where the player starts moving the joystick while fixing. Add before the movement block:

Actually, looking at the existing code flow: if `fixing` is truthy, the movement block doesn't run at all (line 578: `else if`). The WASD-while-fixing cancel is handled in keydown (line 740-746). For joystick, we need equivalent logic. Add in the game loop, right after the `if (fixing)` block (after the fix progress check, around line 577):

```typescript
    // Cancel fix if joystick is moved (same as WASD cancel)
    if (fixing) {
      const joy = touch.getDirection();
      if (joy.vx !== 0 || joy.vy !== 0) {
        cancelFix();
      }
    }
```

Place this inside the `if (fixing) { ... }` block, after the progress check but before the `else if`.

**Step 7: Verify build**

Run: `cd /home/andrii/MyProjects/AetherSpire && npm run build`
Expected: Build succeeds.

**Step 8: Commit**

```
feat: integrate touch controls into game loop and input
```

---

### Task 4: Touch-Friendly Start Screen

**Files:**
- Modify: `client/src/main.ts` (the `createStartScreen` function, around line 895)

**Step 1: Make start screen responsive and touch-friendly**

Add responsive styling to the start screen panel so it works on small screens. In the `createStartScreen` function, after the panel styling (line ~908):

```typescript
  // Responsive: on small screens, panel fills width
  panel.style.maxWidth = "380px";
  panel.style.width = "90vw";
  panel.style.boxSizing = "border-box";
  panel.style.maxHeight = "90vh";
  panel.style.overflowY = "auto";
```

Change `panel.style.width = "380px"` to `panel.style.width = "90vw"` and add `panel.style.maxWidth = "380px"`.

Also increase touch target sizes for inputs and buttons:

```typescript
  nameInput.style.padding = "12px";
  nameInput.style.fontSize = "16px"; // prevents iOS zoom on focus
```

Set `fontSize: "16px"` on all inputs (nameInput, roomCodeInput) — iOS zooms in on inputs with font-size < 16px.

**Step 2: Verify build**

Run: `cd /home/andrii/MyProjects/AetherSpire && npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```
feat: make start screen responsive and touch-friendly
```

---

### Task 5: Manual Testing Checklist & Final Polish

**Files:**
- Possibly tweak: `client/src/game/touch.ts`, `client/src/main.ts`

**Step 1: Build and test**

Run: `cd /home/andrii/MyProjects/AetherSpire && npm run build`

**Step 2: Test on desktop**

Verify the following still work:
- WASD movement
- E key interaction (issues, doors, hatches)
- Context menu (W/S navigate, E confirm, Escape cancel)
- Mouse wheel zoom
- Q ping
- Start screen displays correctly
- No visible touch UI elements on desktop

**Step 3: Test on mobile (or Chrome DevTools device emulation)**

Open Chrome DevTools → Toggle Device Toolbar (Ctrl+Shift+M) → select a mobile device (e.g. iPhone 14, Pixel 7).

Verify:
- [ ] Orientation banner shows in portrait, hides in landscape
- [ ] Virtual joystick appears when touching left side of screen
- [ ] Joystick controls player movement with analog speed
- [ ] Joystick disappears when thumb lifts
- [ ] Interact button appears near interactable objects
- [ ] Interact button triggers fix/door/hatch actions
- [ ] Context menu shows as tappable buttons on mobile
- [ ] Cancel button appears while fixing
- [ ] Ping button works
- [ ] Pinch-to-zoom works (use Shift+click in DevTools for simulated pinch)
- [ ] No page zoom/bounce on touch
- [ ] Start screen fits on small screen
- [ ] Input fields don't trigger iOS zoom (font-size >= 16px)

**Step 4: Fix any issues found during testing**

Address any bugs or UX issues.

**Step 5: Final commit**

```
fix: polish mobile touch controls after testing
```
