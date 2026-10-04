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

      screens[key].classList.toggle(
        "hidden",
        key !== name
      );

      screens[key].style.display =
        key === name ? "" : "none";
    });
  }

  function setStatus(text) {
    if (statusTextEl) {
      statusTextEl.textContent = text;
    }

    console.log(
      "[DRAW AIR HOCKEY]",
      text
    );
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
      window.crypto &&
      crypto.randomUUID
        ? crypto.randomUUID()
        : "player-" +
          Math.random()
            .toString(36)
            .slice(2),

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
      code +=
        chars[
          Math.floor(
            Math.random() *
            chars.length
          )
        ];
    }

    return code;
  }

  // =========================================================
  // Supabase Realtime
  // =========================================================

  async function subscribeRoom(code) {
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

    const channelName =
      "draw-air-hockey-" + code;

    const channel =
      supabaseClient.channel(
        channelName,
        {
          config: {
            broadcast: {
              self: false
            }
          }
        }
      );

    state.channel = channel;

    // -------------------------------------------------------
    // opponent join
    // -------------------------------------------------------

    channel.on(
      "broadcast",
      {
        event: "hello"
      },
      ({ payload }) => {
        if (
          !payload ||
          payload.playerId ===
            state.playerId
        ) {
          return;
        }

        state.opponentConnected = true;

        setRoomStatus(
          "相手が参加しました。形を描いて準備してください。"
        );

        setStatus(
          "相手が参加しました。"
        );

        sendBroadcast(
          "hello",
          {
            playerId:
              state.playerId,
            host: state.host
          }
        );

        updateRoomButtons();
      }
    );

    // -------------------------------------------------------
    // ready
    // -------------------------------------------------------

    channel.on(
      "broadcast",
      {
        event: "ready"
      },
      ({ payload }) => {
        if (
          !payload ||
          payload.playerId ===
            state.playerId
        ) {
          return;
        }

        state.opponentConnected = true;
        state.opponentReady = true;

        if (payload.drawings) {
          state.opponentDrawings =
            cloneDrawingData(
              payload.drawings
            );
        }

        setRoomStatus(
          "相手の準備が完了しました。"
        );

        updateReadyMessage();

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
      {
        event: "start"
      },
      ({ payload }) => {
        if (!payload) return;

        if (state.host) return;

        state.hostScore =
          payload.hostScore || 0;

        state.guestScore =
          payload.guestScore || 0;

        /*
         * ここが重要。
         *
         * ホストが持っている「完成済み描画データ」を
         * そのままゲストへ渡す。
         *
         * ゲスト側で再計算しない。
         */

        if (payload.hostDrawings) {
          state.opponentDrawings =
            cloneDrawingData(
              payload.hostDrawings
            );
        }

        if (payload.guestDrawings) {
          state.localDrawings =
            cloneDrawingData(
              payload.guestDrawings
            );
        }

        startLocalGame();
      }
    );

    // -------------------------------------------------------
    // physics state
    // -------------------------------------------------------

    channel.on(
      "broadcast",
      {
        event: "state"
      },
      ({ payload }) => {
        if (
          !payload ||
          state.host ||
          !state.game
        ) {
          return;
        }

        state.game.receiveNetworkState(
          payload
        );
      }
    );

    // -------------------------------------------------------
    // guest input
    // -------------------------------------------------------

    channel.on(
      "broadcast",
      {
        event: "input"
      },
      ({ payload }) => {
        if (
          !payload ||
          !state.host ||
          !state.game
        ) {
          return;
        }

        state.game.receiveGuestInput(
          payload
        );
      }
    );

    // -------------------------------------------------------
    // score
    // -------------------------------------------------------

    channel.on(
      "broadcast",
      {
        event: "score"
      },
      ({ payload }) => {
        if (!payload) return;

        state.hostScore =
          payload.hostScore || 0;

        state.guestScore =
          payload.guestScore || 0;

        updateScore();

        if (
          !state.host &&
          state.game
        ) {
          state.game.resetRound(
            payload.puck
          );
        }
      }
    );

    // -------------------------------------------------------
    // finish
    // -------------------------------------------------------

    channel.on(
      "broadcast",
      {
        event: "finish"
      },
      ({ payload }) => {
        if (!payload) return;

        state.hostScore =
          payload.hostScore || 0;

        state.guestScore =
          payload.guestScore || 0;

        updateScore();

        finishGame();
      }
    );

    // -------------------------------------------------------
    // subscribe
    // -------------------------------------------------------

    await new Promise(
      (resolve, reject) => {
        let finished = false;

        const timer =
          setTimeout(() => {
            if (finished) return;

            finished = true;

            reject(
              new Error(
                "Supabaseへの接続がタイムアウトしました。"
              )
            );
          }, 10000);

        channel.subscribe(
          (status) => {
            console.log(
              "Supabase channel:",
              status
            );

            if (
              status ===
              "SUBSCRIBED"
            ) {
              if (finished) return;

              finished = true;

              clearTimeout(
                timer
              );

              state.connected =
                true;

              resolve();
            }

            if (
              status ===
              "CHANNEL_ERROR"
            ) {
              if (finished) return;

              finished = true;

              clearTimeout(
                timer
              );

              reject(
                new Error(
                  "Supabase Realtimeへの接続に失敗しました。"
                )
              );
            }
          }
        );
      }
    );

    await sendBroadcast(
      "hello",
      {
        playerId:
          state.playerId,
        host: state.host
      }
    );
  }

  async function sendBroadcast(
    event,
    payload
  ) {
    if (!state.channel) return;

    try {
      await state.channel.send({
        type: "broadcast",
        event,
        payload: {
          ...(payload || {}),
          playerId:
            payload &&
            payload.playerId
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

  // =========================================================
  // ルーム作成
  // =========================================================

  async function createRoom() {
    try {
      setStatus(
        "ルームを作成しています..."
      );

      state.host = true;
      state.localReady = false;
      state.opponentReady = false;
      state.opponentConnected = false;

      const code =
        makeRoomCode();

      state.roomCode = code;

      await subscribeRoom(
        code
      );

      if (roomCodeEl) {
        roomCodeEl.textContent =
          code;
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

      setStatus(
        "接続エラー"
      );
    }
  }

  // =========================================================
  // ルーム参加
  // =========================================================

  async function joinRoom(code) {
    code = String(code || "")
      .trim()
      .toUpperCase();

    if (!code) {
      alert(
        "ルームコードを入力してください。"
      );
      return;
    }

    if (code.length !== 6) {
      alert(
        "ルームコードは6文字です。"
      );
      return;
    }

    try {
      setStatus(
        "ルームに参加しています..."
      );

      state.host = false;
      state.localReady = false;
      state.opponentReady = false;
      state.opponentConnected = true;
      state.roomCode = code;

      await subscribeRoom(
        code
      );

      if (roomCodeEl) {
        roomCodeEl.textContent =
          code;
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

      setStatus(
        "接続エラー"
      );
    }
  }

  // =========================================================
  // オンラインマッチング
  // =========================================================

  async function quickMatch() {
    const code =
      window.prompt(
        "友達から教えてもらった6桁のルームコードを入力してください。"
      );

    if (!code) return;

    await joinRoom(code);
  }

  // =========================================================
  // ルームUI
  // =========================================================

  function updateRoomButtons() {
    if (!roomToDrawBtn) return;

    roomToDrawBtn.disabled =
      false;

    if (roomReadyBtn) {
      roomReadyBtn.style.display =
        "none";
    }

    if (roomBackBtn) {
      roomBackBtn.style.display =
        "";
    }
  }

  // =========================================================
  // 描画システム
  //
  // 以前：
  //   1ストローク = 1つの閉じた図形
  //
  // 今回：
  //   何本でも自由に描ける。
  //   始点と終点は自動で接続しない。
  //
  //   strokes
  //      ↓
  //   外周形状を生成
  //      ↓
  //   物理ボディ
  //
  //   内部の線（顔・目・口など）は
  //   見た目として保存する。
  // =========================================================

  class DrawingPad {
    constructor(canvas, type) {
      this.canvas = canvas;
      this.ctx =
        canvas.getContext("2d");

      this.type = type;

      this.drawing = false;

      // 複数ストローク
      this.strokes = [];

      // 現在描いているストローク
      this.currentStroke = null;

      this.resize();

      canvas.style.touchAction =
        "none";

      canvas.addEventListener(
        "pointerdown",
        (e) =>
          this.start(e)
      );

      canvas.addEventListener(
        "pointermove",
        (e) =>
          this.move(e)
      );

      canvas.addEventListener(
        "pointerup",
        (e) =>
          this.end(e)
      );

      canvas.addEventListener(
        "pointercancel",
        (e) =>
          this.end(e)
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
          window.devicePixelRatio ||
          1;

        this.canvas.width =
          Math.round(
            rect.width * dpr
          );

        this.canvas.height =
          Math.round(
            rect.height * dpr
          );

        this.ctx.setTransform(
          dpr,
          0,
          0,
          dpr,
          0,
          0
        );

        this.width =
          rect.width;

        this.height =
          rect.height;
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
        x:
          e.clientX -
          rect.left,

        y:
          e.clientY -
          rect.top
      };
    }

    start(e) {
      e.preventDefault();

      this.resize();

      this.drawing = true;

      this.currentStroke = [];

      const p =
        this.getPoint(e);

      this.currentStroke.push(
        p
      );

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

      const p =
        this.getPoint(e);

      const last =
        this.currentStroke[
          this.currentStroke.length - 1
        ];

      if (
        !last ||
        Math.hypot(
          p.x - last.x,
          p.y - last.y
        ) >= 2
      ) {
        this.currentStroke.push(
          p
        );

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

      if (
        this.currentStroke &&
        this.currentStroke.length > 0
      ) {
        this.cleanCurrentStroke();

        if (
          this.currentStroke.length >
          1
        ) {
          this.strokes.push(
            this.currentStroke
          );
        }
      }

      this.currentStroke =
        null;

      this.redraw();

      updateReadyUI();
    }

    cleanCurrentStroke() {
      if (
        !this.currentStroke ||
        this.currentStroke.length <
          2
      ) {
        return;
      }

      const cleaned = [];

      for (
        const p of
        this.currentStroke
      ) {
        const last =
          cleaned[
            cleaned.length - 1
          ];

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

      this.currentStroke =
        cleaned;
    }

    clear() {
      this.strokes = [];
      this.currentStroke = null;
      this.drawing = false;

      this.drawGuide();

      updateReadyUI();
    }

    drawGuide() {
      const ctx =
        this.ctx;

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

      ctx.setLineDash([
        5,
        5
      ]);

      ctx.strokeRect(
        10,
        10,
        this.width - 20,
        this.height - 20
      );

      ctx.restore();
    }

    drawStroke(
      stroke
    ) {
      if (
        !stroke ||
        stroke.length === 0
      ) {
        return;
      }

      const ctx =
        this.ctx;

      ctx.beginPath();

      stroke.forEach(
        (p, i) => {
          if (i === 0) {
            ctx.moveTo(
              p.x,
              p.y
            );
          } else {
            ctx.lineTo(
              p.x,
              p.y
            );
          }
        }
      );

      ctx.stroke();
    }

    redraw() {
      this.drawGuide();

      const ctx =
        this.ctx;

      ctx.save();

      ctx.strokeStyle =
        "#ffffff";

      ctx.lineWidth = 4;

      ctx.lineJoin =
        "round";

      ctx.lineCap =
        "round";

      // 完成済みストローク
      for (
        const stroke of
        this.strokes
      ) {
        this.drawStroke(
          stroke
        );
      }

      // 現在描いているストローク
      if (
        this.currentStroke
      ) {
        this.drawStroke(
          this.currentStroke
        );
      }

      ctx.restore();
    }

    // -------------------------------------------------------
    // 描画全体を正規化
    // -------------------------------------------------------

    getNormalizedShape() {
      if (
        this.strokes.length === 0
      ) {
        return null;
      }

      const validStrokes =
        this.strokes
          .filter(
            (stroke) =>
              stroke &&
              stroke.length >= 2
          )
          .map(
            (stroke) =>
              stroke.map(
                (p) => ({
                  x: p.x,
                  y: p.y
                })
              )
          );

      if (
        validStrokes.length === 0
      ) {
        return null;
      }

      // 全ストロークの範囲
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (
        const stroke of
        validStrokes
      ) {
        for (
          const p of stroke
        ) {
          minX =
            Math.min(
              minX,
              p.x
            );

          minY =
            Math.min(
              minY,
              p.y
            );

          maxX =
            Math.max(
              maxX,
              p.x
            );

          maxY =
            Math.max(
              maxY,
              p.y
            );
        }
      }

      const cx =
        (minX + maxX) / 2;

      const cy =
        (minY + maxY) / 2;

      const span =
        Math.max(
          maxX - minX,
          maxY - minY,
          1
        );

      const targetSize =
        this.type === "puck"
          ? 56
          : 84;

      const scale =
        targetSize / span;

      const normalizedStrokes =
        validStrokes.map(
          (stroke) =>
            stroke.map(
              (p) => ({
                x:
                  (p.x - cx) *
                  scale,

                y:
                  (p.y - cy) *
                  scale
              })
            )
        );

      /*
       * 外周はキャンバス上の描画を
       * 画像化して取得する。
       *
       * これにより、
       * 「始点と終点を直線で結ぶ」
       * 方式ではなく、
       * 実際に描いた線の外形から
       * 物理形状を作れる。
       */
      const physics =
        buildPhysicsOutline(
          validStrokes,
          cx,
          cy,
          scale,
          this.type
        );

      return {
        version: 2,

        type: this.type,

        strokes:
          normalizedStrokes,

        physics:
          physics
      };
    }
  }

  let puckPad = null;
  let malletPad = null;

  // =========================================================
  // 描画 → 物理形状
  // =========================================================

  function buildPhysicsOutline(
    strokes,
    cx,
    cy,
    scale,
    type
  ) {
    /*
     * 描画を小さなマスクへ焼き、
     * 外側の輪郭だけを抽出する。
     *
     * 内部の「顔」などの線は
     * 外周には影響しない。
     */

    const size =
      type === "puck"
        ? 96
        : 128;

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width = size;
    canvas.height = size;

    const ctx =
      canvas.getContext(
        "2d",
        {
          willReadFrequently: true
        }
      );

    ctx.clearRect(
      0,
      0,
      size,
      size
    );

    ctx.strokeStyle =
      "#ffffff";

    /*
     * 線を太くしてマスク化。
     * これにより多少の隙間があっても
     * 「落書き全体」をひとつの形として
     * 扱いやすくする。
     */
    const lineWidth =
      type === "puck"
        ? 10
        : 12;

    ctx.lineWidth =
      lineWidth;

    ctx.lineCap =
      "round";

    ctx.lineJoin =
      "round";

    const maskScale =
      0.8;

    const offsetX =
      size / 2 -
      cx * maskScale;

    const offsetY =
      size / 2 -
      cy * maskScale;

    for (
      const stroke of strokes
    ) {
      if (
        stroke.length === 1
      ) {
        const p =
          stroke[0];

        ctx.beginPath();

        ctx.arc(
          p.x * maskScale +
            offsetX,
          p.y * maskScale +
            offsetY,
          lineWidth / 2,
          0,
          Math.PI * 2
        );

        ctx.fill();

        continue;
      }

      ctx.beginPath();

      stroke.forEach(
        (p, i) => {
          const x =
            p.x * maskScale +
            offsetX;

          const y =
            p.y * maskScale +
            offsetY;

          if (i === 0) {
            ctx.moveTo(
              x,
              y
            );
          } else {
            ctx.lineTo(
              x,
              y
            );
          }
        }
      );

      ctx.stroke();
    }

    const image =
      ctx.getImageData(
        0,
        0,
        size,
        size
      );

    const data =
      image.data;

    const occupied =
      new Uint8Array(
        size * size
      );

    for (
      let y = 0;
      y < size;
      y++
    ) {
      for (
        let x = 0;
        x < size;
        x++
      ) {
        const index =
          (y * size + x) * 4;

        if (
          data[index + 3] >
          20
        ) {
          occupied[
            y * size + x
          ] = 1;
        }
      }
    }

    // -------------------------------------------------------
    // 外周候補
    // -------------------------------------------------------

    const boundary = [];

    const directions = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0]
    ];

    for (
      let y = 1;
      y < size - 1;
      y++
    ) {
      for (
        let x = 1;
        x < size - 1;
        x++
      ) {
        if (
          !occupied[
            y * size + x
          ]
        ) {
          continue;
        }

        let edge = false;

        for (
          const [dx, dy]
            of directions
        ) {
          if (
            !occupied[
              (y + dy) *
                size +
              (x + dx)
            ]
          ) {
            edge = true;
            break;
          }
        }

        if (edge) {
          boundary.push({
            x:
              x + 0.5,
            y:
              y + 0.5
          });
        }
      }
    }

    if (
      boundary.length < 3
    ) {
      return defaultPhysicsShape(
        type
      );
    }

    /*
     * 円周順に並べる。
     *
     * 多少の自己交差を防ぐため、
     * 中心からの角度＋距離で整列。
     */
    let centerX = 0;
    let centerY = 0;

    boundary.forEach(
      (p) => {
        centerX += p.x;
        centerY += p.y;
      }
    );

    centerX /=
      boundary.length;

    centerY /=
      boundary.length;

    boundary.sort(
      (a, b) => {
        const aa =
          Math.atan2(
            a.y - centerY,
            a.x - centerX
          );

        const ab =
          Math.atan2(
            b.y - centerY,
            b.x - centerX
          );

        return aa - ab;
      }
    );

    // 重複・近接点を削減
    const simplified =
      simplifyPolygon(
        boundary,
        1.5
      );

    if (
      simplified.length < 3
    ) {
      return defaultPhysicsShape(
        type
      );
    }

    // マスク座標 → 元の描画座標
    const points =
      simplified.map(
        (p) => ({
          x:
            (p.x -
              size / 2) /
            maskScale /
            scale,

          y:
            (p.y -
              size / 2) /
            maskScale /
            scale
        })
      );

    // 大きさを再調整
    const targetRadius =
      type === "puck"
        ? 28
        : 42;

    let maxDistance = 0;

    points.forEach(
      (p) => {
        maxDistance =
          Math.max(
            maxDistance,
            Math.hypot(
              p.x,
              p.y
            )
          );
      }
    );

    if (
      maxDistance < 1
    ) {
      return defaultPhysicsShape(
        type
      );
    }

    const finalScale =
      targetRadius /
      maxDistance;

    return points.map(
      (p) => ({
        x:
          p.x *
          finalScale,

        y:
          p.y *
          finalScale
      })
    );
  }

  // =========================================================
  // ポリゴン簡略化
  // =========================================================

  function simplifyPolygon(
    points,
    tolerance
  ) {
    if (
      points.length <= 3
    ) {
      return points.slice();
    }

    const sqTolerance =
      tolerance *
      tolerance;

    let previous =
      points[0];

    const filtered = [
      previous
    ];

    for (
      let i = 1;
      i < points.length;
      i++
    ) {
      const p =
        points[i];

      const dx =
        p.x - previous.x;

      const dy =
        p.y - previous.y;

      if (
        dx * dx +
          dy * dy >
        sqTolerance
      ) {
        filtered.push(p);
        previous = p;
      }
    }

    if (
      filtered.length <= 3
    ) {
      return filtered;
    }

    return simplifyDouglasPeucker(
      filtered,
      tolerance
    );
  }

  function simplifyDouglasPeucker(
    points,
    tolerance
  ) {
    if (
      points.length <= 3
    ) {
      return points.slice();
    }

    const sqTolerance =
      tolerance *
      tolerance;

    const marker =
      new Uint8Array(
        points.length
      );

    marker[0] = 1;
    marker[
      points.length - 1
    ] = 1;

    const stack = [
      [
        0,
        points.length - 1
      ]
    ];

    while (
      stack.length
    ) {
      const [
        first,
        last
      ] =
        stack.pop();

      let maxSqDist =
        sqTolerance;

      let index = -1;

      for (
        let i =
          first + 1;
        i < last;
        i++
      ) {
        const sqDist =
          getSegmentDistanceSq(
            points[i],
            points[first],
            points[last]
          );

        if (
          sqDist >
          maxSqDist
        ) {
          index = i;
          maxSqDist =
            sqDist;
        }
      }

      if (index !== -1) {
        marker[index] = 1;

        stack.push([
          first,
          index
        ]);

        stack.push([
          index,
          last
        ]);
      }
    }

    const result = [];

    for (
      let i = 0;
      i < points.length;
      i++
    ) {
      if (marker[i]) {
        result.push(
          points[i]
        );
      }
    }

    return result;
  }

  function getSegmentDistanceSq(
    p,
    a,
    b
  ) {
    let x =
      a.x;

    let y =
      a.y;

    let dx =
      b.x - a.x;

    let dy =
      b.y - a.y;

    if (
      dx !== 0 ||
      dy !== 0
    ) {
      const t =
        ((p.x - a.x) * dx +
          (p.y - a.y) * dy) /
        (dx * dx +
          dy * dy);

      if (t > 1) {
        x = b.x;
        y = b.y;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }

    dx =
      p.x - x;

    dy =
      p.y - y;

    return (
      dx * dx +
      dy * dy
    );
  }

  function defaultPhysicsShape(
    type
  ) {
    const points = [];

    const count = 20;

    const radius =
      type === "puck"
        ? 28
        : 42;

    for (
      let i = 0;
      i < count;
      i++
    ) {
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

  // =========================================================
  // 描画データのコピー
  // =========================================================

  function cloneDrawingData(
    drawing
  ) {
    if (!drawing) {
      return null;
    }

    try {
      return JSON.parse(
        JSON.stringify(
          drawing
        )
      );
    } catch (e) {
      console.warn(
        "drawing data copy error",
        e
      );

      return drawing;
    }
  }

  // =========================================================
  // 描画データ
  // =========================================================

  function setupDrawingPads() {
    if (
      !puckCanvas ||
      !malletCanvas
    ) {
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

    readyBtn.disabled =
      !complete;

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
    } else if (
      state.localReady
    ) {
      readyMsg.textContent =
        "準備完了。相手の準備を待っています。";
    }
  }

  // =========================================================
  // 準備完了
  // =========================================================

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

    /*
     * この時点で物理形状まで完成させて保存。
     *
     * 相手側で再生成しない。
     */
    state.localDrawings =
      cloneDrawingData(
        drawings
      );

    state.localReady =
      true;

    readyBtn.disabled =
      true;

    if (readyMsg) {
      readyMsg.textContent =
        "準備完了。相手を待っています...";
    }

    await sendBroadcast(
      "ready",
      {
        playerId:
          state.playerId,

        drawings:
          cloneDrawingData(
            drawings
          )
      }
    );

    if (
      state.host &&
      state.opponentReady
    ) {
      startOnlineGame();
    }
  }

  // =========================================================
  // オンラインゲーム開始
  // =========================================================

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

    /*
     * 同時に2回startしない。
     */
    if (state.running) {
      return;
    }

    state.hostScore = 0;
    state.guestScore = 0;

    updateScore();

    const hostDrawings =
      cloneDrawingData(
        state.localDrawings
      );

    const guestDrawings =
      cloneDrawingData(
        state.opponentDrawings
      );

    /*
     * ホストが完成済みデータを
     * そのまま全員へ送る。
     */
    await sendBroadcast(
      "start",
      {
        hostDrawings,
        guestDrawings,
        hostScore: 0,
        guestScore: 0
      }
    );

    startLocalGame();
  }

  // =========================================================
  // ゲーム開始
  // =========================================================

  function startLocalGame() {
    if (state.game) {
      state.game.destroy();
      state.game = null;
    }

    showScreen("game");

    requestAnimationFrame(
      () => {
        state.game =
          new AirHockeyGame();

        state.running =
          true;

        if (roundMsg) {
          roundMsg.textContent =
            "START!";
        }

        setTimeout(
          () => {
            if (roundMsg) {
              roundMsg.textContent =
                "";
            }
          },
          1200
        );
      }
    );
  }

  // =========================================================
  // スコア
  // =========================================================

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

  // =========================================================
  // 結果
  // =========================================================

  function finishGame() {
    state.running =
      false;

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
      if (
        myScore >
        opponentScore
      ) {
        resultText.textContent =
          "YOU WIN!";
      } else if (
        myScore <
        opponentScore
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

    showScreen(
      "result"
    );
  }

  // =========================================================
  // Air Hockey
  // =========================================================

  class AirHockeyGame {
    constructor() {
      this.canvas =
        gameCanvas;

      this.ctx =
        this.canvas.getContext(
          "2d"
        );

      this.engine =
        Engine.create();

      this.engine.gravity.x =
        0;

      this.engine.gravity.y =
        0;

      this.engine.gravity.scale =
        0;

      this.world =
        this.engine.world;

      this.width = 900;
      this.height = 520;

      this.lastTime =
        performance.now();

      this.animationId =
        null;

      this.lastNetworkSend =
        0;

      this.lastInputTime =
        0;

      this.guestInput = {
        x: 700,
        y: 260
      };

      this.localMalletTarget =
        null;

      this.hostMallet =
        null;

      this.guestMallet =
        null;

      this.puck =
        null;

      this.wallThickness =
        30;

      this.resizeCanvas();

      this.createWorld();

      this.bindInput();

      this.bindPhysics();

      this.loop();
    }

    // =======================================================
    // Canvas
    // =======================================================

    resizeCanvas() {
      const rect =
        this.canvas.getBoundingClientRect();

      let width =
        rect.width ||
        window.innerWidth;

      let height =
        rect.height ||
        Math.min(
          window.innerHeight *
            0.65,
          600
        );

      if (width < 400) {
        width = 400;
      }

      if (height < 260) {
        height = 260;
      }

      const dpr =
        window.devicePixelRatio ||
        1;

      this.canvas.width =
        Math.round(
          width * dpr
        );

      this.canvas.height =
        Math.round(
          height * dpr
        );

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

      this.width =
        width;

      this.height =
        height;
    }

    // =======================================================
    // World
    // =======================================================

    createWorld() {
      const w =
        this.width;

      const h =
        this.height;

      const t =
        this.wallThickness;

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

      /*
       * ゴール部分を空ける。
       *
       * 以前は左右の壁が全面を塞いでいたため、
       * パックが物理的にゴールを通れない状態だった。
       *
       * 今回はここも一緒に修正。
       */
      this.goalWidth =
        Math.min(
          240,
          w * 0.28
        );

      const goalTop =
        h / 2 -
        this.goalWidth / 2;

      const goalBottom =
        h / 2 +
        this.goalWidth / 2;

      const sideHeight =
        Math.max(
          0,
          goalTop
        );

      this.leftWallTop =
        Bodies.rectangle(
          -t / 2,
          sideHeight / 2,
          t,
          sideHeight,
          {
            isStatic: true,
            restitution: 1
          }
        );

      this.leftWallBottom =
        Bodies.rectangle(
          -t / 2,
          goalBottom +
            (h -
              goalBottom) /
              2,
          t,
          h -
            goalBottom,
          {
            isStatic: true,
            restitution: 1
          }
        );

      this.rightWallTop =
        Bodies.rectangle(
          w + t / 2,
          sideHeight / 2,
          t,
          sideHeight,
          {
            isStatic: true,
            restitution: 1
          }
        );

      this.rightWallBottom =
        Bodies.rectangle(
          w + t / 2,
          goalBottom +
            (h -
              goalBottom) /
              2,
          t,
          h -
            goalBottom,
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
          this.leftWallTop,
          this.leftWallBottom,
          this.rightWallTop,
          this.rightWallBottom
        ]
      );

      // -----------------------------------------------------
      // パック
      // -----------------------------------------------------

      const puckDrawing =
        state.host
          ? state.localDrawings.puck
          : state.opponentDrawings.puck;

      /*
       * ゲストの場合も、startイベントで
       * ホストのpuckDrawingが
       * state.opponentDrawingsに入っている。
       *
       * つまり両者とも全く同じデータを使用する。
       */
      const puckShape =
        puckDrawing ||
        defaultDrawingData(
          "puck"
        );

      this.puck =
        this.createShapeBody(
          puckShape.physics ||
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

      // -----------------------------------------------------
      // 左プレイヤー
      // -----------------------------------------------------

      const hostDrawing =
        state.host
          ? state.localDrawings.mallet
          : state.opponentDrawings.mallet;

      // -----------------------------------------------------
      // 右プレイヤー
      // -----------------------------------------------------

      const guestDrawing =
        state.host
          ? state.opponentDrawings.mallet
          : state.localDrawings.mallet;

      this.hostDrawing =
        hostDrawing ||
        defaultDrawingData(
          "mallet"
        );

      this.guestDrawing =
        guestDrawing ||
        defaultDrawingData(
          "mallet"
        );

      this.hostMallet =
        this.createShapeBody(
          this.hostDrawing.physics ||
            this.hostDrawing,
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
          this.guestDrawing.physics ||
            this.guestDrawing,
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

      Body.setVelocity(
        this.puck,
        {
          x:
            state.host
              ? 4
              : -4,

          y: 1.5
        }
      );
    }

    // =======================================================
    // 形状Body
    // =======================================================

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

      const vertices =
        points.map(
          (p) => ({
            x: p.x,
            y: p.y
          })
        );

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

      let maxR = 20;

      points.forEach(
        (p) => {
          maxR =
            Math.max(
              maxR,
              Math.hypot(
                p.x,
                p.y
              )
            );
        }
      );

      return Bodies.circle(
        x,
        y,
        maxR,
        options
      );
    }

    // =======================================================
    // Input
    // =======================================================

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

          if (state.host) {
            x = Math.min(
              x,
              this.width / 2 -
                20
            );

            this.localMalletTarget = {
              x,
              y
            };
          } else {
            x = Math.max(
              x,
              this.width / 2 +
                20
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
            e.pointerType ===
              "touch"
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
    }

    sendInput(
      x,
      y
    ) {
      const now =
        performance.now();

      if (
        now -
          this.lastInputTime <
        25
      ) {
        return;
      }

      this.lastInputTime =
        now;

      sendBroadcast(
        "input",
        {
          x,
          y
        }
      );
    }

    receiveGuestInput(
      payload
    ) {
      if (!payload) return;

      this.guestInput.x =
        payload.x;

      this.guestInput.y =
        payload.y;
    }

    // =======================================================
    // Physics
    // =======================================================

    bindPhysics() {
      Events.on(
        this.engine,
        "beforeUpdate",
        () => {
          if (!state.host) {
            return;
          }

          if (
            this.localMalletTarget
          ) {
            this.moveMallet(
              this.hostMallet,
              this.localMalletTarget,
              true
            );
          }

          if (
            this.guestInput
          ) {
            this.moveMallet(
              this.guestMallet,
              this.guestInput,
              false
            );
          }

          const velocity =
            this.puck.velocity;

          const speed =
            Math.hypot(
              velocity.x,
              velocity.y
            );

          const maxSpeed =
            18;

          if (
            speed >
            maxSpeed
          ) {
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
      if (
        !body ||
        !target
      ) {
        return;
      }

      const half =
        this.width / 2;

      let x =
        target.x;

      let y =
        target.y;

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

      const margin =
        40;

      x = Math.max(
        margin,
        Math.min(
          this.width -
            margin,
          x
        )
      );

      y = Math.max(
        margin,
        Math.min(
          this.height -
            margin,
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

    // =======================================================
    // Goal
    // =======================================================

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

      if (
        x < -80 ||
        x >
          this.width + 80 ||
        y < -80 ||
        y >
          this.height + 80
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
        sendBroadcast(
          "finish",
          {
            hostScore:
              state.hostScore,
            guestScore:
              state.guestScore
          }
        );

        finishGame();

        return;
      }

      this.resetPuck();

      sendBroadcast(
        "score",
        {
          hostScore:
            state.hostScore,

          guestScore:
            state.guestScore,

          puck:
            this.getPuckState()
        }
      );
    }

    scoreGuest() {
      if (!state.host) return;

      state.guestScore++;

      updateScore();

      if (
        state.guestScore >= 5
      ) {
        sendBroadcast(
          "finish",
          {
            hostScore:
              state.hostScore,

            guestScore:
              state.guestScore
          }
        );

        finishGame();

        return;
      }

      this.resetPuck();

      sendBroadcast(
        "score",
        {
          hostScore:
            state.hostScore,

          guestScore:
            state.guestScore,

          puck:
            this.getPuckState()
        }
      );
    }

    resetPuck() {
      Body.setPosition(
        this.puck,
        {
          x:
            this.width / 2,

          y:
            this.height / 2
        }
      );

      const direction =
        Math.random() >
        0.5
          ? 1
          : -1;

      Body.setVelocity(
        this.puck,
        {
          x:
            direction *
            (
              4 +
              Math.random() *
                2
            ),

          y:
            (
              Math.random() -
              0.5
            ) * 5
        }
      );

      Body.setAngularVelocity(
        this.puck,
        0
      );
    }

    resetRound(
      puckState
    ) {
      if (!this.puck) return;

      if (puckState) {
        this.applyPuckState(
          puckState
        );
      } else {
        this.resetPuck();
      }
    }

    // =======================================================
    // Network
    // =======================================================

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

    getMalletState(
      body
    ) {
      return {
        x:
          body.position.x,

        y:
          body.position.y,

        angle:
          body.angle
      };
    }

    sendPhysicsState() {
      sendBroadcast(
        "state",
        {
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
        }
      );
    }

    receiveNetworkState(
      payload
    ) {
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

    applyPuckState(
      data
    ) {
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
      if (
        !body ||
        !data
      ) {
        return;
      }

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

    // =======================================================
    // Loop
    // =======================================================

    loop() {
      this.animationId =
        requestAnimationFrame(
          () => this.loop()
        );

      const now =
        performance.now();

      const delta =
        Math.min(
          now -
            this.lastTime,
          40
        );

      this.lastTime =
        now;

      Engine.update(
        this.engine,
        delta
      );

      this.render();
    }

    // =======================================================
    // Render
    // =======================================================

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

      // -----------------------------------------------------
      // bodies
      // -----------------------------------------------------

      this.drawBody(
        this.puck,
        "puck",
        state.host
          ? state.localDrawings.puck
          : state.opponentDrawings.puck
      );

      this.drawBody(
        this.hostMallet,
        "host",
        this.hostDrawing
      );

      this.drawBody(
        this.guestMallet,
        "guest",
        this.guestDrawing
      );
    }

    // =======================================================
    // Body描画
    // =======================================================

    drawBody(
      body,
      type,
      drawing
    ) {
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

      // -----------------------------------------------------
      // 物理形状
      // -----------------------------------------------------

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

      if (
        type === "puck"
      ) {
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

      /*
       * -----------------------------------------------------
       * 落書きの線
       * -----------------------------------------------------
       *
       * 物理ボディだけでは顔や内部の線が消えてしまうため、
       * 元の落書きもゲーム中に描く。
       *
       * ただし物理判定は外周だけ。
       */

      if (
        drawing &&
        drawing.strokes &&
        drawing.strokes.length
      ) {
        const minX =
          Math.min(
            ...vertices.map(
              (v) => v.x
            )
          );

        const maxX =
          Math.max(
            ...vertices.map(
              (v) => v.x
            )
          );

        const minY =
          Math.min(
            ...vertices.map(
              (v) => v.y
            )
          );

        const maxY =
          Math.max(
            ...vertices.map(
              (v) => v.y
            )
          );

        const sourceWidth =
          Math.max(
            1,
            maxX - minX
          );

        const sourceHeight =
          Math.max(
            1,
            maxY - minY
          );

        const targetWidth =
          sourceWidth;

        const targetHeight =
          sourceHeight;

        ctx.save();

        ctx.translate(
          body.position.x,
          body.position.y
        );

        ctx.rotate(
          body.angle
        );

        ctx.strokeStyle =
          type === "puck"
            ? "rgba(255,255,255,0.85)"
            : "rgba(255,255,255,0.72)";

        ctx.lineWidth =
          type === "puck"
            ? 2
            : 2;

        ctx.lineCap =
          "round";

        ctx.lineJoin =
          "round";

        /*
         * strokesは中心基準の正規化済み座標。
         */
        for (
          const stroke of
          drawing.strokes
        ) {
          if (
            !stroke ||
            stroke.length === 0
          ) {
            continue;
          }

          ctx.beginPath();

          stroke.forEach(
            (p, i) => {
              /*
               * 描画データは
               * 正規化された中心座標。
               */
              const x =
                p.x;

              const y =
                p.y;

              if (i === 0) {
                ctx.moveTo(
                  x,
                  y
                );
              } else {
                ctx.lineTo(
                  x,
                  y
                );
              }
            }
          );

          ctx.stroke();
        }

        ctx.restore();
      }

      ctx.restore();
    }

    // =======================================================
    // Stop / destroy
    // =======================================================

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

  // =========================================================
  // デフォルト描画データ
  // =========================================================

  function defaultDrawingData(
    type
  ) {
    const physics =
      defaultPhysicsShape(
        type
      );

    return {
      version: 2,

      type,

      strokes: [
        physics.map(
          (p) => ({
            x: p.x,
            y: p.y
          })
        )
      ],

      physics
    };
  }

  // =========================================================
  // ボタン
  // =========================================================

  if (createRoomBtn) {
    createRoomBtn.onclick =
      createRoom;
  }

  if (joinRoomBtn) {
    joinRoomBtn.onclick =
      () => {
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

  // =========================================================
  // ルーム → 描画
  // =========================================================

  if (roomToDrawBtn) {
    roomToDrawBtn.onclick =
      () => {
        showScreen("draw");

        setupDrawingPads();

        updateReadyUI();

        setStatus(
          "パックとマレットを自由に描いてください。"
        );
      };
  }

  // =========================================================
  // 古いHTML用ボタン
  // =========================================================

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

  // =========================================================
  // 描画クリア
  // =========================================================

  document
    .querySelectorAll(
      "[data-clear]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            const type =
              button.dataset
                .clear;

            if (
              type === "puck" &&
              puckPad
            ) {
              puckPad.clear();
            }

            if (
              type ===
                "mallet" &&
              malletPad
            ) {
              malletPad.clear();
            }
          }
        );
      }
    );

  // =========================================================
  // Ready
  // =========================================================

  if (readyBtn) {
    readyBtn.onclick =
      setReady;
  }

  // =========================================================
  // 結果 → メニュー
  // =========================================================

  if (backToMenuBtn) {
    backToMenuBtn.onclick =
      async () => {
        await leaveRoom();

        state.hostScore = 0;
        state.guestScore = 0;

        state.localReady =
          false;

        state.opponentReady =
          false;

        updateScore();

        showScreen("menu");

        setStatus(
          "オフライン"
        );
      };
  }

  // =========================================================
  // ルーム退出
  // =========================================================

  async function leaveRoom() {
    if (state.game) {
      state.game.destroy();

      state.game = null;
    }

    state.running =
      false;

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

    state.connected =
      false;

    state.opponentConnected =
      false;

    state.localReady =
      false;

    state.opponentReady =
      false;

    state.roomCode =
      "";

    state.localDrawings = {
      puck: null,
      mallet: null
    };

    state.opponentDrawings = {
      puck: null,
      mallet: null
    };
  }

  // =========================================================
  // 初期化
  // =========================================================

  showScreen("menu");

  setStatus(
    "オンライン接続準備完了"
  );

  console.log(
    "★ DRAW AIR HOCKEY game.js loaded"
  );
})();
