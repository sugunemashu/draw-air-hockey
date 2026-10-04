(() => {
  "use strict";

  // =========================================================
  // DRAW AIR HOCKEY
  // =========================================================

  // Matter.js
  if (!window.Matter) {
    alert("Matter.js が読み込まれていません。");
    return;
  }

  const {
    Engine,
    World,
    Bodies,
    Body,
    Events
  } = Matter;

  // poly-decomp
  if (window.decomp && Matter.Common) {
    Matter.Common.setDecomp(window.decomp);
  }

  // Supabase
  if (!window.supabase) {
    alert("Supabase JS が読み込まれていません。");
    return;
  }

  // ---------------------------------------------------------
  // Supabase設定
  // ---------------------------------------------------------

  const config = window.AIR_HOCKEY_CONFIG || {};

  const SUPABASE_URL =
    config.SUPABASE_URL ||
    window.SUPABASE_URL ||
    "";

  const SUPABASE_ANON_KEY =
    config.SUPABASE_ANON_KEY ||
    window.SUPABASE_ANON_KEY ||
    "";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Supabase設定がありません。");
    alert(
      "Supabaseの設定が読み込めません。\n" +
      "config.jsを確認してください。"
    );
    return;
  }

  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  // ---------------------------------------------------------
  // DOM
  // ---------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  const menu = $("menu");
  const room = $("room");
  const draw = $("draw");
  const gameScreen = $("game");
  const result = $("result");

  const statusTextEl = $("statusText");

  const createRoomBtn = $("createRoomBtn");
  const joinRoomBtn = $("joinRoomBtn");
  const quickMatchBtn = $("quickMatchBtn");

  const roomInput = $("roomInput");
  const roomCodeEl = $("roomCode");
  const roomStatusEl = $("roomStatus");

  const roomToDrawBtn = $("roomToDrawBtn");
  const roomReadyBtn = $("roomReadyBtn");
  const roomBackBtn = $("roomBackBtn");

  const puckCanvas = $("puckCanvas");
  const malletCanvas = $("malletCanvas");

  const readyBtn = $("readyBtn");
  const readyMsg = $("readyMsg");

  const gameCanvas = $("gameCanvas");

  const hostScoreEl = $("hostScore");
  const guestScoreEl = $("guestScore");

  const scoreLeftEl = $("scoreLeft");
  const scoreRightEl = $("scoreRight");

  const roundMsg = $("roundMsg");

  const resultText = $("resultText");
  const finalScore = $("finalScore");
  const backToMenuBtn = $("backToMenuBtn");

  // ---------------------------------------------------------
  // 画面切り替え
  // ---------------------------------------------------------

  function showScreen(name) {
    const screens = {
      menu,
      room,
      draw,
      game: gameScreen,
      result
    };

    Object.keys(screens).forEach((key) => {
      if (!screens[key]) return;
      screens[key].classList.toggle("hidden", key !== name);
      screens[key].style.display = key === name ? "" : "none";
    });
  }

  function setStatus(text) {
    if (statusTextEl) {
      statusTextEl.textContent = text;
    }
    console.log("[DRAW AIR HOCKEY]", text);
  }

  function setRoomStatus(text) {
    if (roomStatusEl) {
      roomStatusEl.textContent = text;
    }
  }

  // ---------------------------------------------------------
  // プレイヤー状態
  // ---------------------------------------------------------

  const state = {
    playerId:
      (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : "player-" + Math.random().toString(36).slice(2),

    host: false,
    roomCode: "",
    channel: null,

    connected: false,
    opponentConnected: false,

    localReady: false,
    opponentReady: false,

    localDrawings: {
      puck: null,
      mallet: null
    },

    opponentDrawings: {
      puck: null,
      mallet: null
    },

    game: null,

    hostScore: 0,
    guestScore: 0,

    running: false
  };

  // ---------------------------------------------------------
  // ルームコード
  // ---------------------------------------------------------

  function makeRoomCode() {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    for (let i = 0; i < 6; i++) {
      code += chars[
        Math.floor(Math.random() * chars.length)
      ];
    }

    return code;
  }

  // ---------------------------------------------------------
  // Supabase Realtime
  // ---------------------------------------------------------

  async function subscribeRoom(code) {
    if (state.channel) {
      try {
        await supabaseClient.removeChannel(state.channel);
      } catch (e) {
        console.warn(e);
      }

      state.channel = null;
    }

    const channelName = "draw-air-hockey-" + code;

    const channel = supabaseClient.channel(channelName, {
      config: {
        broadcast: {
          self: false
        }
      }
    });

    state.channel = channel;

    // -------------------------------------------------------
    // opponent join
    // -------------------------------------------------------

    channel.on(
      "broadcast",
      { event: "hello" },
      ({ payload }) => {
        if (!payload || payload.playerId === state.playerId) {
          return;
        }

        state.opponentConnected = true;

        setRoomStatus(
          "相手が参加しました。形を描いて準備してください。"
        );

        setStatus("相手が参加しました。");

        // 自分の存在を返す
        sendBroadcast("hello", {
          playerId: state.playerId,
          host: state.host
        });

        updateRoomButtons();
      }
    );

    // -------------------------------------------------------
    // ready
    // -------------------------------------------------------

    channel.on(
      "broadcast",
      { event: "ready" },
      ({ payload }) => {
        if (!payload || payload.playerId === state.playerId) {
          return;
        }

        state.opponentConnected = true;
        state.opponentReady = true;

        if (payload.drawings) {
          state.opponentDrawings = payload.drawings;
        }

        setRoomStatus(
          "相手の準備が完了しました。"
        );

        updateReadyMessage();

        // ホストならゲーム開始
        if (
          state.host &&
          state.localReady &&
          state.opponentReady
        ) {
          startOnlineGame();
        }
      }
    );

    // -------------------------------------------------------
    // start
    // -------------------------------------------------------

    channel.on(
      "broadcast",
      { event: "start" },
      ({ payload }) => {
        if (!payload) return;

        if (state.host) return;

        state.hostScore = payload.hostScore || 0;
        state.guestScore = payload.guestScore || 0;

        if (payload.hostDrawings) {
          state.opponentDrawings = payload.hostDrawings;
        }

        if (payload.guestDrawings) {
          state.localDrawings = payload.guestDrawings;
        }

        startLocalGame();
      }
    );

    // -------------------------------------------------------
    // physics state
    // -------------------------------------------------------

    channel.on(
      "broadcast",
      { event: "state" },
      ({ payload }) => {
        if (!payload || state.host || !state.game) {
          return;
        }

        state.game.receiveNetworkState(payload);
      }
    );

    // -------------------------------------------------------
    // guest input
    // -------------------------------------------------------

    channel.on(
      "broadcast",
      { event: "input" },
      ({ payload }) => {
        if (!payload || !state.host || !state.game) {
          return;
        }

        state.game.receiveGuestInput(payload);
      }
    );

    // -------------------------------------------------------
    // score
    // -------------------------------------------------------

    channel.on(
      "broadcast",
      { event: "score" },
      ({ payload }) => {
        if (!payload) return;

        state.hostScore = payload.hostScore || 0;
        state.guestScore = payload.guestScore || 0;

        updateScore();

        if (!state.host && state.game) {
          state.game.resetRound(payload.puck);
        }
      }
    );

    // -------------------------------------------------------
    // finish
    // -------------------------------------------------------

    channel.on(
      "broadcast",
      { event: "finish" },
      ({ payload }) => {
        if (!payload) return;

        state.hostScore = payload.hostScore || 0;
        state.guestScore = payload.guestScore || 0;

        updateScore();

        finishGame();
      }
    );

    // -------------------------------------------------------
    // subscribe
    // -------------------------------------------------------

    await new Promise((resolve, reject) => {
      let finished = false;

      const timer = setTimeout(() => {
        if (finished) return;

        finished = true;
        reject(
          new Error(
            "Supabaseへの接続がタイムアウトしました。"
          )
        );
      }, 10000);

      channel.subscribe((status) => {
        console.log("Supabase channel:", status);

        if (status === "SUBSCRIBED") {
          if (finished) return;

          finished = true;
          clearTimeout(timer);

          state.connected = true;

          resolve();
        }

        if (status === "CHANNEL_ERROR") {
          if (finished) return;

          finished = true;
          clearTimeout(timer);

          reject(
            new Error(
              "Supabase Realtimeへの接続に失敗しました。"
            )
          );
        }
      });
    });

    // 自分が入室したことを通知
    await sendBroadcast("hello", {
      playerId: state.playerId,
      host: state.host
    });
  }

  async function sendBroadcast(event, payload) {
    if (!state.channel) return;

    try {
      await state.channel.send({
        type: "broadcast",
        event,
        payload: {
          ...payload,
          playerId:
            payload && payload.playerId
              ? payload.playerId
              : state.playerId
        }
      });
    } catch (error) {
      console.error(
        "Broadcast error:",
        error
      );
    }
  }

  // ---------------------------------------------------------
  // ルーム作成
  // ---------------------------------------------------------

  async function createRoom() {
    try {
      setStatus("ルームを作成しています...");

      state.host = true;
      state.localReady = false;
      state.opponentReady = false;
      state.opponentConnected = false;

      const code = makeRoomCode();

      state.roomCode = code;

      await subscribeRoom(code);

      if (roomCodeEl) {
        roomCodeEl.textContent = code;
      }

      showScreen("room");

      setStatus(
        "ルームを作成しました。"
      );

      setRoomStatus(
        "相手の参加を待っています。"
      );

      updateRoomButtons();

    } catch (error) {
      console.error(error);

      state.host = false;
      state.roomCode = "";

      alert(
        "ルームを作成できませんでした。\n\n" +
        error.message
      );

      setStatus("接続エラー");
    }
  }

  // ---------------------------------------------------------
  // ルーム参加
  // ---------------------------------------------------------

  async function joinRoom(code) {
    code = String(code || "")
      .trim()
      .toUpperCase();

    if (!code) {
      alert("ルームコードを入力してください。");
      return;
    }

    if (code.length !== 6) {
      alert("ルームコードは6文字です。");
      return;
    }

    try {
      setStatus("ルームに参加しています...");

      state.host = false;
      state.localReady = false;
      state.opponentReady = false;
      state.opponentConnected = true;
      state.roomCode = code;

      await subscribeRoom(code);

      if (roomCodeEl) {
        roomCodeEl.textContent = code;
      }

      showScreen("room");

      setStatus(
        "ルームに参加しました。"
      );

      setRoomStatus(
        "形を描いて準備してください。"
      );

      updateRoomButtons();

    } catch (error) {
      console.error(error);

      state.roomCode = "";
      state.host = false;

      alert(
        "ルームに参加できませんでした。\n\n" +
        error.message
      );

      setStatus("接続エラー");
    }
  }

  // ---------------------------------------------------------
  // オンラインマッチング
  // ---------------------------------------------------------

  async function quickMatch() {
    const code = window.prompt(
      "友達から教えてもらった6桁のルームコードを入力してください。"
    );

    if (!code) return;

    await joinRoom(code);
  }

  // ---------------------------------------------------------
  // ルームUI
  // ---------------------------------------------------------

  function updateRoomButtons() {
    if (!roomToDrawBtn) return;

    // 自分だけでも形を描き始められる
    roomToDrawBtn.disabled = false;

    if (roomReadyBtn) {
      roomReadyBtn.style.display = "none";
    }

    if (roomBackBtn) {
      roomBackBtn.style.display = "";
    }
  }

  // ---------------------------------------------------------
  // 描画システム
  // ---------------------------------------------------------

  class DrawingPad {
    constructor(canvas, type) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.type = type;

      this.drawing = false;
      this.points = [];

      this.resize();

      canvas.addEventListener(
        "pointerdown",
        (e) => this.start(e)
      );

      canvas.addEventListener(
        "pointermove",
        (e) => this.move(e)
      );

      canvas.addEventListener(
        "pointerup",
        (e) => this.end(e)
      );

      canvas.addEventListener(
        "pointercancel",
        (e) => this.end(e)
      );

      canvas.addEventListener(
        "pointerleave",
        (e) => {
          if (this.drawing) {
            this.move(e);
          }
        }
      );

      this.drawGuide();
    }

    resize() {
      const rect =
        this.canvas.getBoundingClientRect();

      if (
        rect.width > 0 &&
        rect.height > 0
      ) {
        const dpr =
          window.devicePixelRatio || 1;

        this.canvas.width =
          Math.round(rect.width * dpr);

        this.canvas.height =
          Math.round(rect.height * dpr);

        this.ctx.setTransform(
          dpr,
          0,
          0,
          dpr,
          0,
          0
        );

        this.width = rect.width;
        this.height = rect.height;
      } else {
        this.width =
          this.canvas.clientWidth ||
          this.canvas.width;

        this.height =
          this.canvas.clientHeight ||
          this.canvas.height;
      }
    }

    getPoint(e) {
      const rect =
        this.canvas.getBoundingClientRect();

      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }

    start(e) {
      e.preventDefault();

      this.resize();

      this.drawing = true;
      this.points = [];

      const p = this.getPoint(e);

      this.points.push(p);

      try {
        this.canvas.setPointerCapture(
          e.pointerId
        );
      } catch (_) {}

      this.redraw();
    }

    move(e) {
      if (!this.drawing) return;

      e.preventDefault();

      const p = this.getPoint(e);

      const last =
        this.points[this.points.length - 1];

      if (
        !last ||
        Math.hypot(
          p.x - last.x,
          p.y - last.y
        ) >= 2
      ) {
        this.points.push(p);
        this.redraw();
      }
    }

    end(e) {
      if (!this.drawing) return;

      e.preventDefault();

      this.drawing = false;

      try {
        this.canvas.releasePointerCapture(
          e.pointerId
        );
      } catch (_) {}

      this.cleanPoints();
      this.redraw();

      updateReadyUI();
    }

    cleanPoints() {
      if (this.points.length < 3) {
        return;
      }

      // 閉じた形にする
      const first = this.points[0];
      const last =
        this.points[this.points.length - 1];

      const distance = Math.hypot(
        first.x - last.x,
        first.y - last.y
      );

      if (distance < 80) {
        this.points.push({
          x: first.x,
          y: first.y
        });
      }
    }

    clear() {
      this.points = [];
      this.drawing = false;
      this.drawGuide();
      updateReadyUI();
    }

    drawGuide() {
      const ctx = this.ctx;

      ctx.clearRect(
        0,
        0,
        this.width,
        this.height
      );

      ctx.save();

      ctx.strokeStyle =
        "rgba(255,255,255,0.12)";

      ctx.lineWidth = 1;

      ctx.setLineDash([5, 5]);

      ctx.strokeRect(
        10,
        10,
        this.width - 20,
        this.height - 20
      );

      ctx.restore();
    }

    redraw() {
      this.drawGuide();

      if (this.points.length === 0) {
        return;
      }

      const ctx = this.ctx;

      ctx.save();

      ctx.strokeStyle = "#ffffff";
      ctx.fillStyle =
        this.type === "puck"
          ? "rgba(80,180,255,0.35)"
          : "rgba(255,110,170,0.35)";

      ctx.lineWidth = 4;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.beginPath();

      this.points.forEach((p, i) => {
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      });

      if (this.points.length >= 3) {
        ctx.closePath();
        ctx.fill();
      }

      ctx.stroke();

      ctx.restore();
    }

    getNormalizedShape() {
      if (this.points.length < 3) {
        return null;
      }

      let points =
        this.points.slice();

      // 最後の閉じ点を除外
      if (points.length > 2) {
        const first = points[0];
        const last =
          points[points.length - 1];

        if (
          Math.hypot(
            first.x - last.x,
            first.y - last.y
          ) < 5
        ) {
          points = points.slice(0, -1);
        }
      }

      if (points.length < 3) {
        return null;
      }

      // 重複点除去
      const cleaned = [];

      for (const p of points) {
        const last =
          cleaned[cleaned.length - 1];

        if (
          !last ||
          Math.hypot(
            p.x - last.x,
            p.y - last.y
          ) >= 2
        ) {
          cleaned.push({
            x: p.x,
            y: p.y
          });
        }
      }

      points = cleaned;

      if (points.length < 3) {
        return null;
      }

      // 中心
      let cx = 0;
      let cy = 0;

      points.forEach((p) => {
        cx += p.x;
        cy += p.y;
      });

      cx /= points.length;
      cy /= points.length;

      // 最大サイズ
      let maxDistance = 0;

      points.forEach((p) => {
        maxDistance = Math.max(
          maxDistance,
          Math.hypot(
            p.x - cx,
            p.y - cy
          )
        );
      });

      if (maxDistance < 5) {
        return null;
      }

      // 最大半径を基準に正規化
      const targetSize =
        this.type === "puck"
          ? 28
          : 42;

      const scale =
        targetSize / maxDistance;

      return points.map((p) => ({
        x: (p.x - cx) * scale,
        y: (p.y - cy) * scale
      }));
    }
  }

  let puckPad = null;
  let malletPad = null;

  // ---------------------------------------------------------
  // 描画データ
  // ---------------------------------------------------------

  function setupDrawingPads() {
    if (!puckCanvas || !malletCanvas) {
      console.error(
        "描画用canvasが見つかりません。"
      );
      return;
    }

    if (!puckPad) {
      puckPad =
        new DrawingPad(
          puckCanvas,
          "puck"
        );
    }

    if (!malletPad) {
      malletPad =
        new DrawingPad(
          malletCanvas,
          "mallet"
        );
    }
  }

  function getDrawingData() {
    return {
      puck:
        puckPad
          ? puckPad.getNormalizedShape()
          : null,

      mallet:
        malletPad
          ? malletPad.getNormalizedShape()
          : null
    };
  }

  function updateReadyUI() {
    if (!readyBtn) return;

    const drawings =
      getDrawingData();

    const complete =
      !!drawings.puck &&
      !!drawings.mallet;

    readyBtn.disabled = !complete;

    if (!complete) {
      if (readyMsg) {
        readyMsg.textContent =
          "パックとマレットの両方を描いてください。";
      }
    } else {
      if (readyMsg) {
        readyMsg.textContent =
          "準備OK！「描き終わった！」を押してください。";
      }
    }
  }

  function updateReadyMessage() {
    if (!readyMsg) return;

    if (
      state.localReady &&
      state.opponentReady
    ) {
      readyMsg.textContent =
        "両プレイヤーの準備が完了しました。";
    } else if (state.localReady) {
      readyMsg.textContent =
        "準備完了。相手の準備を待っています。";
    }
  }

  // ---------------------------------------------------------
  // 準備完了
  // ---------------------------------------------------------

  async function setReady() {
    const drawings =
      getDrawingData();

    if (
      !drawings.puck ||
      !drawings.mallet
    ) {
      alert(
        "パックとマレットの両方を描いてください。"
      );
      return;
    }

    state.localDrawings =
      drawings;

    state.localReady = true;

    readyBtn.disabled = true;

    if (readyMsg) {
      readyMsg.textContent =
        "準備完了。相手を待っています...";
    }

    await sendBroadcast("ready", {
      playerId: state.playerId,
      drawings
    });

    if (
      state.host &&
      state.opponentReady
    ) {
      startOnlineGame();
    }
  }

  // ---------------------------------------------------------
  // オンラインゲーム開始
  // ---------------------------------------------------------

  async function startOnlineGame() {
    if (!state.host) return;

    if (
      !state.localDrawings.puck ||
      !state.localDrawings.mallet
    ) {
      return;
    }

    if (
      !state.opponentDrawings.puck ||
      !state.opponentDrawings.mallet
    ) {
      return;
    }

    state.hostScore = 0;
    state.guestScore = 0;

    updateScore();

    await sendBroadcast("start", {
      hostDrawings:
        state.localDrawings,

      guestDrawings:
        state.opponentDrawings,

      hostScore: 0,
      guestScore: 0
    });

    startLocalGame();
  }

  // ---------------------------------------------------------
  // ゲーム開始
  // ---------------------------------------------------------

  function startLocalGame() {
    if (state.game) {
      state.game.destroy();
      state.game = null;
    }

    showScreen("game");

    // Canvasサイズを確定させてから作成
    requestAnimationFrame(() => {
      state.game =
        new AirHockeyGame();

      state.running = true;

      if (roundMsg) {
        roundMsg.textContent =
          "START!";
      }

      setTimeout(() => {
        if (roundMsg) {
          roundMsg.textContent =
            "";
        }
      }, 1200);
    });
  }

  // ---------------------------------------------------------
  // スコア
  // ---------------------------------------------------------

  function updateScore() {
    if (hostScoreEl) {
      hostScoreEl.textContent =
        state.hostScore;
    }

    if (guestScoreEl) {
      guestScoreEl.textContent =
        state.guestScore;
    }

    if (scoreLeftEl) {
      scoreLeftEl.textContent =
        state.hostScore;
    }

    if (scoreRightEl) {
      scoreRightEl.textContent =
        state.guestScore;
    }
  }

  // ---------------------------------------------------------
  // 結果
  // ---------------------------------------------------------

  function finishGame() {
    state.running = false;

    if (state.game) {
      state.game.stop();
    }

    const myScore =
      state.host
        ? state.hostScore
        : state.guestScore;

    const opponentScore =
      state.host
        ? state.guestScore
        : state.hostScore;

    if (resultText) {
      if (myScore > opponentScore) {
        resultText.textContent =
          "YOU WIN!";
      } else if (
        myScore < opponentScore
      ) {
        resultText.textContent =
          "YOU LOSE";
      } else {
        resultText.textContent =
          "DRAW";
      }
    }

    if (finalScore) {
      finalScore.textContent =
        myScore +
        " - " +
        opponentScore;
    }

    showScreen("result");
  }

  // ---------------------------------------------------------
  // Air Hockey
  // ---------------------------------------------------------

  class AirHockeyGame {
    constructor() {
      this.canvas = gameCanvas;

      this.ctx =
        this.canvas.getContext("2d");

      this.engine =
        Engine.create();

      this.engine.gravity.x = 0;
      this.engine.gravity.y = 0;
      this.engine.gravity.scale = 0;

      this.world =
        this.engine.world;

      this.width = 900;
      this.height = 520;

      this.lastTime =
        performance.now();

      this.animationId = null;

      this.lastNetworkSend = 0;

      this.guestInput = {
        x: 700,
        y: 260
      };

      this.localMalletTarget = null;

      this.hostMallet = null;
      this.guestMallet = null;
      this.puck = null;

      this.wallThickness = 30;

      this.resizeCanvas();

      this.createWorld();

      this.bindInput();

      this.bindPhysics();

      this.loop();
    }

    // -------------------------------------------------------
    // Canvas
    // -------------------------------------------------------

    resizeCanvas() {
      const rect =
        this.canvas.getBoundingClientRect();

      let width =
        rect.width ||
        window.innerWidth;

      let height =
        rect.height ||
        Math.min(
          window.innerHeight * 0.65,
          600
        );

      if (width < 400) {
        width = 400;
      }

      if (height < 260) {
        height = 260;
      }

      const dpr =
        window.devicePixelRatio || 1;

      this.canvas.width =
        Math.round(width * dpr);

      this.canvas.height =
        Math.round(height * dpr);

      this.canvas.style.width =
        width + "px";

      this.canvas.style.height =
        height + "px";

      this.ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );

      this.width = width;
      this.height = height;
    }

    // -------------------------------------------------------
    // World
    // -------------------------------------------------------

    createWorld() {
      const w = this.width;
      const h = this.height;
      const t = this.wallThickness;

      // 壁
      this.topWall =
        Bodies.rectangle(
          w / 2,
          -t / 2,
          w,
          t,
          {
            isStatic: true,
            restitution: 1
          }
        );

      this.bottomWall =
        Bodies.rectangle(
          w / 2,
          h + t / 2,
          w,
          t,
          {
            isStatic: true,
            restitution: 1
          }
        );

      this.leftWall =
        Bodies.rectangle(
          -t / 2,
          h / 2,
          t,
          h,
          {
            isStatic: true,
            restitution: 1
          }
        );

      this.rightWall =
        Bodies.rectangle(
          w + t / 2,
          h / 2,
          t,
          h,
          {
            isStatic: true,
            restitution: 1
          }
        );

      World.add(
        this.world,
        [
          this.topWall,
          this.bottomWall,
          this.leftWall,
          this.rightWall
        ]
      );

      // ゴールライン位置
      this.goalWidth =
        Math.min(240, w * 0.28);

      // パック
      const puckShape =
        state.localDrawings.puck ||
        defaultPuckShape();

      this.puck =
        this.createShapeBody(
          puckShape,
          w / 2,
          h / 2,
          {
            density: 0.002,
            friction: 0.02,
            frictionAir: 0.002,
            restitution: 0.92
          }
        );

      // 左プレイヤー
      const hostShape =
        state.host
          ? state.localDrawings.mallet
          : state.opponentDrawings.mallet;

      // 右プレイヤー
      const guestShape =
        state.host
          ? state.opponentDrawings.mallet
          : state.localDrawings.mallet;

      this.hostMallet =
        this.createShapeBody(
          hostShape ||
            defaultMalletShape(),
          w * 0.18,
          h / 2,
          {
            density: 0.01,
            friction: 0.05,
            frictionAir: 0.03,
            restitution: 0.5,
            inertia: Infinity
          }
        );

      this.guestMallet =
        this.createShapeBody(
          guestShape ||
            defaultMalletShape(),
          w * 0.82,
          h / 2,
          {
            density: 0.01,
            friction: 0.05,
            frictionAir: 0.03,
            restitution: 0.5,
            inertia: Infinity
          }
        );

      World.add(
        this.world,
        [
          this.puck,
          this.hostMallet,
          this.guestMallet
        ]
      );

      // 初期速度
      Body.setVelocity(
        this.puck,
        {
          x: state.host ? 4 : -4,
          y: 1.5
        }
      );
    }

    createShapeBody(
      points,
      x,
      y,
      options
    ) {
      if (
        !points ||
        points.length < 3
      ) {
        return Bodies.circle(
          x,
          y,
          25,
          options
        );
      }

      // Matter.js用に頂点を変換
      const vertices =
        points.map((p) => ({
          x: p.x,
          y: p.y
        }));

      try {
        const body =
          Bodies.fromVertices(
            x,
            y,
            [vertices],
            options,
            true
          );

        if (body) {
          return body;
        }
      } catch (error) {
        console.warn(
          "描画形状をMatter.jsのbodyに変換できませんでした。",
          error
        );
      }

      // フォールバック
      let maxR = 20;

      points.forEach((p) => {
        maxR = Math.max(
          maxR,
          Math.hypot(
            p.x,
            p.y
          )
        );
      });

      return Bodies.circle(
        x,
        y,
        maxR,
        options
      );
    }

    // -------------------------------------------------------
    // Input
    // -------------------------------------------------------

    bindInput() {
      const canvas =
        this.canvas;

      const updatePointer =
        (e) => {
          const rect =
            canvas.getBoundingClientRect();

          let x =
            e.clientX -
            rect.left;

          let y =
            e.clientY -
            rect.top;

          x = Math.max(
            20,
            Math.min(
              this.width - 20,
              x
            )
          );

          y = Math.max(
            30,
            Math.min(
              this.height - 30,
              y
            )
          );

          // 自分のマレット
          if (state.host) {
            // ホストは左側
            x = Math.min(
              x,
              this.width / 2 - 20
            );

            this.localMalletTarget = {
              x,
              y
            };
          } else {
            // ゲストは右側
            x = Math.max(
              x,
              this.width / 2 + 20
            );

            this.localMalletTarget = {
              x,
              y
            };

            this.sendInput(
              x,
              y
            );
          }
        };

      canvas.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();

          try {
            canvas.setPointerCapture(
              e.pointerId
            );
          } catch (_) {}

          updatePointer(e);
        }
      );

      canvas.addEventListener(
        "pointermove",
        (e) => {
          if (
            e.buttons ||
            e.pointerType === "touch"
          ) {
            e.preventDefault();
            updatePointer(e);
          }
        }
      );

      canvas.addEventListener(
        "pointerup",
        (e) => {
          try {
            canvas.releasePointerCapture(
              e.pointerId
            );
          } catch (_) {}
        }
      );

      window.addEventListener(
        "resize",
        () => {
          // ゲーム中は大幅なサイズ変更だけ反映
          if (
            !state.game ||
            state.game !== this
          ) {
            return;
          }
        }
      );
    }

    sendInput(x, y) {
      const now =
        performance.now();

      if (
        now - this.lastInputTime <
        25
      ) {
        return;
      }

      this.lastInputTime =
        now;

      sendBroadcast("input", {
        x,
        y
      });
    }

    receiveGuestInput(payload) {
      if (!payload) return;

      this.guestInput.x =
        payload.x;

      this.guestInput.y =
        payload.y;
    }

    // -------------------------------------------------------
    // Physics
    // -------------------------------------------------------

    bindPhysics() {
      Events.on(
        this.engine,
        "beforeUpdate",
        () => {
          if (!state.host) {
            return;
          }

          // ホスト側マレット
          if (this.localMalletTarget) {
            this.moveMallet(
              this.hostMallet,
              this.localMalletTarget,
              true
            );
          }

          // ゲスト側マレット
          if (this.guestInput) {
            this.moveMallet(
              this.guestMallet,
              this.guestInput,
              false
            );
          }

          // パック速度制限
          const velocity =
            this.puck.velocity;

          const speed =
            Math.hypot(
              velocity.x,
              velocity.y
            );

          const maxSpeed = 18;

          if (speed > maxSpeed) {
            Body.setVelocity(
              this.puck,
              {
                x:
                  velocity.x /
                  speed *
                  maxSpeed,

                y:
                  velocity.y /
                  speed *
                  maxSpeed
              }
            );
          }
        }
      );

      Events.on(
        this.engine,
        "afterUpdate",
        () => {
          if (!state.host) {
            return;
          }

          this.checkGoal();

          const now =
            performance.now();

          if (
            now -
              this.lastNetworkSend >=
            25
          ) {
            this.lastNetworkSend =
              now;

            this.sendPhysicsState();
          }
        }
      );
    }

    moveMallet(
      body,
      target,
      leftSide
    ) {
      if (!body || !target) return;

      const half =
        this.width / 2;

      let x = target.x;
      let y = target.y;

      if (leftSide) {
        x = Math.min(
          x,
          half - 25
        );
      } else {
        x = Math.max(
          x,
          half + 25
        );
      }

      const margin = 40;

      x = Math.max(
        margin,
        Math.min(
          this.width - margin,
          x
        )
      );

      y = Math.max(
        margin,
        Math.min(
          this.height - margin,
          y
        )
      );

      Body.setPosition(
        body,
        {
          x,
          y
        }
      );

      Body.setVelocity(
        body,
        {
          x: 0,
          y: 0
        }
      );
    }

    // -------------------------------------------------------
    // Goal
    // -------------------------------------------------------

    checkGoal() {
      const x =
        this.puck.position.x;

      const y =
        this.puck.position.y;

      const goalTop =
        this.height / 2 -
        this.goalWidth / 2;

      const goalBottom =
        this.height / 2 +
        this.goalWidth / 2;

      if (
        y >= goalTop &&
        y <= goalBottom
      ) {
        if (
          x < -10
        ) {
          this.scoreGuest();
          return;
        }

        if (
          x >
          this.width + 10
        ) {
          this.scoreHost();
          return;
        }
      }

      // ゴール以外で画面外に出た場合は中央へ
      if (
        x < -80 ||
        x > this.width + 80 ||
        y < -80 ||
        y > this.height + 80
      ) {
        this.resetPuck();
      }
    }

    scoreHost() {
      if (!state.host) return;

      state.hostScore++;

      updateScore();

      if (
        state.hostScore >= 5
      ) {
        sendBroadcast("finish", {
          hostScore:
            state.hostScore,
          guestScore:
            state.guestScore
        });

        finishGame();

        return;
      }

      this.resetPuck();

      sendBroadcast("score", {
        hostScore:
          state.hostScore,
        guestScore:
          state.guestScore,
        puck: this.getPuckState()
      });
    }

    scoreGuest() {
      if (!state.host) return;

      state.guestScore++;

      updateScore();

      if (
        state.guestScore >= 5
      ) {
        sendBroadcast("finish", {
          hostScore:
            state.hostScore,
          guestScore:
            state.guestScore
        });

        finishGame();

        return;
      }

      this.resetPuck();

      sendBroadcast("score", {
        hostScore:
          state.hostScore,
        guestScore:
          state.guestScore,
        puck: this.getPuckState()
      });
    }

    resetPuck() {
      Body.setPosition(
        this.puck,
        {
          x: this.width / 2,
          y: this.height / 2
        }
      );

      const direction =
        Math.random() > 0.5
          ? 1
          : -1;

      Body.setVelocity(
        this.puck,
        {
          x:
            direction *
            (4 +
              Math.random() *
                2),

          y:
            (Math.random() -
              0.5) *
            5
        }
      );

      Body.setAngularVelocity(
        this.puck,
        0
      );
    }

    resetRound(puckState) {
      if (!this.puck) return;

      if (puckState) {
        this.applyPuckState(
          puckState
        );
      } else {
        this.resetPuck();
      }
    }

    // -------------------------------------------------------
    // Network
    // -------------------------------------------------------

    getPuckState() {
      return {
        x:
          this.puck.position.x,

        y:
          this.puck.position.y,

        vx:
          this.puck.velocity.x,

        vy:
          this.puck.velocity.y,

        angle:
          this.puck.angle,

        angularVelocity:
          this.puck.angularVelocity
      };
    }

    getMalletState(body) {
      return {
        x: body.position.x,
        y: body.position.y,
        angle: body.angle
      };
    }

    sendPhysicsState() {
      sendBroadcast("state", {
        puck:
          this.getPuckState(),

        hostMallet:
          this.getMalletState(
            this.hostMallet
          ),

        guestMallet:
          this.getMalletState(
            this.guestMallet
          ),

        hostScore:
          state.hostScore,

        guestScore:
          state.guestScore
      });
    }

    receiveNetworkState(payload) {
      if (state.host) {
        return;
      }

      if (payload.puck) {
        this.applyPuckState(
          payload.puck
        );
      }

      if (
        payload.hostMallet
      ) {
        this.applyMalletState(
          this.hostMallet,
          payload.hostMallet
        );
      }

      if (
        payload.guestMallet
      ) {
        this.applyMalletState(
          this.guestMallet,
          payload.guestMallet
        );
      }

      if (
        typeof payload.hostScore ===
        "number"
      ) {
        state.hostScore =
          payload.hostScore;
      }

      if (
        typeof payload.guestScore ===
        "number"
      ) {
        state.guestScore =
          payload.guestScore;
      }

      updateScore();
    }

    applyPuckState(data) {
      Body.setPosition(
        this.puck,
        {
          x: data.x,
          y: data.y
        }
      );

      Body.setVelocity(
        this.puck,
        {
          x: data.vx,
          y: data.vy
        }
      );

      if (
        typeof data.angle ===
        "number"
      ) {
        Body.setAngle(
          this.puck,
          data.angle
        );
      }

      if (
        typeof data.angularVelocity ===
        "number"
      ) {
        Body.setAngularVelocity(
          this.puck,
          data.angularVelocity
        );
      }
    }

    applyMalletState(
      body,
      data
    ) {
      if (!body || !data) return;

      Body.setPosition(
        body,
        {
          x: data.x,
          y: data.y
        }
      );

      if (
        typeof data.angle ===
        "number"
      ) {
        Body.setAngle(
          body,
          data.angle
        );
      }
    }

    // -------------------------------------------------------
    // Loop
    // -------------------------------------------------------

    loop() {
      this.animationId =
        requestAnimationFrame(
          () => this.loop()
        );

      const now =
        performance.now();

      const delta =
        Math.min(
          now - this.lastTime,
          40
        );

      this.lastTime = now;

      Engine.update(
        this.engine,
        delta
      );

      this.render();
    }

    // -------------------------------------------------------
    // Render
    // -------------------------------------------------------

    render() {
      const ctx =
        this.ctx;

      const w =
        this.width;

      const h =
        this.height;

      ctx.clearRect(
        0,
        0,
        w,
        h
      );

      // 背景
      ctx.fillStyle =
        "#101522";

      ctx.fillRect(
        0,
        0,
        w,
        h
      );

      // フィールド
      ctx.strokeStyle =
        "rgba(255,255,255,0.25)";

      ctx.lineWidth = 2;

      ctx.strokeRect(
        1,
        1,
        w - 2,
        h - 2
      );

      // センターライン
      ctx.beginPath();

      ctx.moveTo(
        w / 2,
        0
      );

      ctx.lineTo(
        w / 2,
        h
      );

      ctx.stroke();

      // センターサークル
      ctx.beginPath();

      ctx.arc(
        w / 2,
        h / 2,
        70,
        0,
        Math.PI * 2
      );

      ctx.stroke();

      // ゴール
      const goalTop =
        h / 2 -
        this.goalWidth / 2;

      ctx.strokeStyle =
        "rgba(255,100,100,0.7)";

      ctx.strokeRect(
        0,
        goalTop,
        15,
        this.goalWidth
      );

      ctx.strokeRect(
        w - 15,
        goalTop,
        15,
        this.goalWidth
      );

      // bodies
      this.drawBody(
        this.puck,
        "puck"
      );

      this.drawBody(
        this.hostMallet,
        "host"
      );

      this.drawBody(
        this.guestMallet,
        "guest"
      );
    }

    drawBody(body, type) {
      if (!body) return;

      const ctx =
        this.ctx;

      const vertices =
        body.vertices;

      if (
        !vertices ||
        vertices.length === 0
      ) {
        return;
      }

      ctx.save();

      ctx.beginPath();

      vertices.forEach(
        (v, i) => {
          if (i === 0) {
            ctx.moveTo(
              v.x,
              v.y
            );
          } else {
            ctx.lineTo(
              v.x,
              v.y
            );
          }
        }
      );

      ctx.closePath();

      if (type === "puck") {
        ctx.fillStyle =
          "#45b8ff";

        ctx.strokeStyle =
          "#bcecff";
      } else if (
        type === "host"
      ) {
        ctx.fillStyle =
          "#ff5d8f";

        ctx.strokeStyle =
          "#ffd0df";
      } else {
        ctx.fillStyle =
          "#9d75ff";

        ctx.strokeStyle =
          "#e0d3ff";
      }

      ctx.lineWidth = 3;

      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    // -------------------------------------------------------
    // Stop / destroy
    // -------------------------------------------------------

    stop() {
      if (
        this.animationId
      ) {
        cancelAnimationFrame(
          this.animationId
        );

        this.animationId =
          null;
      }
    }

    destroy() {
      this.stop();

      try {
        World.clear(
          this.world,
          false
        );

        Engine.clear(
          this.engine
        );
      } catch (e) {
        console.warn(e);
      }
    }
  }

  // ---------------------------------------------------------
  // デフォルト形状
  // ---------------------------------------------------------

  function defaultPuckShape() {
    const points = [];

    const count = 16;
    const radius = 25;

    for (let i = 0; i < count; i++) {
      const angle =
        Math.PI * 2 *
        i /
        count;

      points.push({
        x:
          Math.cos(angle) *
          radius,

        y:
          Math.sin(angle) *
          radius
      });
    }

    return points;
  }

  function defaultMalletShape() {
    const points = [];

    const count = 16;
    const radius = 40;

    for (let i = 0; i < count; i++) {
      const angle =
        Math.PI * 2 *
        i /
        count;

      points.push({
        x:
          Math.cos(angle) *
          radius,

        y:
          Math.sin(angle) *
          radius
      });
    }

    return points;
  }

  // ---------------------------------------------------------
  // ボタン
  // ---------------------------------------------------------

  if (createRoomBtn) {
    createRoomBtn.onclick =
      createRoom;
  }

  if (joinRoomBtn) {
    joinRoomBtn.onclick = () => {
      joinRoom(
        roomInput
          ? roomInput.value
          : ""
      );
    };
  }

  if (quickMatchBtn) {
    quickMatchBtn.onclick =
      quickMatch;
  }

  if (roomInput) {
    roomInput.addEventListener(
      "keydown",
      (e) => {
        if (
          e.key === "Enter"
        ) {
          joinRoom(
            roomInput.value
          );
        }
      }
    );

    roomInput.addEventListener(
      "input",
      () => {
        roomInput.value =
          roomInput.value
            .toUpperCase()
            .replace(
              /[^A-Z0-9]/g,
              ""
            )
            .slice(0, 6);
      }
    );
  }

  // ---------------------------------------------------------
  // ルーム → 描画
  // ---------------------------------------------------------

  if (roomToDrawBtn) {
    roomToDrawBtn.onclick = () => {
      showScreen("draw");

      setupDrawingPads();

      updateReadyUI();

      setStatus(
        "パックとマレットを描いてください。"
      );
    };
  }

  // ---------------------------------------------------------
  // 古いHTML用ボタンにも対応
  // ---------------------------------------------------------

  if (roomReadyBtn) {
    roomReadyBtn.onclick =
      () => {
        showScreen("draw");

        setupDrawingPads();

        updateReadyUI();
      };
  }

  if (roomBackBtn) {
    roomBackBtn.onclick =
      async () => {
        await leaveRoom();
        showScreen("menu");
      };
  }

  // ---------------------------------------------------------
  // 描画クリア
  // ---------------------------------------------------------

  document
    .querySelectorAll(
      "[data-clear]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const type =
            button.dataset.clear;

          if (
            type === "puck" &&
            puckPad
          ) {
            puckPad.clear();
          }

          if (
            type === "mallet" &&
            malletPad
          ) {
            malletPad.clear();
          }
        }
      );
    });

  // ---------------------------------------------------------
  // Ready
  // ---------------------------------------------------------

  if (readyBtn) {
    readyBtn.onclick =
      setReady;
  }

  // ---------------------------------------------------------
  // 結果 → メニュー
  // ---------------------------------------------------------

  if (backToMenuBtn) {
    backToMenuBtn.onclick =
      async () => {
        await leaveRoom();

        state.hostScore = 0;
        state.guestScore = 0;
        state.localReady = false;
        state.opponentReady = false;

        updateScore();

        showScreen("menu");

        setStatus(
          "オフライン"
        );
      };
  }

  // ---------------------------------------------------------
  // ルーム退出
  // ---------------------------------------------------------

  async function leaveRoom() {
    if (state.game) {
      state.game.destroy();
      state.game = null;
    }

    state.running = false;

    if (state.channel) {
      try {
        await supabaseClient.removeChannel(
          state.channel
        );
      } catch (e) {
        console.warn(e);
      }

      state.channel = null;
    }

    state.connected = false;
    state.opponentConnected = false;
    state.localReady = false;
    state.opponentReady = false;
    state.roomCode = "";
  }

  // ---------------------------------------------------------
  // 初期化
  // ---------------------------------------------------------

  showScreen("menu");

  setStatus("オンライン接続準備完了");

  console.log(
    "★ DRAW AIR HOCKEY game.js loaded"
  );
})();
