/* AutoType Plinko Arcade: visual-only points, no coins or paid plays. */
(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", async () => {
    if (window.AutoType?.ready) await AutoType.ready();

    const canvas = document.getElementById("plinkoBoard");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const $ = (id) => document.getElementById(id);
    const W = 720, H = 750, LEFT = 65, RIGHT = 655, SLOTS = 9;
    const SLOT_Y = 632, BOTTOM_Y = 704, BALL_R = 10, PEG_R = 6;
    const SLOT_WIDTH = (RIGHT - LEFT) / SLOTS;
    const VALUES = [60, 40, 25, 15, 10, 15, 25, 40, 60];
    const MAX_DROPS = 5;
    const pegs = [];
    for (let row = 0; row < 11; row++) {
      const count = row % 2 === 0 ? 10 : 9;
      const startX = row % 2 === 0 ? 117 : 144;
      for (let col = 0; col < count; col++) {
        pegs.push({x: startX + col * 54, y: 142 + row * 43});
      }
    }

    const account = window.AutoType?.currentAccount?.();
    const accountKey = account?.supabaseUserId || account?.id || "guest";
    const STORAGE_KEY = "autotype:plinko:best:" + accountKey;
    let best = 0;
    try { best = Math.max(0, Number(localStorage.getItem(STORAGE_KEY)) || 0); } catch {}
    let score = 0, drops = 0, aim = 50, ball = null;
    let activeSlot = -1, activeUntil = 0, lastTime = 0;
    let lastResult = "";
    const dropBtn = $("plinkoDrop");
    const resetBtn = $("plinkoReset");
    const aimInput = $("plinkoAim");
    const scoreLabel = $("plinkoScore");
    const bestLabel = $("plinkoBest");
    const dropLabel = $("plinkoDrops");
    const stateLabel = $("plinkoStatus");
    const scoreAnnouncement = $("plinkoAnnounce");

    function saveBest() {
      if (score <= best) return;
      best = score;
      try { localStorage.setItem(STORAGE_KEY, String(best)); } catch {}
    }
    function updateUI() {
      scoreLabel.textContent = score.toLocaleString();
      bestLabel.textContent = best.toLocaleString();
      dropLabel.textContent = String(Math.max(0, MAX_DROPS - drops));
      dropBtn.disabled = !!ball;
      dropBtn.textContent = drops >= MAX_DROPS ? "New round" : (ball ? "Ball in play…" : "Drop ball");
      aimInput.disabled = !!ball;
      resetBtn.disabled = !!ball;
    }
    function resetRound() {
      ball = null;
      score = 0;
      drops = 0;
      activeSlot = -1;
      lastResult = "";
      stateLabel.textContent = "Ready to drop. Select your launch position.";
      scoreAnnouncement.textContent = "New arcade round started.";
      updateUI();
    }
    function dropBall() {
      if (ball) return;
      if (drops >= MAX_DROPS) { resetRound(); return; }
      const span = RIGHT - LEFT - 80;
      ball = {
        x: LEFT + 40 + (aim / 100) * span,
        y: 82,
        vx: (Math.random() - 0.5) * 34,
        vy: 0,
        start: performance.now()
      };
      activeSlot = -1;
      stateLabel.textContent = "Watch the ball travel through the pegs.";
      scoreAnnouncement.textContent = "Ball " + (drops + 1) + " is falling.";
      updateUI();
    }
    function completeDrop(now) {
      if (!ball) return;
      const slot = Math.max(0, Math.min(SLOTS - 1, Math.floor((ball.x - LEFT) / SLOT_WIDTH)));
      const points = VALUES[slot];
      score += points;
      drops += 1;
      ball = null;
      activeSlot = slot;
      activeUntil = now + 1450;
      saveBest();
      lastResult = "+" + points + " arcade points!";
      if (drops === MAX_DROPS) {
        stateLabel.textContent = "Round complete! " + score + " arcade points. Try to beat your best.";
        scoreAnnouncement.textContent = lastResult + " Round complete with " + score + " points.";
      } else {
        stateLabel.textContent = lastResult + " " + (MAX_DROPS - drops) + " free drops left.";
        scoreAnnouncement.textContent = lastResult;
      }
      updateUI();
    }
    function advance(dt, now) {
      if (!ball) return;
      const steps = 3;
      const step = dt / steps;
      for (let n = 0; n < steps && ball; n++) {
        ball.vy += 1350 * step;
        ball.vx *= (1 - 0.25 * step);
        ball.x += ball.vx * step;
        ball.y += ball.vy * step;
        if (ball.x < LEFT + BALL_R) {
          ball.x = LEFT + BALL_R;
          ball.vx = Math.abs(ball.vx) * 0.68;
        } else if (ball.x > RIGHT - BALL_R) {
          ball.x = RIGHT - BALL_R;
          ball.vx = -Math.abs(ball.vx) * 0.68;
        }

        for (const peg of pegs) {
          const dx = ball.x - peg.x, dy = ball.y - peg.y;
          if (Math.abs(dx) > BALL_R + PEG_R || Math.abs(dy) > BALL_R + PEG_R) continue;
          const distance = Math.hypot(dx, dy);
          const radius = BALL_R + PEG_R;
          if (distance >= radius) continue;
          const nx = distance > 0.01 ? dx / distance : (Math.random() > 0.5 ? 1 : -1);
          const ny = distance > 0.01 ? dy / distance : -1;
          ball.x = peg.x + nx * (radius + 0.25);
          ball.y = peg.y + ny * (radius + 0.25);
          const along = ball.vx * nx + ball.vy * ny;
          if (along < 0) {
            ball.vx -= 1.7 * along * nx;
            ball.vy -= 1.7 * along * ny;
            ball.vx += (Math.random() - 0.5) * 47;
          }
        }

        if (ball.y + BALL_R >= SLOT_Y) {
          for (let k = 1; k < SLOTS; k++) {
            const x = LEFT + k * SLOT_WIDTH;
            const dx = ball.x - x;
            if (Math.abs(dx) >= BALL_R + 2) continue;
            if (Math.abs(ball.y - SLOT_Y) < BALL_R && ball.vy < 0) continue;
            const side = dx >= 0 ? 1 : -1;
            ball.x = x + side * (BALL_R + 2);
            ball.vx = side * Math.max(60, Math.abs(ball.vx) * 0.65);
          }
        }

        ball.vx = Math.max(-450, Math.min(450, ball.vx));
        ball.vy = Math.max(-450, Math.min(950, ball.vy));
        if (ball.y >= BOTTOM_Y || now - ball.start > 9500) completeDrop(now);
      }
    }

    function roundRect(x, y, width, height, radius, fill, stroke) {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    }
    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#192936");
      bg.addColorStop(0.68, "#172029");
      bg.addColorStop(1, "#141c25");
      roundRect(15, 12, W - 30, H - 26, 18, bg, "#3a4b5a");

      // Board frame and aiming rail.
      ctx.strokeStyle = "#5c7786"; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(LEFT, 96); ctx.lineTo(LEFT, BOTTOM_Y + 11);
      ctx.moveTo(RIGHT, 96); ctx.lineTo(RIGHT, BOTTOM_Y + 11);
      ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = "#2b789a";
      ctx.beginPath(); ctx.moveTo(LEFT + 40, 55); ctx.lineTo(RIGHT - 40, 55); ctx.stroke();
      const aimX = LEFT + 40 + aim / 100 * (RIGHT - LEFT - 80);
      ctx.fillStyle = "#a8ddff";
      ctx.beginPath(); ctx.moveTo(aimX, 69); ctx.lineTo(aimX - 9, 51); ctx.lineTo(aimX + 9, 51); ctx.closePath(); ctx.fill();
      ctx.font = "700 13px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.fillStyle = "#b1c6d5";
      ctx.fillText("DROP ZONE", W / 2, 34);

      // Pins: static glass/steel pegs.
      for (const peg of pegs) {
        ctx.beginPath(); ctx.arc(peg.x, peg.y, PEG_R + 2, 0, Math.PI * 2); ctx.fillStyle = "#10222f"; ctx.fill();
        ctx.beginPath(); ctx.arc(peg.x, peg.y, PEG_R, 0, Math.PI * 2); ctx.fillStyle = "#77b2c9"; ctx.fill();
        ctx.beginPath(); ctx.arc(peg.x - 1.7, peg.y - 1.7, 2.1, 0, Math.PI * 2); ctx.fillStyle = "#c8e6ef"; ctx.fill();
      }

      const colors = ["#3b6785","#315d7b","#2a526e","#24465e","#213d50","#24465e","#2a526e","#315d7b","#3b6785"];
      for (let i = 0; i < SLOTS; i++) {
        const x = LEFT + i * SLOT_WIDTH;
        const highlighted = i === activeSlot && now < activeUntil;
        roundRect(x + 3, SLOT_Y + 9, SLOT_WIDTH - 6, 81, 5, highlighted ? "#246b8f" : colors[i], highlighted ? "#83d8ff" : "#3c5664");
        ctx.fillStyle = highlighted ? "#ffffff" : "#e1f3fc";
        ctx.font = "800 18px system-ui, sans-serif";
        ctx.fillText(String(VALUES[i]), x + SLOT_WIDTH / 2, SLOT_Y + 53);
        ctx.font = "600 9px system-ui, sans-serif";
        ctx.fillStyle = "#bad3e1"; ctx.fillText("PTS", x + SLOT_WIDTH / 2, SLOT_Y + 70);
      }
      ctx.lineWidth = 3; ctx.strokeStyle = "#85a7bc";
      for (let k = 1; k < SLOTS; k++) {
        const x = LEFT + k * SLOT_WIDTH;
        ctx.beginPath(); ctx.moveTo(x, SLOT_Y); ctx.lineTo(x, SLOT_Y + 90); ctx.stroke();
      }
      if (ball) {
        ctx.shadowColor = "#8ae6ff"; ctx.shadowBlur = 17;
        const glow = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, BALL_R);
        glow.addColorStop(0, "#ffffff"); glow.addColorStop(0.35, "#d4f3ff"); glow.addColorStop(1, "#46b8e4");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = "#6f8597"; ctx.font = "500 10px system-ui, sans-serif";
      ctx.fillText("FREE ARCADE PLAY • POINTS ONLY", W / 2, H - 11);
    }

    dropBtn.addEventListener("click", dropBall);
    resetBtn.addEventListener("click", resetRound);
    aimInput.addEventListener("input", () => {
      if (!ball) { aim = Number(aimInput.value); }
    });
    canvas.addEventListener("pointerdown", event => {
      if (ball) return;
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * W / rect.width;
      aim = Math.max(0, Math.min(100, ((x - LEFT - 40) / (RIGHT - LEFT - 80)) * 100));
      aimInput.value = String(Math.round(aim));
      stateLabel.textContent = "Aim set. Press Drop ball when ready.";
    });

    function frame(now) {
      const dt = Math.min((now - (lastTime || now)) / 1000, 0.033);
      lastTime = now;
      advance(dt, now);
      draw(now);
      requestAnimationFrame(frame);
    }
    updateUI();
    requestAnimationFrame(frame);
  });
})();
