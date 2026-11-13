/*
 * Jeme-Jeme - main game loop and state machine.
 * Solo:        title -> ready -> play -> dying -> over -> ready ...
 * Multiplayer: title(lobby) -> countdown -> play -> results -> countdown ...
 */
(() => {
  const canvas = document.getElementById("game");
  const g = canvas.getContext("2d");

  /* ------------------------------------------------- phone full screen */
  // On touch devices the game fills the whole screen: the height stays 600
  // world units and the width stretches to match the screen's shape.
  const isTouch = window.matchMedia("(pointer: coarse)").matches;

  function fitToScreen() {
    if (!isTouch) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const landscape = vw > vh;
    const newW = landscape ? Math.round(clamp((H * vw) / vh, 900, 1600)) : 900;
    if (newW !== W) {
      W = newW;
      canvas.width = W;
    }
    document.body.classList.toggle("portrait", !landscape);
  }
  fitToScreen();
  window.addEventListener("resize", fitToScreen);
  window.addEventListener("orientationchange", () => setTimeout(fitToScreen, 150));

  // Hide the browser bars (Android Chrome etc.). Needs a tap, so it runs on
  // taps on the game or the menu buttons. iPhone Safari can't do this for
  // web pages; there, "Add to Home Screen" gives the full-screen version.
  function goFullscreen() {
    if (!isTouch) return;
    const el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    try {
      const p = req.call(el, { navigationUI: "hide" });
      const lock = () => {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
      };
      if (p && p.then) p.then(lock).catch(() => {});
      else lock();
    } catch (e) {}
  }
  document.addEventListener("pointerup", (e) => {
    if (e.target === canvas || (e.target.closest && e.target.closest("button"))) goFullscreen();
  });

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
    minGap: 150,
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
  let passed = 0; // stalks that have scrolled past the player line (drives difficulty)

  // multiplayer
  let mode = "solo"; // "solo" | "mp"
  let rng = Math.random; // seeded in multiplayer so everyone gets the same course
  const remotes = new Map(); // peerId -> { name, slot, bee, tx, ty, ta, alive, score }
  let sendT = 0;
  let endT = 0;
  let results = [];
  const BEE_X = 220;

  try { best = parseInt(localStorage.getItem("jeme-best") || "0", 10) || 0; } catch (e) {}

  function setState(s) {
    state = s;
    stateT = 0;
  }

  function resetRun() {
    bee.reset();
    stalks = [];
    score = 0;
    passed = 0;
    newBest = false;
    speed = CFG.startSpeed;
    particles.list = [];
    setState("ready");
  }

  function spawnStalk(x) {
    const gap = Math.max(CFG.minGap, CFG.startGap - passed * CFG.gapPerPoint);
    const margin = 70;
    const last = stalks[stalks.length - 1];
    const lo = margin + gap / 2, hi = FLOOR_Y - margin - gap / 2;
    let gapY = lo + rng() * (hi - lo);
    // keep consecutive gaps reachable
    if (last) gapY = clamp(gapY, last.gapY - 200, last.gapY + 200);
    const s = new Stalk(x, gapY, gap);
    s.hue = Math.floor(rng() * 5);
    stalks.push(s);
  }

  // Deterministic PRNG (mulberry32) so all players see the same stalks
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ----------------------------------------------------------- input */
  function press() {
    Sfx.unlock();
    if (menuOpen()) return;
    if (paused) { paused = false; return; }
    if (mode === "mp") {
      if (state === "play" && bee.alive) flapBee();
      else if (state === "results" && Net.isHost && stateT > 1) startMatch();
      return;
    }
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
    if (state === "play" && mode === "solo") paused = !paused;
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.target && e.target.tagName === "INPUT") return;
    if (menuOpen()) return;
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
    if (document.hidden && state === "play" && mode === "solo") paused = true;
  });

  /* ---------------------------------------------------------- update */
  function update(dt) {
    time += dt;
    stateT += dt;
    flash = Math.max(0, flash - dt * 3);
    shake = Math.max(0, shake - dt * 30);
    scorePop = Math.max(0, scorePop - dt * 4);

    const scrolling = state === "title" || state === "ready" || state === "play" || state === "countdown";
    if (scrolling) scenery.update(dt, speed);
    particles.update(dt);

    if (state === "title" || state === "ready" || state === "countdown") {
      bee.hover(dt);
      for (const r of remotes.values()) r.bee.hover(dt);
      if (state === "countdown" && stateT >= 3) {
        setState("play");
        flapBee();
      }
      return;
    }

    if (state === "results") {
      updateRemotes(dt);
      return;
    }

    if (state === "play") {
      // spawn and move stalks
      const lastX = stalks.length ? stalks[stalks.length - 1].x : -Infinity;
      if (lastX < W - CFG.spacing) spawnStalk(Math.max(W + 40, lastX + CFG.spacing));
      for (const s of stalks) s.x -= speed * dt;
      stalks = stalks.filter((s) => s.x > -CAP_W - 20);

      // scoring (the course keeps going for spectators in multiplayer)
      for (const s of stalks) {
        if (!s.scored && s.right < BEE_X) {
          s.scored = true;
          passed++;
          speed = Math.min(CFG.maxSpeed, CFG.startSpeed + passed * CFG.speedPerPoint);
          if (bee.alive) {
            score++;
            scorePop = 1;
            Sfx.score();
            particles.burst(bee.x, bee.y, "#ffe066", 10, 180);
          }
        }
      }

      if (bee.alive) {
        bee.update(dt, CFG.gravity);
        // ceiling: bonk but keep flying
        if (bee.y < bee.r) { bee.y = bee.r; bee.vy = Math.max(bee.vy, 0); }
        // collisions
        const hitStalk = stalks.some((s) => s.hits(bee));
        const hitGround = bee.y + bee.r >= FLOOR_Y;
        if (hitStalk || hitGround) die(hitGround);
      } else if (bee.y + bee.r < FLOOR_Y - 5) {
        bee.update(dt, CFG.gravity); // falling after a crash (multiplayer)
      } else {
        bee.y = FLOOR_Y - 29;
        bee.vy = 0;
        bee.angle = Math.PI / 2;
        bee.x -= speed * dt; // lies on the ground and scrolls away
      }

      if (mode === "mp") mpStep(dt);
      return;
    }

    if (state === "dying") {
      bee.update(dt, CFG.gravity);
      if (bee.y + bee.r >= FLOOR_Y) {
        bee.y = FLOOR_Y - 29;
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
    if (mode === "mp") {
      if (onGround) bee.y = FLOOR_Y - 29;
      else { bee.vy = -200; Sfx.fall(); }
      sendState(); // tell everyone right away
      return;
    }
    if (onGround) {
      bee.y = FLOOR_Y - 29;
      bee.angle = Math.PI / 2;
      finishRun();
    } else {
      bee.vy = -200;
      Sfx.fall();
      setState("dying");
    }
  }

  function saveBest() {
    if (score > best) {
      best = score;
      newBest = true;
      try { localStorage.setItem("jeme-best", String(best)); } catch (e) {}
      setTimeout(() => Sfx.best(), 350);
    }
  }

  function finishRun() {
    if (score > best) {
      best = score;
      newBest = true;
      try { localStorage.setItem("jeme-best", String(best)); } catch (e) {}
      setTimeout(() => Sfx.best(), 350);
    }
    setState("over");
  }

  /* ----------------------------------------------------- multiplayer */
  function playerColor(slot) { return Net.COLORS[slot] || "#fff"; }
  function mySlot() {
    const me = Net.players.find((p) => p.id === Net.myId);
    return me ? me.slot : 0;
  }

  function addRemote(p) {
    const b = new Bee();
    b.bobT = p.slot * 0.8; // so the hovering bees don't overlap perfectly
    remotes.set(p.id, { name: p.name, slot: p.slot, bee: b, tx: b.x, ty: b.y, ta: 0, alive: true, score: 0 });
  }

  function sendState() {
    sendT = 0;
    Net.send({ t: "st", x: Math.round(bee.x), y: Math.round(bee.y), a: +bee.angle.toFixed(2), al: bee.alive, s: score });
  }

  function updateRemotes(dt) {
    for (const r of remotes.values()) {
      const k = Math.min(1, dt * 15);
      r.bee.x += (r.tx - r.bee.x) * k;
      r.bee.y += (r.ty - r.bee.y) * k;
      r.bee.angle += (r.ta - r.bee.angle) * k;
      r.bee.alive = r.alive;
      if (r.alive) r.bee.wingT += dt * 35;
    }
  }

  function mpStep(dt) {
    sendT += dt;
    if (sendT >= 0.05) sendState(); // ~20 updates per second
    updateRemotes(dt);

    const anyoneAlive = bee.alive || [...remotes.values()].some((r) => r.alive);
    if (anyoneAlive) { endT = 0; return; }
    endT += dt;
    if (endT > 1.2) endMatch();
  }

  function startMatch() {
    const seed = Math.floor(Math.random() * 2 ** 31);
    Net.locked = true;
    Net.send({ t: "start", seed });
    beginMatch(seed);
  }

  function beginMatch(seed) {
    mode = "mp";
    rng = seeded(seed);
    paused = false;
    remotes.clear();
    for (const p of Net.players) if (p.id !== Net.myId) addRemote(p);
    resetRun();
    hideMenu();
    setState("countdown");
  }

  function endMatch() {
    sendState();
    saveBest();
    results = [
      { name: "You", slot: mySlot(), score, me: true },
      ...[...remotes.values()].map((r) => ({ name: r.name, slot: r.slot, score: r.score })),
    ].sort((a, b) => b.score - a.score);
    if (Net.isHost) Net.locked = false; // new players may join between rounds
    setState("results");
  }

  function backToSolo(message) {
    mode = "solo";
    rng = Math.random;
    remotes.clear();
    setState("title");
    showMenu("main", message);
  }

  Net.on("msg", (d) => {
    if (d.t === "start") {
      beginMatch(d.seed);
    } else if (d.t === "st") {
      let r = remotes.get(d.from);
      if (!r) {
        const p = Net.players.find((pp) => pp.id === d.from);
        if (!p || mode !== "mp") return;
        addRemote(p);
        r = remotes.get(d.from);
      }
      r.tx = d.x; r.ty = d.y; r.ta = d.a; r.alive = !!d.al; r.score = d.s | 0;
    }
  });
  Net.on("players", (list) => {
    renderPlayers(list);
    for (const id of [...remotes.keys()]) if (!list.some((p) => p.id === id)) remotes.delete(id);
  });
  Net.on("closed", (why) => backToSolo(why));
  Net.on("error", (msg) => setStatus(msg));

  /* -------------------------------------------------------- menu (DOM) */
  const $ = (id) => document.getElementById(id);
  const ui = {
    menu: $("menu"), status: $("status"), name: $("nameInput"), code: $("codeInput"),
    roomCode: $("roomCode"), list: $("playerList"), start: $("btnStart"), wait: $("waitText"),
    menuBtn: $("btnMenu"),
  };

  function menuOpen() { return !ui.menu.hidden; }
  function hideMenu() { ui.menu.hidden = true; setStatus(""); }
  function showMenu(screen, message = "") {
    ui.menu.hidden = false;
    for (const sec of ui.menu.querySelectorAll("[data-screen]")) sec.hidden = sec.dataset.screen !== screen;
    if (screen === "lobby") {
      ui.roomCode.textContent = Net.code || "-----";
      renderPlayers(Net.players);
    }
    setStatus(message);
  }
  function setStatus(msg) { ui.status.textContent = msg || ""; }
  function setBusy(b) { for (const btn of ui.menu.querySelectorAll("button")) btn.disabled = b; }

  function renderPlayers(list) {
    ui.list.innerHTML = "";
    for (let i = 0; i < Net.MAX_PLAYERS; i++) {
      const p = list.find((pp) => pp.slot === i);
      const li = document.createElement("li");
      if (p) {
        li.style.setProperty("--c", playerColor(p.slot));
        li.textContent = p.name + (p.id === Net.myId ? " (you)" : "") + (i === 0 ? " ★" : "");
      } else {
        li.className = "empty";
        li.textContent = "waiting…";
      }
      ui.list.appendChild(li);
    }
    ui.start.hidden = !Net.isHost;
    ui.wait.hidden = Net.isHost;
    ui.start.disabled = list.length < 2;
    ui.start.textContent = list.length < 2 ? "Need 2+ players" : `Start game (${list.length} players)`;
  }

  function playerName() {
    const n = ui.name.value.trim() || "Player";
    try { localStorage.setItem("jeme-name", n); } catch (e) {}
    return n;
  }

  try { ui.name.value = localStorage.getItem("jeme-name") || ""; } catch (e) {}
  const urlRoom = new URLSearchParams(location.search).get("room");
  if (urlRoom) ui.code.value = urlRoom.toUpperCase().slice(0, 5);

  $("btnSolo").onclick = () => {
    Sfx.unlock();
    Net.leave();
    mode = "solo";
    rng = Math.random;
    remotes.clear();
    hideMenu();
    resetRun();
  };

  $("btnCreate").onclick = async () => {
    Sfx.unlock();
    if (!Net.available) return setStatus("Multiplayer library failed to load. Check your internet.");
    setBusy(true);
    setStatus("Creating room…");
    try {
      await Net.host(playerName());
      showMenu("lobby", "Share the code with up to 3 friends!");
    } catch (e) {
      setStatus(e.message);
    }
    setBusy(false);
  };

  async function doJoin() {
    Sfx.unlock();
    const code = ui.code.value.trim().toUpperCase();
    if (code.length < 5) return setStatus("Enter the 5-letter room code.");
    if (!Net.available) return setStatus("Multiplayer library failed to load. Check your internet.");
    setBusy(true);
    setStatus("Joining room " + code + "…");
    try {
      await Net.join(code, playerName());
      showMenu("lobby", "Joined! Waiting for the host to start.");
    } catch (e) {
      setStatus(e.message);
    }
    setBusy(false);
  }
  $("btnJoin").onclick = doJoin;
  ui.code.addEventListener("keydown", (e) => { if (e.key === "Enter") doJoin(); });
  ui.code.addEventListener("input", () => {
    ui.code.value = ui.code.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });

  ui.start.onclick = () => { Sfx.unlock(); if (Net.players.length >= 2) startMatch(); };

  $("btnLeave").onclick = () => { Net.leave(); backToSolo(""); };

  $("btnCopy").onclick = async () => {
    const link = `${location.origin}${location.pathname}?room=${Net.code}`;
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: "Jeme-Jeme", text: `Join my Jeme-Jeme room: ${Net.code}`, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setStatus("Invite link copied!");
      }
    } catch (e) {
      setStatus(link);
    }
  };

  ui.menuBtn.onclick = () => {
    paused = false;
    if (mode === "mp" && Net.connected) {
      setState("title");
      showMenu("lobby");
    } else {
      setState("title");
      showMenu("main");
    }
  };

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

  // coloured ring + name above a player
  function tag(b, name, color) {
    if (b.x < -40) return;
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(b.x, b.y, 36, 0, Math.PI * 2);
    g.stroke();
    text(name, b.x, b.y - 50, 16, { color, lw: 4 });
  }

  function drawScoreboard() {
    const rows = [{ name: "You", slot: mySlot(), score, alive: bee.alive }, ...remotes.values()];
    g.save();
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath();
    g.roundRect(12, 12, 170, 16 + rows.length * 26, 10);
    g.fill();
    rows.forEach((r, i) => {
      const y = 32 + i * 26;
      g.globalAlpha = r.alive ? 1 : 0.45;
      g.fillStyle = playerColor(r.slot);
      g.beginPath();
      g.arc(28, y, 7, 0, Math.PI * 2);
      g.fill();
      text(r.name.slice(0, 10), 42, y, 17, { align: "left", lw: 4 });
      text(String(r.score), 168, y, 17, { align: "right", lw: 4 });
    });
    g.restore();
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
    if (mode === "mp") {
      for (const r of remotes.values()) {
        g.globalAlpha = 0.6;
        r.bee.draw(g);
        g.globalAlpha = 1;
        tag(r.bee, r.name, playerColor(r.slot));
      }
    }
    bee.draw(g);
    if (mode === "mp") tag(bee, "You", playerColor(mySlot()));

    g.restore();

    // HUD / overlays
    if (state === "title" && !menuOpen()) {
      const bob = Math.sin(time * 2.5) * 6;
      text("JEME-JEME", W / 2, 140 + bob, 84, { color: "#ffcc33", lw: 12 });
      text("a very clumsy flyer", W / 2, 205, 26, { color: "#fff", lw: 6 });
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

    if (mode === "mp" && (state === "play" || state === "countdown")) drawScoreboard();

    if (state === "countdown") {
      const n = 3 - Math.floor(stateT);
      const f = stateT % 1;
      text(String(n), W / 2, 200, 120 * (1.3 - f * 0.3), { color: "#ffcc33", lw: 14 });
      text("Get Ready!", W / 2, 320, 36, { lw: 8 });
    }

    if (mode === "mp" && state === "play" && !bee.alive) {
      text("You're out! Watching the others…", W / 2, 140, 28, { color: "#ff9f9f", lw: 6 });
    }

    if (state === "results") {
      const slide = Math.min(1, stateT * 3);
      const ease = 1 - Math.pow(1 - slide, 3);
      const winner = results[0];
      const title = winner && winner.me ? "You win!" : `${winner ? winner.name : "?"} wins!`;
      text(title, W / 2, 100 * ease, 60, { color: "#ffcc33", lw: 10 });
      const ph = 60 + results.length * 52;
      const py = H + 20 - (H - 150) * ease;
      panel(W / 2 - 220, py, 440, ph);
      results.forEach((r, i) => {
        const y = py + 46 + i * 52;
        g.fillStyle = playerColor(r.slot);
        g.beginPath();
        g.arc(W / 2 - 150, y, 12, 0, Math.PI * 2);
        g.fill();
        text(`${i + 1}.`, W / 2 - 185, y, 26, { color: "#b07a2a", stroke: null });
        text(r.name, W / 2 - 125, y, 28, { align: "left", color: r.me ? "#3a2a10" : "#6b5330", stroke: null });
        text(String(r.score), W / 2 + 185, y, 32, { align: "right", lw: 6 });
      });
      if (stateT > 1 && Math.floor(time * 2) % 2 === 0) {
        const msg = Net.isHost ? "Tap or press Space for a rematch" : "Waiting for the host to start a rematch…";
        text(msg, W / 2, py + ph + 40, 24, { lw: 6 });
      }
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

    const showMenuBtn = !menuOpen() && (state === "ready" || state === "over" || state === "results" || paused);
    if (ui.menuBtn.hidden === showMenuBtn) ui.menuBtn.hidden = !showMenuBtn;
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
  window.JemeJeme = { get state() { return state; }, get score() { return score; }, get mode() { return mode; }, get stalks() { return stalks; }, get bee() { return bee; }, press };

  showMenu("main", urlRoom ? "Enter your name, then tap Join." : "");
})();
