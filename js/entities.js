/*
 * Game entities: the bee, the flower-stalk obstacles, scenery and particles.
 * All art is drawn with the Canvas 2D API, so there are no image assets.
 */
// W grows on wide phone screens so the game fills them (see fitToScreen in game.js)
let W = 900;
const H = 600;
const GROUND_H = 80;
const FLOOR_Y = H - GROUND_H;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* --------------------------------------------------------------- Player */
// The player's face. If it fails to load, the game falls back to the bee.
const FACE = new Image();
FACE.src = "assets/face.png?v=3";

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.stroke();
}

class Bee {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 220;
    this.y = H / 2 - 40;
    this.vy = 0;
    this.r = 24; // collision radius
    this.angle = 0;
    this.wingT = 0;
    this.bobT = 0;
    this.alive = true;
  }

  flap(power) {
    this.vy = -power;
  }

  // Idle hover used on the title / get-ready screens
  hover(dt) {
    this.bobT += dt;
    this.wingT += dt * 30;
    this.y = H / 2 - 40 + Math.sin(this.bobT * 3) * 10;
    this.angle = 0;
  }

  update(dt, gravity) {
    this.vy = Math.min(this.vy + gravity * dt, 900);
    this.y += this.vy * dt;
    if (this.alive) this.wingT += dt * (this.vy < 0 ? 45 : 25);
    // tilt: nose up when rising, dive when falling
    const target = clamp(this.vy / 600, -0.45, 1.3);
    this.angle += (target - this.angle) * Math.min(1, dt * 10);
  }

  draw(g) {
    if (FACE.complete && FACE.naturalWidth) return this.drawFace(g);
    this.drawBee(g);
  }

  // Jeme: the photo face with little flapping wings
  drawFace(g) {
    const R = 27;
    const flap = Math.sin(this.wingT) * 0.7;
    g.save();
    g.translate(this.x, this.y);
    g.rotate(this.angle * 0.7);

    // wings (one on each side, behind the head)
    const wing = (side) => {
      g.save();
      g.translate(side * (R - 4), -6);
      g.rotate(side * (-0.5 + flap));
      g.fillStyle = "rgba(255,255,255,0.95)";
      g.strokeStyle = "#5b7a99";
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(side * 16, -8, 18, 10, side * -0.4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = "rgba(91,122,153,0.6)";
      g.beginPath();
      g.moveTo(side * 4, -4);
      g.lineTo(side * 26, -12);
      g.stroke();
      g.restore();
    };
    wing(-1);
    wing(1);

    // face (transparent cut-out, no frame)
    const S = R * 2.5;
    g.save();
    g.shadowColor = "rgba(0,0,0,0.25)";
    g.shadowBlur = 6;
    g.shadowOffsetY = 3;
    if (!this.alive) g.filter = "grayscale(0.7)";
    g.drawImage(FACE, -S / 2, -S / 2, S, S);
    g.filter = "none";
    g.restore();

    // dizzy stars when crashed
    if (!this.alive) {
      const t = performance.now() / 300;
      g.fillStyle = "#ffe066";
      g.strokeStyle = "#8a5520";
      g.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const a = t + (i * Math.PI * 2) / 3;
        star(g, Math.cos(a) * 26, -R - 6 + Math.sin(a) * 6, 6);
      }
    }
    g.restore();
  }

  drawBee(g) {
    g.save();
    g.translate(this.x, this.y);
    g.rotate(this.angle);

    // back wing
    const flap = Math.sin(this.wingT) * 0.6;
    this.drawWing(g, -4, -12, flap - 0.3, 0.55);

    // stinger
    g.fillStyle = "#2b2b2b";
    g.beginPath();
    g.moveTo(-22, 2);
    g.lineTo(-32, 5);
    g.lineTo(-21, 9);
    g.fill();

    // body
    g.fillStyle = "#ffcc33";
    g.strokeStyle = "#3a2a10";
    g.lineWidth = 2.5;
    g.beginPath();
    g.ellipse(0, 4, 24, 18, 0, 0, Math.PI * 2);
    g.fill();

    // stripes (clipped to body)
    g.save();
    g.clip();
    g.fillStyle = "#2b2b2b";
    g.fillRect(-14, -16, 7, 40);
    g.fillRect(-1, -16, 7, 40);
    g.restore();
    g.beginPath();
    g.ellipse(0, 4, 24, 18, 0, 0, Math.PI * 2);
    g.stroke();

    // belly shine
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.beginPath();
    g.ellipse(4, -6, 10, 4, -0.2, 0, Math.PI * 2);
    g.fill();

    // head
    g.fillStyle = "#2b2b2b";
    g.beginPath();
    g.arc(20, 0, 11, 0, Math.PI * 2);
    g.fill();

    // antennae
    g.strokeStyle = "#2b2b2b";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(22, -9);
    g.quadraticCurveTo(26, -22, 34, -22);
    g.moveTo(17, -10);
    g.quadraticCurveTo(16, -24, 24, -27);
    g.stroke();
    g.fillStyle = "#2b2b2b";
    g.beginPath();
    g.arc(34, -22, 2.5, 0, Math.PI * 2);
    g.arc(24, -27, 2.5, 0, Math.PI * 2);
    g.fill();

    // eye
    if (this.alive) {
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(24, -2, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#111";
      g.beginPath();
      g.arc(25.5, -2, 2.5, 0, Math.PI * 2);
      g.fill();
    } else {
      // dizzy X eyes
      g.strokeStyle = "#fff";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(20, -6); g.lineTo(28, 2);
      g.moveTo(28, -6); g.lineTo(20, 2);
      g.stroke();
    }

    // cheek
    g.fillStyle = "rgba(255,120,120,0.7)";
    g.beginPath();
    g.arc(23, 6, 2.5, 0, Math.PI * 2);
    g.fill();

    // front wing
    this.drawWing(g, 2, -14, flap, 0.8);

    g.restore();
  }

  drawWing(g, x, y, rot, alpha) {
    g.save();
    g.translate(x, y);
    g.rotate(-0.4 + rot);
    g.fillStyle = `rgba(220,240,255,${alpha})`;
    g.strokeStyle = "rgba(60,90,120,0.8)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(-4, -12, 9, 15, -0.3, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.restore();
  }
}

/* ------------------------------------------------------- Flower stalks */
const STALK_W = 70;
const CAP_W = 104;
const CAP_H = 34;

class Stalk {
  constructor(x, gapY, gap) {
    this.x = x; // left edge of the stem
    this.gapY = gapY; // centre of the gap
    this.gap = gap;
    this.scored = false;
    this.hue = Math.floor(rand(0, 5));
    this.sway = rand(0, Math.PI * 2);
  }

  get top() { return this.gapY - this.gap / 2; }
  get bottom() { return this.gapY + this.gap / 2; }
  get right() { return this.x + CAP_W - (CAP_W - STALK_W) / 2; }

  // Rectangles used for collision
  rects() {
    const capX = this.x - (CAP_W - STALK_W) / 2;
    return [
      { x: this.x, y: 0, w: STALK_W, h: this.top - CAP_H },
      { x: capX, y: this.top - CAP_H, w: CAP_W, h: CAP_H },
      { x: capX, y: this.bottom, w: CAP_W, h: CAP_H },
      { x: this.x, y: this.bottom + CAP_H, w: STALK_W, h: FLOOR_Y - this.bottom - CAP_H },
    ];
  }

  hits(bee) {
    // circle vs rect test, slightly forgiving
    const r = bee.r - 2;
    for (const rc of this.rects()) {
      const cx = clamp(bee.x, rc.x, rc.x + rc.w);
      const cy = clamp(bee.y, rc.y, rc.y + rc.h);
      const dx = bee.x - cx;
      const dy = bee.y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }

  draw(g, t) {
    const petals = ["#ff6b8b", "#ff9f43", "#a66bff", "#ff5e5e", "#4fc3f7"][this.hue];
    const capX = this.x - (CAP_W - STALK_W) / 2;

    // stems
    const stem = g.createLinearGradient(this.x, 0, this.x + STALK_W, 0);
    stem.addColorStop(0, "#3f8f3a");
    stem.addColorStop(0.45, "#6cc85a");
    stem.addColorStop(1, "#2f6e2b");
    g.fillStyle = stem;
    g.strokeStyle = "#1f4a1c";
    g.lineWidth = 3;
    const topH = this.top - CAP_H;
    const botY = this.bottom + CAP_H;
    g.fillRect(this.x, -5, STALK_W, topH + 5);
    g.strokeRect(this.x, -5, STALK_W, topH + 5);
    g.fillRect(this.x, botY, STALK_W, FLOOR_Y - botY + 5);
    g.strokeRect(this.x, botY, STALK_W, FLOOR_Y - botY + 5);

    // leaves
    const sway = Math.sin(t * 2 + this.sway) * 0.08;
    g.fillStyle = "#57b04a";
    g.strokeStyle = "#1f4a1c";
    g.lineWidth = 2;
    const leaf = (lx, ly, dir) => {
      if (ly < 10 || ly > FLOOR_Y - 10) return;
      if (ly > this.top - CAP_H - 10 && ly < this.bottom + CAP_H + 10) return;
      g.save();
      g.translate(lx, ly);
      g.rotate(dir * (0.5 + sway));
      g.beginPath();
      g.ellipse(dir * 18, 0, 20, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.restore();
    };
    for (let y = this.top - CAP_H - 70; y > 0; y -= 110) leaf(this.x + STALK_W, y, 1);
    for (let y = this.bottom + CAP_H + 60; y < FLOOR_Y; y += 110) leaf(this.x, y, -1);

    // flower caps (petal rims around the gap)
    this.drawCap(g, capX, this.top - CAP_H, petals, true);
    this.drawCap(g, capX, this.bottom, petals, false);
  }

  drawCap(g, x, y, petals, facingDown) {
    g.fillStyle = petals;
    g.strokeStyle = "#5a1f2e";
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(x, y, CAP_W, CAP_H, 12);
    g.fill();
    g.stroke();
    // scalloped petal edge facing the gap
    const edgeY = facingDown ? y + CAP_H : y;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const cx = x + 10.4 + i * 20.8;
      g.moveTo(cx + 10, edgeY);
      g.arc(cx, edgeY, 10, 0, Math.PI * 2);
    }
    g.fill();
    g.stroke();
    // pollen dots
    g.fillStyle = "#ffe066";
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(x + 22 + i * 20, y + CAP_H / 2, 4, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/* --------------------------------------------------------------- Scenery */
class Scenery {
  constructor() {
    this.clouds = Array.from({ length: 6 }, () => ({
      x: rand(0, W), y: rand(30, 220), s: rand(0.6, 1.3),
    }));
    this.hillOffset = 0;
    this.bushOffset = 0;
    this.groundOffset = 0;
  }

  update(dt, speed) {
    for (const c of this.clouds) {
      c.x -= speed * 0.1 * c.s * dt;
      if (c.x < -150) { c.x = W + 150; c.y = rand(30, 220); c.s = rand(0.6, 1.3); }
    }
    this.hillOffset = (this.hillOffset + speed * 0.25 * dt) % 600;
    this.bushOffset = (this.bushOffset + speed * 0.5 * dt) % 300;
    this.groundOffset = (this.groundOffset + speed * dt) % 40;
  }

  drawBack(g) {
    // sky
    const sky = g.createLinearGradient(0, 0, 0, FLOOR_Y);
    sky.addColorStop(0, "#6ec6ff");
    sky.addColorStop(1, "#d8f3ff");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // sun
    g.fillStyle = "rgba(255,240,170,0.9)";
    g.beginPath();
    g.arc(760, 90, 42, 0, Math.PI * 2);
    g.fill();

    // clouds
    g.fillStyle = "rgba(255,255,255,0.92)";
    for (const c of this.clouds) {
      g.save();
      g.translate(c.x, c.y);
      g.scale(c.s, c.s);
      g.beginPath();
      g.arc(0, 0, 26, 0, Math.PI * 2);
      g.arc(30, -12, 32, 0, Math.PI * 2);
      g.arc(62, 0, 24, 0, Math.PI * 2);
      g.arc(30, 8, 26, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // distant hills
    g.fillStyle = "#9bd88a";
    g.beginPath();
    g.moveTo(0, FLOOR_Y);
    for (let x = -this.hillOffset; x < W + 600; x += 600) {
      g.quadraticCurveTo(x + 150, FLOOR_Y - 190, x + 300, FLOOR_Y - 60);
      g.quadraticCurveTo(x + 450, FLOOR_Y - 150, x + 600, FLOOR_Y);
    }
    g.lineTo(W, FLOOR_Y);
    g.fill();

    // near bushes
    g.fillStyle = "#6fbf5f";
    for (let x = -this.bushOffset; x < W + 300; x += 300) {
      g.beginPath();
      g.arc(x + 40, FLOOR_Y, 40, Math.PI, 0);
      g.arc(x + 100, FLOOR_Y, 55, Math.PI, 0);
      g.arc(x + 165, FLOOR_Y, 35, Math.PI, 0);
      g.fill();
    }
  }

  drawGround(g) {
    g.fillStyle = "#d9b26a";
    g.fillRect(0, FLOOR_Y, W, GROUND_H);
    // grass strip
    g.fillStyle = "#58b84a";
    g.fillRect(0, FLOOR_Y, W, 16);
    g.fillStyle = "#3f9435";
    for (let x = -this.groundOffset; x < W + 40; x += 40) {
      g.beginPath();
      g.moveTo(x, FLOOR_Y + 16);
      g.lineTo(x + 20, FLOOR_Y + 26);
      g.lineTo(x + 40, FLOOR_Y + 16);
      g.fill();
    }
    g.strokeStyle = "#2d6e27";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, FLOOR_Y + 1.5);
    g.lineTo(W, FLOOR_Y + 1.5);
    g.stroke();
    // dirt specks
    g.fillStyle = "#c39a55";
    for (let x = -this.groundOffset * 1; x < W + 40; x += 40) {
      g.fillRect(x + 8, FLOOR_Y + 44, 6, 4);
      g.fillRect(x + 26, FLOOR_Y + 62, 5, 3);
    }
  }
}

/* ------------------------------------------------------------- Particles */
class Particles {
  constructor() { this.list = []; }

  burst(x, y, color, n = 8, spread = 160) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(spread * 0.3, spread);
      this.list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), max: 0.7, color, r: rand(2, 5) });
    }
  }

  update(dt) {
    for (const p of this.list) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
      p.life -= dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(g) {
    for (const p of this.list) {
      g.globalAlpha = clamp(p.life / p.max, 0, 1);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}
