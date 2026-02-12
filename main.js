(() => {
  "use strict";

  const STORAGE_KEY = "gravityEaterHighScore";
  const STATE = {
    TITLE: "TITLE",
    PLAY: "PLAY",
    PAUSE: "PAUSE",
    GAME_OVER: "GAME OVER",
  };

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const rand = (min, max) => Math.random() * (max - min) + min;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

      this.pointer = { x: 0, y: 0 };
      this.state = STATE.TITLE;
      this.time = 0;
      this.lastTime = 0;

      this.score = 0;
      this.highScore = this.loadHighScore();
      this.combo = 1;
      this.comboTimer = 0;
      this.comboWindow = 0.6;

      this.foods = [];
      this.hazards = [];
      this.maxFoods = 80;
      this.maxHazards = 20;
      this.foodSpawnAccumulator = 0;
      this.hazardSpawnAccumulator = 0;

      this.player = this.createPlayer();

      this.bindEvents();
      this.resize();
      this.lastTime = performance.now();
      requestAnimationFrame((ts) => this.loop(ts));
    }

    createPlayer() {
      const p = {
        pos: { x: this.canvas.width / (2 * this.dpr), y: this.canvas.height / (2 * this.dpr) },
        vel: { x: 0, y: 0 },
        mass: 14,
        radius: 16,
        gravityStrength: 350,
        pullRadius: 250,
        moveAccel: 700,
        maxSpeed: 420,
      };
      this.recalcPlayerDerived(p);
      return p;
    }

    recalcPlayerDerived(p) {
      // 成長は緩やかに。暴れないように上限を設ける。
      p.radius = clamp(10 + Math.sqrt(p.mass) * 1.8, 12, 100);
      p.gravityStrength = clamp(260 + p.mass * 24, 250, 3000);
      p.pullRadius = clamp(170 + Math.sqrt(p.mass) * 42, 160, 600);
      p.maxSpeed = clamp(430 - Math.sqrt(p.mass) * 7, 250, 430);
    }

    bindEvents() {
      window.addEventListener("resize", () => this.resize());

      window.addEventListener("mousemove", (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.x = e.clientX - rect.left;
        this.pointer.y = e.clientY - rect.top;
      });

      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" || e.key.toLowerCase() === "p") {
          if (this.state === STATE.PLAY) {
            this.state = STATE.PAUSE;
          } else if (this.state === STATE.PAUSE) {
            this.state = STATE.PLAY;
          }
          return;
        }

        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.handlePrimaryAction();
        }
      });

      window.addEventListener("mousedown", () => this.handlePrimaryAction());
    }

    handlePrimaryAction() {
      if (this.state === STATE.TITLE || this.state === STATE.GAME_OVER) {
        this.startGame();
      }
    }

    startGame() {
      this.state = STATE.PLAY;
      this.time = 0;
      this.score = 0;
      this.combo = 1;
      this.comboTimer = 0;
      this.foodSpawnAccumulator = 0;
      this.hazardSpawnAccumulator = 0;
      this.foods.length = 0;
      this.hazards.length = 0;
      this.player = this.createPlayer();

      // 開始直後の密度を確保
      for (let i = 0; i < 22; i += 1) this.spawnFood(true);
      for (let i = 0; i < 1; i += 1) this.spawnHazard(true);
    }

    gameOver() {
      this.state = STATE.GAME_OVER;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem(STORAGE_KEY, String(this.highScore));
      }
    }

    loadHighScore() {
      const raw = localStorage.getItem(STORAGE_KEY);
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }

    resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;

      // ワールド座標は CSS ピクセル基準
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const cw = this.canvas.width / this.dpr;
      const ch = this.canvas.height / this.dpr;
      this.pointer.x = cw * 0.5;
      this.pointer.y = ch * 0.5;

      if (this.player) {
        this.player.pos.x = clamp(this.player.pos.x, 0, cw);
        this.player.pos.y = clamp(this.player.pos.y, 0, ch);
      }
    }

    spawnFood(initial = false) {
      if (this.foods.length >= this.maxFoods) return;
      const w = this.canvas.width / this.dpr;
      const h = this.canvas.height / this.dpr;
      const margin = initial ? 20 : 0;
      const radius = rand(2.5, 5.4);
      const mass = radius * rand(0.8, 1.6);
      const speedBase = this.baseSpeed();

      this.foods.push({
        pos: { x: rand(margin, w - margin), y: rand(margin, h - margin) },
        vel: { x: rand(-1, 1) * speedBase * rand(0.3, 0.9), y: rand(-1, 1) * speedBase * rand(0.3, 0.9) },
        radius,
        mass,
      });
    }

    spawnHazard(initial = false) {
      if (this.hazards.length >= this.maxHazards) return;
      const w = this.canvas.width / this.dpr;
      const h = this.canvas.height / this.dpr;
      const edge = Math.floor(rand(0, 4));
      let x = 0;
      let y = 0;
      if (edge === 0) {
        x = -30;
        y = rand(0, h);
      } else if (edge === 1) {
        x = w + 30;
        y = rand(0, h);
      } else if (edge === 2) {
        x = rand(0, w);
        y = -30;
      } else {
        x = rand(0, w);
        y = h + 30;
      }

      const toCenterX = w * 0.5 - x;
      const toCenterY = h * 0.5 - y;
      const len = Math.hypot(toCenterX, toCenterY) || 1;
      const nx = toCenterX / len;
      const ny = toCenterY / len;
      const level = this.difficultyLevel();
      const speed = rand(36, 75) + level * 8 + (initial ? 0 : rand(0, 15));

      this.hazards.push({
        pos: { x, y },
        vel: { x: nx * speed + rand(-20, 20), y: ny * speed + rand(-20, 20) },
        radius: rand(20, 38) + level * 0.5,
      });
    }

    baseSpeed() {
      return 42 + this.difficultyLevel() * 5;
    }

    difficultyLevel() {
      // 1〜2分で体感的にきつくなる
      return Math.min(18, this.time * 0.11 + this.score * 0.0015);
    }

    update(dt) {
      dt = clamp(dt, 0, 0.033);
      if (this.state !== STATE.PLAY) return;

      this.time += dt;
      this.updateCombo(dt);

      const level = this.difficultyLevel();
      const foodRate = 8 + level * 0.8;
      const hazardRate = 0.15 + level * 0.07;

      this.foodSpawnAccumulator += foodRate * dt;
      this.hazardSpawnAccumulator += hazardRate * dt;

      while (this.foodSpawnAccumulator >= 1) {
        this.spawnFood(false);
        this.foodSpawnAccumulator -= 1;
      }

      while (this.hazardSpawnAccumulator >= 1) {
        this.spawnHazard(false);
        this.hazardSpawnAccumulator -= 1;
      }

      this.updatePlayer(dt);
      this.updateFoods(dt);
      this.updateHazards(dt);
      this.checkHazardCollision();
    }

    updateCombo(dt) {
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
      }
      if (this.comboTimer <= 0) {
        this.combo = 1;
      }
    }

    updatePlayer(dt) {
      const p = this.player;
      const toX = this.pointer.x - p.pos.x;
      const toY = this.pointer.y - p.pos.y;
      const dist = Math.hypot(toX, toY);
      const nx = dist > 0.0001 ? toX / dist : 0;
      const ny = dist > 0.0001 ? toY / dist : 0;

      const accel = p.moveAccel * clamp(dist / 180, 0.2, 1);
      p.vel.x += nx * accel * dt;
      p.vel.y += ny * accel * dt;

      const speed = Math.hypot(p.vel.x, p.vel.y);
      if (speed > p.maxSpeed) {
        const s = p.maxSpeed / (speed || 1);
        p.vel.x *= s;
        p.vel.y *= s;
      }

      // 軽い減衰で操作感を安定化
      p.vel.x *= 0.995;
      p.vel.y *= 0.995;

      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;

      const w = this.canvas.width / this.dpr;
      const h = this.canvas.height / this.dpr;

      if (p.pos.x < p.radius) {
        p.pos.x = p.radius;
        p.vel.x *= -0.35;
      } else if (p.pos.x > w - p.radius) {
        p.pos.x = w - p.radius;
        p.vel.x *= -0.35;
      }

      if (p.pos.y < p.radius) {
        p.pos.y = p.radius;
        p.vel.y *= -0.35;
      } else if (p.pos.y > h - p.radius) {
        p.pos.y = h - p.radius;
        p.vel.y *= -0.35;
      }
    }

    updateFoods(dt) {
      const p = this.player;
      const eps = 40;
      const maxAccel = 1100;
      const maxSpeed = 520;
      const captureScale = 1.25;
      const w = this.canvas.width / this.dpr;
      const h = this.canvas.height / this.dpr;

      for (let i = this.foods.length - 1; i >= 0; i -= 1) {
        const f = this.foods[i];
        const dx = p.pos.x - f.pos.x;
        const dy = p.pos.y - f.pos.y;
        const d = Math.hypot(dx, dy);

        if (d < p.pullRadius && d > 0.001) {
          const dirX = dx / d;
          const dirY = dy / d;
          const accel = clamp((p.gravityStrength * p.mass) / (d * d + eps), 0, maxAccel);
          f.vel.x += dirX * accel * dt;
          f.vel.y += dirY * accel * dt;
        }

        const spd = Math.hypot(f.vel.x, f.vel.y);
        if (spd > maxSpeed) {
          const s = maxSpeed / (spd || 1);
          f.vel.x *= s;
          f.vel.y *= s;
        }

        f.pos.x += f.vel.x * dt;
        f.pos.y += f.vel.y * dt;

        if (f.pos.x < f.radius) {
          f.pos.x = f.radius;
          f.vel.x *= -0.7;
        } else if (f.pos.x > w - f.radius) {
          f.pos.x = w - f.radius;
          f.vel.x *= -0.7;
        }

        if (f.pos.y < f.radius) {
          f.pos.y = f.radius;
          f.vel.y *= -0.7;
        } else if (f.pos.y > h - f.radius) {
          f.pos.y = h - f.radius;
          f.vel.y *= -0.7;
        }

        if (d < p.radius + f.radius * captureScale) {
          this.consumeFood(i);
        }
      }
    }

    consumeFood(index) {
      const f = this.foods[index];
      if (!f) return;

      this.foods.splice(index, 1);

      if (this.comboTimer > 0) {
        this.combo = clamp(this.combo + 1, 1, 8);
      } else {
        this.combo = 1;
      }
      this.comboTimer = this.comboWindow;

      const gain = Math.floor(f.mass * 10 * (1 + (this.combo - 1) * 0.35));
      this.score += gain;
      this.player.mass += f.mass * 0.65;
      this.recalcPlayerDerived(this.player);
    }

    updateHazards(dt) {
      const w = this.canvas.width / this.dpr;
      const h = this.canvas.height / this.dpr;

      for (let i = this.hazards.length - 1; i >= 0; i -= 1) {
        const hz = this.hazards[i];
        hz.pos.x += hz.vel.x * dt;
        hz.pos.y += hz.vel.y * dt;

        const outside = hz.pos.x < -120 || hz.pos.x > w + 120 || hz.pos.y < -120 || hz.pos.y > h + 120;
        if (outside) {
          this.hazards.splice(i, 1);
        }
      }
    }

    checkHazardCollision() {
      const p = this.player;
      for (const hz of this.hazards) {
        const dx = hz.pos.x - p.pos.x;
        const dy = hz.pos.y - p.pos.y;
        const d = Math.hypot(dx, dy);
        if (d < hz.radius + p.radius * 0.75 && hz.radius > p.radius * 1.1) {
          this.gameOver();
          return;
        }
      }
    }

    draw() {
      const ctx = this.ctx;
      const w = this.canvas.width / this.dpr;
      const h = this.canvas.height / this.dpr;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#070a12";
      ctx.fillRect(0, 0, w, h);

      this.drawFoods(ctx);
      this.drawHazards(ctx);
      this.drawPlayer(ctx);
      this.drawUI(ctx, w, h);
    }

    drawPlayer(ctx) {
      const p = this.player;
      const ringRadius = p.radius + 5 + Math.sin(this.time * 6) * 1.3;

      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(110, 145, 255, 0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.pos.x - p.radius * 0.35, p.pos.y - p.radius * 0.35, p.radius * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fill();
    }

    drawFoods(ctx) {
      ctx.fillStyle = "#94ffa6";
      for (const f of this.foods) {
        ctx.beginPath();
        ctx.arc(f.pos.x, f.pos.y, f.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawHazards(ctx) {
      for (const hz of this.hazards) {
        ctx.beginPath();
        ctx.arc(hz.pos.x, hz.pos.y, hz.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#f26a6a";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(hz.pos.x, hz.pos.y, hz.radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(242,106,106,0.45)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    drawUI(ctx, w, h) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "600 18px Segoe UI, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`Score: ${this.score}`, 20, 30);
      ctx.fillText(`Mass: ${this.player.mass.toFixed(1)}`, 20, 56);
      ctx.fillText(`Combo: x${this.combo}`, 20, 82);
      ctx.fillText(`High Score: ${this.highScore}`, 20, 108);
      ctx.fillText(`State: ${this.state}`, 20, 134);

      if (this.state === STATE.TITLE) {
        this.drawCenterText(ctx, w, h, "GRAVITY EATER", "クリック / Enter / Space で開始");
      } else if (this.state === STATE.PAUSE) {
        this.drawCenterText(ctx, w, h, "PAUSED", "Esc または P で再開");
      } else if (this.state === STATE.GAME_OVER) {
        const hsLine = this.score >= this.highScore ? "NEW HIGH SCORE!" : `High Score: ${this.highScore}`;
        this.drawCenterText(ctx, w, h, "GAME OVER", `Score: ${this.score}  /  ${hsLine}\nクリック or Enterでリトライ`);
      }
    }

    drawCenterText(ctx, w, h, title, sub) {
      ctx.save();
      ctx.textAlign = "center";

      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(w * 0.15, h * 0.35, w * 0.7, h * 0.28);

      ctx.fillStyle = "#fff";
      ctx.font = "700 44px Segoe UI, sans-serif";
      ctx.fillText(title, w * 0.5, h * 0.45);

      ctx.font = "500 20px Segoe UI, sans-serif";
      const lines = sub.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        ctx.fillText(lines[i], w * 0.5, h * 0.53 + i * 30);
      }
      ctx.restore();
    }

    loop(timestamp) {
      const dt = Math.max(0, (timestamp - this.lastTime) / 1000);
      this.lastTime = timestamp;

      this.update(dt);
      this.draw();

      requestAnimationFrame((ts) => this.loop(ts));
    }
  }

  const canvas = document.getElementById("gameCanvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element not found");
  }
  new Game(canvas);
})();
