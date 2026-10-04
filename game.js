(() => {
  "use strict";

  // =========================================================
  // Matter.js / poly-decomp
  // =========================================================

  if (window.decomp && window.Matter) {
    Matter.Common.setDecomp(window.decomp);
  }

  if (!window.Matter) {
    console.error("Matter.js が読み込まれていません。");
    return;
  }

  // =========================================================
  // Supabase
  // =========================================================

  if (!window.supabase) {
    console.error("Supabase JS が読み込まれていません。");
    return;
  }

  const SUPABASE_URL_VALUE = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY_VALUE = window.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL_VALUE || !SUPABASE_ANON_KEY_VALUE) {
    console.error("Supabase設定がありません。config.jsを確認してください。", {
      SUPABASE_URL: SUPABASE_URL_VALUE,
      SUPABASE_ANON_KEY:
        SUPABASE_ANON_KEY_VALUE ? "設定あり" : "設定なし"
    });

    alert(
      "Supabaseの設定が読み込めません。\n" +
      "config.js の内容を確認してください。"
    );

    return;
  }

  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL_VALUE,
    SUPABASE_ANON_KEY_VALUE
  );

  // =========================================================
  // Utility
  // =========================================================

  const $ = (id) => document.getElementById(id);

  function statusText(text) {
    const el = $("statusText");
    if (el) {
      el.textContent = text;
    }
    console.log("[STATUS]", text);
  }

  function show(id) {
    const screens = [
      "menu",
      "room",
      "draw",
      "game",
      "result"
    ];

    screens.forEach((name) => {
      const el = $(name);
      if (!el) return;

      el.style.display = name === id ? "" : "none";
    });
  }

  function setText(id, value) {
    const el = $(id);
    if (el) {
      el.textContent = value;
    }
  }

  // =========================================================
  // State
  // =========================================================

  const state = {
    playerId:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),

    host: false,

    roomCode: null,

    channel: null,

    ready: false,

    running: false,

    drawings: {
      puck: null,
      mallet: null
    },

    opponent: null,

    game: null
  };

  // =========================================================
  // Room code
  // =========================================================

  function uniqueCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let result = "";

    for (let i = 0; i < 6; i++) {
      result += chars[
        Math.floor(Math.random() * chars.length)
      ];
    }

    return result;
  }

  // =========================================================
  // Supabase messaging
  // =========================================================

  function send(type, data = {}) {
    if (!state.channel) {
      console.warn("Supabase channel がありません。");
      return;
    }

    try {
      state.channel.send({
        type: "broadcast",
        event: type,
        payload: {
          from: state.playerId,
          ...data
        }
      });
    } catch (err) {
      console.error("送信エラー:", err);
    }
  }

  function onSignal(payload) {
    if (!payload) return;

    const p = payload.payload || payload;

    if (!p) return;

    if (p.from === state.playerId) {
      return;
    }

    const eventName = payload.event;

    switch (eventName) {
      case "ready":
        onReady(p);
        break;

      case "start":
        startFromHost(p);
        break;

      case "state":
        onGameState(p);
        break;

      case "input":
        onInput(p);
        break;

      case "reset":
        resetRound(p);
        break;

      case "finish":
        onFinish(p);
        break;

      default:
        break;
    }
  }

  // =========================================================
  // Supabase room connection
  // =========================================================

  async function joinChannel(code) {
    if (!code) {
      throw new Error("ルームコードがありません。");
    }

    if (state.channel) {
      try {
        await supabaseClient.removeChannel(state.channel);
      } catch (err) {
        console.warn("既存チャンネル削除エラー:", err);
      }

      state.channel = null;
    }

    const channelName = "air-hockey-" + code;

    console.log("Supabase channel:", channelName);

    const channel = supabaseClient.channel(channelName, {
      config: {
        broadcast: {
          self: false
        }
      }
    });

    state.channel = channel;

    const events = [
      "ready",
      "start",
      "state",
      "input",
      "reset",
      "finish"
    ];

    events.forEach((eventName) => {
      channel.on(
        "broadcast",
        { event: eventName },
        (payload) => {
          console.log("[RECV]", eventName, payload);
          onSignal(payload);
        }
      );
    });

    return new Promise((resolve, reject) => {
      let finished = false;

      const timeout = setTimeout(() => {
        if (finished) return;

        finished = true;

        reject(
          new Error(
            "Supabaseへの接続がタイムアウトしました。"
          )
        );
      }, 10000);

      channel.subscribe((status) => {
        console.log("Supabase:", status);

        if (status === "SUBSCRIBED") {
          if (finished) return;

          finished = true;
          clearTimeout(timeout);

          statusText("接続済み");

          resolve();
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          if (finished) return;

          finished = true;
          clearTimeout(timeout);

          reject(
            new Error(
              "Supabase接続エラー: " + status
            )
          );
        }
      });
    });
  }

  // =========================================================
  // Create room
  // =========================================================

  async function createRoom() {
    try {
      statusText("ルームを作成しています...");

      const code = uniqueCode();

      state.host = true;
      state.roomCode = code;
      state.ready = false;
      state.opponent = null;

      await joinChannel(code);

      setText("roomCode", code);

      show("room");

      statusText(
        "ルームを作成しました。相手の参加を待っています。"
      );

      console.log("ルーム作成成功:", code);
    } catch (err) {
      console.error("ルーム作成失敗:", err);

      state.host = false;
      state.roomCode = null;
      state.channel = null;

      statusText("ルーム作成に失敗しました。");

      alert(
        "ルームを作成できませんでした。\n\n" +
        err.message +
        "\n\n" +
        "Supabaseの設定とRealtimeを確認してください。"
      );
    }
  }

  // =========================================================
  // Join room
  // =========================================================

  async function joinRoom(code) {
    code = String(code || "")
      .trim()
      .toUpperCase();

    if (!code) {
      alert("ルームコードを入力してください。");
      return;
    }

    try {
      statusText("ルームに接続しています...");

      state.host = false;
      state.roomCode = code;
      state.ready = false;
      state.opponent = null;

      await joinChannel(code);

      setText("roomCode", code);

      show("room");

      statusText(
        "ルームに参加しました。"
      );

      console.log("ルーム参加成功:", code);
    } catch (err) {
      console.error("ルーム参加失敗:", err);

      state.roomCode = null;
      state.channel = null;

      statusText("ルームに参加できませんでした。");

      alert(
        "ルームに参加できませんでした。\n\n" +
        err.message
      );
    }
  }

  // =========================================================
  // Quick match
  // =========================================================

  async function quickMatch() {
    const code = window.prompt(
      "ルームコードを入力してください"
    );

    if (!code) return;

    await joinRoom(code);
  }

  // =========================================================
  // Ready
  // =========================================================

  function allDrawingsReady() {
    return (
      !!state.drawings.puck &&
      !!state.drawings.mallet
    );
  }

  function sendReady() {
    if (!state.channel) {
      alert("まだルームに接続していません。");
      return;
    }

    if (!allDrawingsReady()) {
      alert(
        "パックとマレットの絵を両方描いてください。"
      );
      return;
    }

    state.ready = true;

    send("ready", {
      drawings: state.drawings
    });

    statusText(
      "準備完了。相手を待っています。"
    );

    if (state.host && state.opponent?.ready) {
      startMatch();
    }
  }

  function onReady(p) {
    if (p.from === state.playerId) return;

    state.opponent = {
      ...(state.opponent || {}),
      ...p,
      ready: true
    };

    statusText(
      "相手が準備完了しました。"
    );

    if (
      state.host &&
      state.ready &&
      state.opponent.ready
    ) {
      startMatch();
    }
  }

  // =========================================================
  // Start match
  // =========================================================

  function startMatch() {
    if (!state.host) return;

    if (!state.ready) return;

    if (!state.opponent?.ready) return;

    const firstPuck =
      Math.random() < 0.5 ? 0 : 1;

    const drawings = {
      host: state.drawings,
      guest: state.opponent.drawings
    };

    send("start", {
      drawings,
      currentPuck: firstPuck
    });

    startGame(drawings, firstPuck);
  }

  function startFromHost(p) {
    state.opponent = {
      ...(state.opponent || {}),
      drawings: p.drawings.host
    };

    startGame(
      p.drawings,
      p.currentPuck
    );
  }

  function startGame(drawings, firstPuck) {
    if (!drawings) {
      console.error("drawings がありません。");
      return;
    }

    state.running = true;

    if (state.game) {
      try {
        state.game.destroy();
      } catch (err) {
        console.warn(err);
      }
    }

    state.game = new AirGame(
      drawings,
      state.host,
      firstPuck
    );

    show("game");

    statusText("ゲーム開始！");
  }

  // =========================================================
  // Network game state
  // =========================================================

  function onGameState(p) {
    if (state.host) return;

    if (!state.game) return;

    state.game.applyNetworkState(p);
  }

  function onInput(p) {
    if (!state.host) return;

    if (!state.running) return;

    if (!state.game) return;

    state.game.applyGuestInput(p);
  }

  // =========================================================
  // Reset round
  // =========================================================

  function resetRound(p) {
    if (!state.game) return;

    state.game.remoteReset(p);
  }

  // =========================================================
  // Finish
  // =========================================================

  function onFinish(p) {
    if (!state.game) return;

    state.game.remoteFinish(p);
  }

  // =========================================================
  // Drawing pad
  // =========================================================

  function setupPad(canvasId, type) {
    const canvas = $(canvasId);

    if (!canvas) {
      console.warn(
        "Canvasがありません:",
        canvasId
      );
      return;
    }

    const ctx = canvas.getContext("2d");

    let drawing = false;
    let points = [];

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();

      const dpr =
        window.devicePixelRatio || 1;

      const width =
        Math.max(1, Math.floor(rect.width * dpr));

      const height =
        Math.max(1, Math.floor(rect.height * dpr));

      if (
        canvas.width !== width ||
        canvas.height !== height
      ) {
        canvas.width = width;
        canvas.height = height;

        ctx.setTransform(
          dpr,
          0,
          0,
          dpr,
          0,
          0
        );
      }
    }

    resizeCanvas();

    window.addEventListener(
      "resize",
      resizeCanvas
    );

    function getPoint(e) {
      const rect =
        canvas.getBoundingClientRect();

      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }

    function drawPreview() {
      resizeCanvas();

      const rect =
        canvas.getBoundingClientRect();

      ctx.clearRect(
        0,
        0,
        rect.width,
        rect.height
      );

      if (points.length < 2) return;

      ctx.beginPath();

      ctx.moveTo(
        points[0].x,
        points[0].y
      );

      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(
          points[i].x,
          points[i].y
        );
      }

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.stroke();
    }

    function start(e) {
      e.preventDefault();

      drawing = true;
      points = [getPoint(e)];

      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
    }

    function move(e) {
      if (!drawing) return;

      e.preventDefault();

      points.push(getPoint(e));

      drawPreview();
    }

    function end(e) {
      if (!drawing) return;

      e.preventDefault();

      drawing = false;

      try {
        canvas.releasePointerCapture(
          e.pointerId
        );
      } catch (err) {}

      const polygon =
        normalizePolygon(points);

      if (polygon.length >= 3) {
        state.drawings[type] = polygon;
      }

      drawPreview();

      updateReadyUI();
    }

    canvas.addEventListener(
      "pointerdown",
      start
    );

    canvas.addEventListener(
      "pointermove",
      move
    );

    canvas.addEventListener(
      "pointerup",
      end
    );

    canvas.addEventListener(
      "pointercancel",
      end
    );

    canvas.addEventListener(
      "pointerleave",
      (e) => {
        if (drawing && e.buttons === 0) {
          end(e);
        }
      }
    );
  }

  function normalizePolygon(points) {
    if (!points || points.length < 3) {
      return null;
    }

    // 点を間引く
    const simplified = [];

    const minDistance = 4;

    for (const p of points) {
      const last =
        simplified[simplified.length - 1];

      if (!last) {
        simplified.push(p);
        continue;
      }

      const dx = p.x - last.x;
      const dy = p.y - last.y;

      if (
        Math.sqrt(dx * dx + dy * dy) >=
        minDistance
      ) {
        simplified.push(p);
      }
    }

    if (simplified.length < 3) {
      return null;
    }

    // 閉じる
    const first = simplified[0];
    const last =
      simplified[simplified.length - 1];

    if (
      Math.hypot(
        last.x - first.x,
        last.y - first.y
      ) > 10
    ) {
      simplified.push({
        x: first.x,
        y: first.y
      });
    }

    // 重心
    let cx = 0;
    let cy = 0;

    for (const p of simplified) {
      cx += p.x;
      cy += p.y;
    }

    cx /= simplified.length;
    cy /= simplified.length;

    let maxR = 0;

    for (const p of simplified) {
      maxR = Math.max(
        maxR,
        Math.hypot(
          p.x - cx,
          p.y - cy
        )
      );
    }

    if (maxR < 5) {
      return null;
    }

    const scale = 1 / maxR;

    return simplified.map((p) => ({
      x: (p.x - cx) * scale,
      y: (p.y - cy) * scale
    }));
  }

  function updateReadyUI() {
    const readyBtn = $("readyBtn");

    if (!readyBtn) return;

    const ok = allDrawingsReady();

    readyBtn.disabled = !ok;
  }

  // =========================================================
  // Air Game
  // =========================================================

  class AirGame {
    constructor(
      drawings,
      host,
      initialPuck
    ) {
      this.drawings = drawings;
      this.host = host;

      this.running = true;

      this.currentPuck =
        initialPuck === 0 ||
        initialPuck === 1
          ? initialPuck
          : 0;

      this.scores = [0, 0];

      // 0 = host / left
      // 1 = guest / right
      this.localSide = host ? 0 : 1;

      this.W = 960;
      this.H = 540;

      this.canvas = $("gameCanvas");

      if (!this.canvas) {
        throw new Error(
          "gameCanvas がありません。"
        );
      }

      this.ctx =
        this.canvas.getContext("2d");

      this.engine =
        Matter.Engine.create();

      this.world =
        this.engine.world;

      this.engine.gravity.x = 0;
      this.engine.gravity.y = 0;

      this.puck = null;

      this.mallets = [];

      this.goalW = 300;

      this.last =
        performance.now();

      this.lastSend = 0;

      this.lastInputSend = 0;

      this.roundPause = 0;

      this.resize();

      this.makeArena();

      this.makePuck();

      this.makeMallets();

      this.bindInput();

      this.updateScoreUI();

      requestAnimationFrame(
        (t) => this.loop(t)
      );
    }

    // -------------------------------------------------------
    // Resize
    // -------------------------------------------------------

    resize() {
      const rect =
        this.canvas.getBoundingClientRect();

      const dpr =
        window.devicePixelRatio || 1;

      const width =
        Math.max(
          1,
          Math.floor(rect.width * dpr)
        );

      const height =
        Math.max(
          1,
          Math.floor(rect.height * dpr)
        );

      this.canvas.width = width;
      this.canvas.height = height;

      this.ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );

      this.W =
        rect.width || 960;

      this.H =
        rect.height || 540;
    }

    // -------------------------------------------------------
    // Arena
    // -------------------------------------------------------

    makeArena() {
      const wall = {
        isStatic: true,
        restitution: 1,
        friction: 0,
        frictionStatic: 0,
        slop: 0
      };

      this.goalW = 300;

      const sideWallH =
        (this.H - this.goalW) / 2;

      const upperCenter =
        sideWallH / 2;

      const lowerCenter =
        this.H -
        sideWallH / 2;

      Matter.World.add(
        this.world,
        [
          Matter.Bodies.rectangle(
            this.W / 2,
            -10,
            this.W + 40,
            20,
            wall
          ),

          Matter.Bodies.rectangle(
            this.W / 2,
            this.H + 10,
            this.W + 40,
            20,
            wall
          ),

          // 左上
          Matter.Bodies.rectangle(
            -10,
            upperCenter,
            20,
            sideWallH,
            wall
          ),

          // 左下
          Matter.Bodies.rectangle(
            -10,
            lowerCenter,
            20,
            sideWallH,
            wall
          ),

          // 右上
          Matter.Bodies.rectangle(
            this.W + 10,
            upperCenter,
            20,
            sideWallH,
            wall
          ),

          // 右下
          Matter.Bodies.rectangle(
            this.W + 10,
            lowerCenter,
            20,
            sideWallH,
            wall
          )
        ]
      );
    }

    // -------------------------------------------------------
    // Polygon body
    // -------------------------------------------------------

    bodyFromDrawing(
      drawing,
      x,
      y,
      radius,
      options = {}
    ) {
      if (
        !drawing ||
        !Array.isArray(drawing) ||
        drawing.length < 3
      ) {
        return Matter.Bodies.circle(
          x,
          y,
          radius,
          options
        );
      }

      const scale = radius;

      const vertices =
        drawing.map((p) => ({
          x: p.x * scale,
          y: p.y * scale
        }));

      try {
        const body =
          Matter.Bodies.fromVertices(
            x,
            y,
            [vertices],
            {
              ...options,
              render: {
                visible: false
              }
            },
            true
          );

        if (body) {
          return body;
        }
      } catch (err) {
        console.warn(
          "fromVertices失敗:",
          err
        );
      }

      return Matter.Bodies.circle(
        x,
        y,
        radius,
        options
      );
    }

    // -------------------------------------------------------
    // Puck
    // -------------------------------------------------------

    makePuck() {
      if (this.puck) {
        Matter.World.remove(
          this.world,
          this.puck
        );
      }

      const drawing =
        this.currentPuck === 0
          ? this.drawings.host?.puck
          : this.drawings.guest?.puck;

      this.puck =
        this.bodyFromDrawing(
          drawing,
          this.W / 2,
          this.H / 2,
          32,
          {
            restitution: 0.92,
            friction: 0,
            frictionAir: 0.002,
            density: 0.002
          }
        );

      Matter.World.add(
        this.world,
        this.puck
      );
    }

    // -------------------------------------------------------
    // Mallets
    // -------------------------------------------------------

    makeMallets() {
      const hostDrawing =
        this.drawings.host?.mallet;

      const guestDrawing =
        this.drawings.guest?.mallet;

      const malletOptions = {
        isStatic: true,
        restitution: 0.85,
        friction: 0,
        frictionStatic: 0
      };

      const hostMallet =
        this.bodyFromDrawing(
          hostDrawing,
          this.W * 0.25,
          this.H * 0.5,
          48,
          malletOptions
        );

      const guestMallet =
        this.bodyFromDrawing(
          guestDrawing,
          this.W * 0.75,
          this.H * 0.5,
          48,
          malletOptions
        );

      this.mallets = [
        hostMallet,
        guestMallet
      ];

      Matter.World.add(
        this.world,
        this.mallets
      );
    }

    // -------------------------------------------------------
    // Reset puck
    // -------------------------------------------------------

    resetPuck(nextPlayer) {
      this.currentPuck =
        nextPlayer === 0 ||
        nextPlayer === 1
          ? nextPlayer
          : this.currentPuck;

      this.makePuck();

      Matter.Body.setPosition(
        this.puck,
        {
          x: this.W / 2,
          y: this.H / 2
        }
      );

      Matter.Body.setVelocity(
        this.puck,
        {
          x:
            this.currentPuck === 0
              ? 5
              : -5,
          y:
            (Math.random() - 0.5) *
            4
        }
      );

      Matter.Body.setAngularVelocity(
        this.puck,
        0
      );

      this.roundPause =
        performance.now() + 900;
    }

    // -------------------------------------------------------
    // Score
    // -------------------------------------------------------

    score(side) {
      if (!this.running) return;

      this.scores[side]++;

      this.updateScoreUI();

      if (this.scores[side] >= 5) {
        this.finish(side);
        return;
      }

      // 次の得点後はパックの形を交代
      const nextPuck =
        this.currentPuck === 0
          ? 1
          : 0;

      this.resetPuck(nextPuck);

      if (this.host) {
        send("reset", {
          scores: [
            this.scores[0],
            this.scores[1]
          ],
          currentPuck: nextPuck
        });
      }
    }

    // -------------------------------------------------------
    // Finish
    // -------------------------------------------------------

    finish(winner) {
      if (!this.running) return;

      this.running = false;

      state.running = false;

      if (this.host) {
        send("finish", {
          scores: [
            this.scores[0],
            this.scores[1]
          ],
          winner
        });
      }

      this.showResult(winner);
    }

    remoteFinish(p) {
      if (!this.running) return;

      this.scores =
        Array.isArray(p.scores)
          ? [
              p.scores[0],
              p.scores[1]
            ]
          : this.scores;

      this.updateScoreUI();

      this.running = false;

      state.running = false;

      this.showResult(
        p.winner
      );
    }

    showResult(winner) {
      const localWin =
        winner === this.localSide;

      setText(
        "resultText",
        localWin
          ? "YOU WIN!"
          : "YOU LOSE!"
      );

      setText(
        "finalScore",
        `${this.scores[0]} - ${this.scores[1]}`
      );

      show("result");
    }

    // -------------------------------------------------------
    // Remote reset
    // -------------------------------------------------------

    remoteReset(p) {
      if (!p) return;

      if (Array.isArray(p.scores)) {
        this.scores = [
          p.scores[0],
          p.scores[1]
        ];
      }

      this.currentPuck =
        p.currentPuck === 0 ||
        p.currentPuck === 1
          ? p.currentPuck
          : this.currentPuck;

      this.updateScoreUI();

      this.resetPuck(
        this.currentPuck
      );
    }

    // -------------------------------------------------------
    // Guest input
    // -------------------------------------------------------

    applyGuestInput(p) {
      if (!this.host) return;

      if (!p.position) return;

      if (!this.mallets[1]) return;

      const x =
        Math.max(
          this.W / 2 + 40,
          Math.min(
            this.W - 40,
            p.position.x
          )
        );

      const y =
        Math.max(
          55,
          Math.min(
            this.H - 55,
            p.position.y
          )
        );

      Matter.Body.setPosition(
        this.mallets[1],
        {
          x,
          y
        }
      );

      Matter.Body.setVelocity(
        this.mallets[1],
        {
          x: 0,
          y: 0
        }
      );
    }

    // -------------------------------------------------------
    // Network state
    // -------------------------------------------------------

    applyNetworkState(p) {
      if (!this.puck) return;

      if (p.puck?.pos) {
        Matter.Body.setPosition(
          this.puck,
          {
            x: p.puck.pos.x,
            y: p.puck.pos.y
          }
        );
      }

      if (p.puck?.vel) {
        Matter.Body.setVelocity(
          this.puck,
          {
            x: p.puck.vel.x,
            y: p.puck.vel.y
          }
        );
      }

      if (
        typeof p.puck?.angle ===
        "number"
      ) {
        Matter.Body.setAngle(
          this.puck,
          p.puck.angle
        );
      }

      if (Array.isArray(p.mallets)) {
        p.mallets.forEach(
          (m, i) => {
            if (
              i === this.localSide
            ) {
              return;
            }

            if (!this.mallets[i]) {
              return;
            }

            Matter.Body.setPosition(
              this.mallets[i],
              {
                x: m.x,
                y: m.y
              }
            );
          }
        );
      }

      if (Array.isArray(p.scores)) {
        this.scores = [
          p.scores[0],
          p.scores[1]
        ];

        this.updateScoreUI();
      }
    }

    // -------------------------------------------------------
    // Input
    // -------------------------------------------------------

    bindInput() {
      let dragging = false;

      const canvas = this.canvas;

      const getPoint = (e) => {
        const rect =
          canvas.getBoundingClientRect();

        return {
          x:
            e.clientX -
            rect.left,

          y:
            e.clientY -
            rect.top
        };
      };

      const moveMallet = (e) => {
        if (!dragging) return;

        e.preventDefault();

        const p = getPoint(e);

        const index =
          this.localSide;

        if (!this.mallets[index]) {
          return;
        }

        let x = p.x;
        let y = p.y;

        if (index === 0) {
          x =
            Math.max(
              40,
              Math.min(
                this.W / 2 - 40,
                x
              )
            );
        } else {
          x =
            Math.max(
              this.W / 2 + 40,
              Math.min(
                this.W - 40,
                x
              )
            );
        }

        y =
          Math.max(
            55,
            Math.min(
              this.H - 55,
              y
            )
          );

        if (this.host) {
          Matter.Body.setPosition(
            this.mallets[index],
            { x, y }
          );

          Matter.Body.setVelocity(
            this.mallets[index],
            { x: 0, y: 0 }
          );
        } else {
          const now =
            performance.now();

          if (
            now -
              this.lastInputSend >
            15
          ) {
            send("input", {
              position: {
                x,
                y
              }
            });

            this.lastInputSend = now;
          }

          // 自分の画面でも動かす
          Matter.Body.setPosition(
            this.mallets[index],
            { x, y }
          );

          Matter.Body.setVelocity(
            this.mallets[index],
            { x: 0, y: 0 }
          );
        }
      };

      const start = (e) => {
        e.preventDefault();

        dragging = true;

        try {
          canvas.setPointerCapture(
            e.pointerId
          );
        } catch (err) {}

        moveMallet(e);
      };

      const end = (e) => {
        dragging = false;

        try {
          canvas.releasePointerCapture(
            e.pointerId
          );
        } catch (err) {}
      };

      canvas.addEventListener(
        "pointerdown",
        start
      );

      canvas.addEventListener(
        "pointermove",
        moveMallet
      );

      canvas.addEventListener(
        "pointerup",
        end
      );

      canvas.addEventListener(
        "pointercancel",
        end
      );

      window.addEventListener(
        "resize",
        () => this.resize()
      );
    }

    // -------------------------------------------------------
    // Keep puck inside
    // -------------------------------------------------------

    keepPuckInside() {
      if (!this.puck) return;

      const x =
        this.puck.position.x;

      const y =
        this.puck.position.y;

      const goalTop =
        this.H / 2 -
        this.goalW / 2;

      const goalBottom =
        this.H / 2 +
        this.goalW / 2;

      // ゴール部分は通過可能
      const inGoal =
        y > goalTop &&
        y < goalBottom;

      if (
        !inGoal &&
        x < 28
      ) {
        Matter.Body.setPosition(
          this.puck,
          {
            x: 30,
            y
          }
        );

        Matter.Body.setVelocity(
          this.puck,
          {
            x:
              Math.abs(
                this.puck.velocity.x
              ),
            y:
              this.puck.velocity.y
          }
        );
      }

      if (
        !inGoal &&
        x > this.W - 28
      ) {
        Matter.Body.setPosition(
          this.puck,
          {
            x: this.W - 30,
            y
          }
        );

        Matter.Body.setVelocity(
          this.puck,
          {
            x:
              -Math.abs(
                this.puck.velocity.x
              ),
            y:
              this.puck.velocity.y
          }
        );
      }

      if (y < 28) {
        Matter.Body.setPosition(
          this.puck,
          {
            x,
            y: 30
          }
        );

        Matter.Body.setVelocity(
          this.puck,
          {
            x:
              this.puck.velocity.x,
            y:
              Math.abs(
                this.puck.velocity.y
              )
          }
        );
      }

      if (y > this.H - 28) {
        Matter.Body.setPosition(
          this.puck,
          {
            x,
            y: this.H - 30
          }
        );

        Matter.Body.setVelocity(
          this.puck,
          {
            x:
              this.puck.velocity.x,
            y:
              -Math.abs(
                this.puck.velocity.y
              )
          }
        );
      }
    }

    // -------------------------------------------------------
    // Speed limit
    // -------------------------------------------------------

    limitPuckSpeed() {
      if (!this.puck) return;

      const vx =
        this.puck.velocity.x;

      const vy =
        this.puck.velocity.y;

      const speed =
        Math.hypot(vx, vy);

      const maxSpeed = 15;

      if (speed > maxSpeed) {
        const scale =
          maxSpeed / speed;

        Matter.Body.setVelocity(
          this.puck,
          {
            x: vx * scale,
            y: vy * scale
          }
        );
      }

      if (
        speed > 0 &&
        speed < 1.2
      ) {
        const scale =
          1.2 / speed;

        Matter.Body.setVelocity(
          this.puck,
          {
            x: vx * scale,
            y: vy * scale
          }
        );
      }
    }

    // -------------------------------------------------------
    // Score UI
    // -------------------------------------------------------

    updateScoreUI() {
      setText(
        "hostScore",
        this.scores[0]
      );

      setText(
        "guestScore",
        this.scores[1]
      );

      setText(
        "scoreLeft",
        this.scores[0]
      );

      setText(
        "scoreRight",
        this.scores[1]
      );
    }

    // -------------------------------------------------------
    // Main loop
    // -------------------------------------------------------

    loop(t) {
      if (!this.running) {
        return;
      }

      const dt =
        Math.min(
          16.667,
          Math.max(
            0,
            t - this.last
          )
        );

      this.last = t;

      if (this.host) {
        if (
          !this.roundPause ||
          t > this.roundPause
        ) {
          Matter.Engine.update(
            this.engine,
            dt
          );
        }

        const x =
          this.puck.position.x;

        const y =
          this.puck.position.y;

        const goalTop =
          this.H / 2 -
          this.goalW / 2;

        const goalBottom =
          this.H / 2 +
          this.goalW / 2;

        if (
          x < 25 &&
          y > goalTop &&
          y < goalBottom
        ) {
          this.score(1);
        } else if (
          x > this.W - 25 &&
          y > goalTop &&
          y < goalBottom
        ) {
          this.score(0);
        }

        if (this.running) {
          this.keepPuckInside();
          this.limitPuckSpeed();
        }

        if (
          t - this.lastSend >
          25
        ) {
          send("state", {
            puck: {
              pos: {
                x:
                  this.puck.position.x,
                y:
                  this.puck.position.y
              },

              vel: {
                x:
                  this.puck.velocity.x,
                y:
                  this.puck.velocity.y
              },

              angle:
                this.puck.angle
            },

            mallets:
              this.mallets.map(
                (m) => ({
                  x:
                    m.position.x,
                  y:
                    m.position.y
                })
              ),

            scores: [
              this.scores[0],
              this.scores[1]
            ]
          });

          this.lastSend = t;
        }
      }

      this.draw();

      requestAnimationFrame(
        (tt) => this.loop(tt)
      );
    }

    // -------------------------------------------------------
    // Drawing
    // -------------------------------------------------------

    draw() {
      const ctx = this.ctx;

      const W = this.W;
      const H = this.H;

      ctx.clearRect(
        0,
        0,
        W,
        H
      );

      // 背景
      ctx.fillStyle = "#10131a";

      ctx.fillRect(
        0,
        0,
        W,
        H
      );

      // 外枠
      ctx.strokeStyle =
        "#ffffff";

      ctx.lineWidth = 4;

      ctx.strokeRect(
        2,
        2,
        W - 4,
        H - 4
      );

      // センターライン
      ctx.beginPath();

      ctx.moveTo(
        W / 2,
        0
      );

      ctx.lineTo(
        W / 2,
        H
      );

      ctx.strokeStyle =
        "rgba(255,255,255,0.25)";

      ctx.lineWidth = 2;

      ctx.stroke();

      // センターサークル
      ctx.beginPath();

      ctx.arc(
        W / 2,
        H / 2,
        80,
        0,
        Math.PI * 2
      );

      ctx.strokeStyle =
        "rgba(255,255,255,0.25)";

      ctx.stroke();

      // ゴール
      const goalTop =
        H / 2 -
        this.goalW / 2;

      const goalBottom =
        H / 2 +
        this.goalW / 2;

      ctx.strokeStyle =
        "rgba(255,255,255,0.5)";

      ctx.beginPath();

      ctx.moveTo(
        0,
        goalTop
      );

      ctx.lineTo(
        0,
        goalBottom
      );

      ctx.moveTo(
        W,
        goalTop
      );

      ctx.lineTo(
        W,
        goalBottom
      );

      ctx.stroke();

      // マレット
      this.drawBody(
        this.mallets[0],
        this.drawings.host?.mallet,
        "#4da3ff"
      );

      this.drawBody(
        this.mallets[1],
        this.drawings.guest?.mallet,
        "#ff6688"
      );

      // パック
      const puckDrawing =
        this.currentPuck === 0
          ? this.drawings.host?.puck
          : this.drawings.guest?.puck;

      this.drawBody(
        this.puck,
        puckDrawing,
        "#ffd84d"
      );
    }

    drawBody(
      body,
      drawing,
      fallbackColor
    ) {
      if (!body) return;

      const ctx = this.ctx;

      ctx.save();

      ctx.translate(
        body.position.x,
        body.position.y
      );

      ctx.rotate(
        body.angle
      );

      ctx.beginPath();

      if (
        drawing &&
        Array.isArray(drawing) &&
        drawing.length >= 3
      ) {
        ctx.moveTo(
          drawing[0].x * 48,
          drawing[0].y * 48
        );

        for (
          let i = 1;
          i < drawing.length;
          i++
        ) {
          ctx.lineTo(
            drawing[i].x * 48,
            drawing[i].y * 48
          );
        }

        ctx.closePath();
      } else {
        ctx.arc(
          0,
          0,
          30,
          0,
          Math.PI * 2
        );
      }

      ctx.fillStyle =
        fallbackColor;

      ctx.fill();

      ctx.strokeStyle =
        "#ffffff";

      ctx.lineWidth = 2;

      ctx.stroke();

      ctx.restore();
    }

    // -------------------------------------------------------
    // Destroy
    // -------------------------------------------------------

    destroy() {
      this.running = false;

      try {
        Matter.World.clear(
          this.world,
          false
        );

        Matter.Engine.clear(
          this.engine
        );
      } catch (err) {
        console.warn(err);
      }
    }
  }

  // =========================================================
  // Buttons
  // =========================================================

  const createBtn =
    $("createRoomBtn");

  if (createBtn) {
    createBtn.addEventListener(
      "click",
      () => {
        createRoom();
      }
    );
  }

  const joinBtn =
    $("joinRoomBtn");

  if (joinBtn) {
    joinBtn.addEventListener(
      "click",
      () => {
        const input =
          $("roomInput");

        const code =
          input
            ? input.value
            : "";

        joinRoom(code);
      }
    );
  }

  const quickBtn =
    $("quickMatchBtn");

  if (quickBtn) {
    quickBtn.addEventListener(
      "click",
      () => {
        quickMatch();
      }
    );
  }

  const readyBtn =
    $("readyBtn");

  if (readyBtn) {
    readyBtn.addEventListener(
      "click",
      () => {
        sendReady();
      }
    );
  }

  // 結果画面から戻る
  const backBtn =
    $("backToMenuBtn");

  if (backBtn) {
    backBtn.addEventListener(
      "click",
      () => {
        if (state.channel) {
          try {
            supabaseClient.removeChannel(
              state.channel
            );
          } catch (err) {}
        }

        state.channel = null;
        state.roomCode = null;
        state.host = false;
        state.ready = false;
        state.running = false;
        state.opponent = null;

        if (state.game) {
          state.game.destroy();
          state.game = null;
        }

        show("menu");

        statusText("");
      }
    );
  }

  // =========================================================
  // Initial setup
  // =========================================================

  setupPad(
    "puckCanvas",
    "puck"
  );

  setupPad(
    "malletCanvas",
    "mallet"
  );

  updateReadyUI();

  show("menu");

  console.log(
    "★ game.js 読み込み完了"
  );

})();
