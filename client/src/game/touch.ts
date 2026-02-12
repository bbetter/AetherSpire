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
  const interactBtn = createButton("E", "20px", "20px", "64px");
  interactBtn.style.display = "none";

  // Cancel button (same spot as interact — they never show together)
  const cancelBtn = createButton("X", "20px", "20px", "64px");
  cancelBtn.style.display = "none";
  cancelBtn.style.background = "rgba(204,68,51,0.15)";
  cancelBtn.style.borderColor = "rgba(204,68,51,0.5)";
  cancelBtn.style.color = "rgba(255,100,80,0.8)";

  // Ping button (left of interact, compact)
  const pingBtn = createButton("Q", "28px", "100px", "44px");
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
