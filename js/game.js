/*
 * Bumble Dash - main game loop and state machine.
 * States: title -> ready -> play -> dying -> over -> ready ...
 */
(() => {
  const canvas = document.getElementById("game");
  const g = canvas.getContext("2d");

  // Fallback for older browsers without CanvasRenderingContext2D.roundRect
  if (!g.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
    };
  }

  /* ---------------------------------------------------------- tuning */
  const CFG = {
    gravity: 1550,
    flapPower: 470,
    startSpeed: 210,
    maxSpeed: 330,
    speedPerPoint: 3,
    startGap: 190,
    minGap: 140,
    gapPerPoint: 1.5,
    spacing: 300, // horizontal distance between stalks
  };

  const MEDALS = [
    { min: 80, name: "PLATINUM", color: "#e5f3ff", edge: "#8fb3d1" },
    { min: 40, name: "GOLD", color: "#ffd84a", edge: "#b8860b" },
    { min: 20, name: "SILVER", color: "#d9d9d9", edge: "#8a8a8a" },
    { min: 10, name: "BRONZE", color: "#e09b5a", edge: "#8a5520" },
  ];

  /* ----------------------------------------------------------- state */
  const bee = new Bee();
  const scenery = new Scenery();
  const particles = new Particles();
  let stalks = [];
  let state = "title";
  let paused = false;
  let score = 0;
  let best = 0;
  let newBest = false;
  let speed = CFG.startSpeed;
  let time = 0;
  let stateT = 0; // time since entering the current state
  let flash = 0;
  let shake = 0;
  let scorePop = 0;

  try { best = parseInt(localStorage.getItem("bumble-best") || "0", 10) || 0; } catch (e) {}

  function setState(s) {
    state = s;
    stateT = 0;
  }

  function resetRun() {
    bee.reset();
    stalks = [];
    score = 0;
    newBest = false;
    speed = CFG.startSpeed;
    particles.list = [];
    setState("ready");
  }

  function spawnStalk(x) {
    const gap = Math.max(CFG.minGap, CFG.startGap - score * CFG.gapPerPoint);
    const margin = 70;
    const last = stalks[stalks.length - 1];
    let gapY = rand(margin + gap / 2, FLOOR_Y - margin - gap / 2);
    // keep consecutive gaps reachable
    if (last) gapY = clamp(gapY, last.gapY - 200, last.gapY + 200);
    stalks.push(new Stalk(x, gapY, gap));
  }

  /* ----------------------------------------------------------- input */
  function press() {
    Sfx.unlock();
    if (paused) { paused = false; return; }
    switch (state) {
      case "title":
        resetRun();
        break;
      case "ready":
        setState("play");
        flapBee();
        break;
      case "play":
        flapBee();
        break;
      case "over":
        if (stateT > 0.6) resetRun(); // small delay so you don't skip the score
        break;
    }
  }

  function flapBee() {
    bee.flap(CFG.flapPower);
    Sfx.flap();
    particles.burst(bee.x - 20, bee.y + 6, "rgba(255,255,255,0.8)", 3, 80);
  }

  function togglePause() {
    if (state === "play") paused = !paused;
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Enter") {
      e.preventDefault();
      press();
    } else if (e.code === "KeyP" || e.code === "Escape") {
      togglePause();
    } else if (e.code === "KeyM") {
      Sfx.toggleMute();
    }
  });

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    // mute button in the top-right corner
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    if (x > W - 60 && y < 60) { Sfx.toggleMute(); return; }
    press();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "play") paused = true;
  });

  /* ---------------------------------------------------------- update */
  function update(dt) {
    time += dt;
    stateT += dt;
    flash = Math.max(0, flash - dt * 3);
    shake = Math.max(0, shake - dt * 30);
    scorePop = Math.max(0, scorePop - dt * 4);

    const scrolling = state === "title" || state === "ready" || state === "play";
    if (scrolling) scenery.update(dt, speed);
    particles.update(dt);

    if (state === "title" || state === "ready") {
      bee.hover(dt);
      return;
    }

    if (state === "play") {
      bee.update(dt, CFG.gravity);

      // spawn and move stalks
      const lastX = stalks.length ? stalks[stalks.length - 1].x : -Infinity;
      if (lastX < W - CFG.spacing) spawnStalk(Math.max(W + 40, lastX + CFG.spacing));
      for (const s of stalks) s.x -= speed * dt;
      stalks = stalks.filter((s) => s.x > -CAP_W - 20);

      // scoring
      for (const s of stalks) {
        if (!s.scored && s.right < bee.x) {
          s.scored = true;
          score++;
          scorePop = 1;
          speed = Math.min(CFG.maxSpeed, CFG.startSpeed + score * CFG.speedPerPoint);
          Sfx.score();
          particles.burst(bee.x, bee.y, "#ffe066", 10, 180);
        }
      }

      // ceiling: bonk but keep flying
      if (bee.y < bee.r) { bee.y = bee.r; bee.vy = Math.max(bee.vy, 0); }

      // collisions
      const hitStalk = stalks.some((s) => s.hits(bee));
      const hitGround = bee.y + bee.r >= FLOOR_Y;
      if (hitStalk || hitGround) die(hitGround);
      return;
    }

    if (state === "dying") {
      bee.update(dt, CFG.gravity);
      if (bee.y + bee.r >= FLOOR_Y) {
        bee.y = FLOOR_Y - 24;
        bee.vy = 0;
        bee.angle = Math.PI / 2;
        finishRun();
      }
    }
  }

  function die(onGround) {
    bee.alive = false;
    flash = 1;
    shake = 12;
    Sfx.hit();
    particles.burst(bee.x, bee.y, "#ffcc33", 14, 220);
    particles.burst(bee.x, bee.y, "#2b2b2b", 6, 160);
    if (onGround) {
      bee.y = FLOOR_Y - 24;
      bee.angle = Math.PI / 2;
      finishRun();
    } else {
      bee.vy = -200;
      Sfx.fall();
      setState("dying");
    }
  }

  function finishRun() {
    if (score > best) {
      best = score;
      newBest = true;
      try { localStorage.setItem("bumble-best", String(best)); } catch (e) {}
      setTimeout(() => Sfx.best(), 350);
    }
    setState("over");
  }

  /* ------------------------------------------------------------ draw */
  function text(str, x, y, size, opts = {}) {
    const { color = "#fff", align = "center", stroke = "#3a2a10", weight = "bold", lw = size / 6 } = opts;
    g.font = `${weight} ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.lineJoin = "round";
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw;
      g.strokeText(str, x, y);
    }
    g.fillStyle = color;
    g.fillText(str, x, y);
  }

  function panel(x, y, w, h) {
    g.fillStyle = "#fff4d6";
    g.strokeStyle = "#3a2a10";
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(x, y, w, h, 16);
    g.fill();
    g.stroke();
    g.strokeStyle = "#e8c77a";
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(x + 8, y + 8, w - 16, h - 16, 10);
    g.stroke();
  }

  function drawMedal(x, y, m) {
    g.fillStyle = m.color;
    g.strokeStyle = m.edge;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(x, y, 34, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // little hexagon (honeycomb) emblem
    g.fillStyle = m.edge;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
    }
    g.closePath();
    g.fill();
    // shine
    const sparkle = (Math.sin(time * 4) + 1) / 2;
    g.fillStyle = `rgba(255,255,255,${0.4 + sparkle * 0.5})`;
    g.beginPath();
    g.arc(x - 14, y - 14, 4, 0, Math.PI * 2);
    g.fill();
  }

  function drawMuteIcon() {
    const x = W - 34, y = 30;
    g.save();
    g.globalAlpha = 0.85;
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.beginPath();
    g.arc(x, y, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(x - 10, y - 5);
    g.lineTo(x - 4, y - 5);
    g.lineTo(x + 3, y - 11);
    g.lineTo(x + 3, y + 11);
    g.lineTo(x - 4, y + 5);
    g.lineTo(x - 10, y + 5);
    g.fill();
    g.strokeStyle = "#fff";
    g.lineWidth = 2.5;
    g.beginPath();
    if (Sfx.muted) {
      g.moveTo(x + 7, y - 6); g.lineTo(x + 15, y + 6);
      g.moveTo(x + 15, y - 6); g.lineTo(x + 7, y + 6);
    } else {
      g.arc(x + 4, y, 8, -0.9, 0.9);
    }
    g.stroke();
    g.restore();
  }

  function draw() {
    g.save();
    if (shake > 0) g.translate(rand(-shake, shake), rand(-shake, shake));

    scenery.drawBack(g);
    for (const s of stalks) s.draw(g, time);
    scenery.drawGround(g);
    particles.draw(g);
    bee.draw(g);

    g.restore();

    // HUD / overlays
    if (state === "title") {
      const bob = Math.sin(time * 2.5) * 6;
      text("BUMBLE DASH", W / 2, 140 + bob, 78, { color: "#ffcc33", lw: 12 });
      text("a very clumsy bee", W / 2, 205, 26, { color: "#fff", lw: 6 });
      if (Math.floor(time * 2) % 2 === 0) text("Tap or press Space to start", W / 2, 420, 30, { lw: 7 });
      if (best > 0) text(`Best: ${best}`, W / 2, 470, 24, { lw: 6 });
    }

    if (state === "ready") {
      text("Get Ready!", W / 2, 150, 60, { color: "#ffcc33", lw: 10 });
      text("Tap / Space to flap", W / 2, 400, 28, { lw: 7 });
      // little tap hand hint
      g.fillStyle = "rgba(255,255,255,0.9)";
      const p = (Math.sin(time * 6) + 1) * 4;
      g.beginPath();
      g.arc(bee.x + 70, bee.y + 10 + p, 10, 0, Math.PI * 2);
      g.fill();
      text("TAP", bee.x + 70, bee.y + 38 + p, 16, { lw: 4 });
    }

    if (state === "play" || state === "dying") {
      const s = 1 + scorePop * 0.25;
      g.save();
      g.translate(W / 2, 70);
      g.scale(s, s);
      text(String(score), 0, 0, 64, { lw: 10 });
      g.restore();
    }

    if (state === "over") {
      const slide = Math.min(1, stateT * 3);
      const ease = 1 - Math.pow(1 - slide, 3);
      text("Game Over", W / 2, 110 * ease, 64, { color: "#ff7b7b", lw: 10 });

      const py = H + 20 - (H - 170) * ease;
      panel(W / 2 - 200, py, 400, 220);

      const medal = MEDALS.find((m) => score >= m.min);
      text("MEDAL", W / 2 - 110, py + 40, 22, { color: "#b07a2a", stroke: null });
      if (medal) {
        drawMedal(W / 2 - 110, py + 105, medal);
        text(medal.name, W / 2 - 110, py + 162, 16, { color: medal.edge, stroke: null });
      } else {
        g.strokeStyle = "#e8c77a";
        g.setLineDash([6, 6]);
        g.lineWidth = 3;
        g.beginPath();
        g.arc(W / 2 - 110, py + 105, 34, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }

      text("SCORE", W / 2 + 90, py + 40, 22, { color: "#b07a2a", stroke: null });
      text(String(score), W / 2 + 90, py + 80, 44, { lw: 8 });
      text("BEST", W / 2 + 90, py + 125, 22, { color: "#b07a2a", stroke: null });
      text(String(best), W / 2 + 90, py + 165, 44, { lw: 8 });
      if (newBest) text("NEW!", W / 2 + 160, py + 125, 18, { color: "#ff5e5e", stroke: null });

      if (stateT > 0.6 && Math.floor(time * 2) % 2 === 0) {
        text("Tap or press Space to play again", W / 2, py + 260, 26, { lw: 6 });
      }
    }

    if (paused) {
      g.fillStyle = "rgba(0,0,0,0.4)";
      g.fillRect(0, 0, W, H);
      text("Paused", W / 2, H / 2 - 20, 60, { lw: 10 });
      text("Tap or press P to resume", W / 2, H / 2 + 40, 24, { lw: 6 });
    }

    if (flash > 0) {
      g.fillStyle = `rgba(255,255,255,${flash * 0.8})`;
      g.fillRect(0, 0, W, H);
    }

    drawMuteIcon();
  }

  /* ------------------------------------------------------------ loop */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000); // clamp big gaps (tab switch)
    last = now;
    if (!paused) update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // expose a tiny hook for debugging / automated tests
  window.BumbleDash = { get state() { return state; }, get score() { return score; }, press };
})();
