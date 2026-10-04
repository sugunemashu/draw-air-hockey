/* =========================================================
   DRAW AIR HOCKEY
   Online 1 vs 1
   Matter.js + Supabase
========================================================= */

(() => {

  "use strict";

  // =========================================================
  // BASIC
  // =========================================================

  const $ = id => document.getElementById(id);

  const cfg = window.AIR_HOCKEY_CONFIG || {};

  const hasCloud =
    !!(
      window.supabase &&
      cfg.SUPABASE_URL &&
      cfg.SUPABASE_URL.includes("supabase.co") &&
      cfg.SUPABASE_ANON_KEY &&
      !cfg.SUPABASE_ANON_KEY.includes("YOUR-")
    );

  const supa = hasCloud
    ? window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
      )
    : null;


  // =========================================================
  // STATE
  // =========================================================

  const state = {

    room: null,

    role: null,

    playerId: crypto.randomUUID(),

    ready: false,

    drawings: {
      puck: null,
      mallet: null
    },

    opponent: null,

    host: false,

    channel: null,

    queueId: null,

    running: false,

    game: null

  };


  // =========================================================
  // SAFE UI
  // =========================================================

  function msg(text) {

    const el = $("menuMsg");

    if (el) {
      el.textContent = text;
    }

  }


  function status(text) {

    const el = $("status");

    if (el) {
      el.textContent = text;
    }

  }


  function setText(id, text) {

    const el = $(id);

    if (el) {
      el.textContent = text;
    }

  }


  function show(id) {

    [
      "menu",
      "draw",
      "game",
      "result"
    ].forEach(name => {

      const el = $(name);

      if (!el) {
        return;
      }

      el.classList.toggle(
        "hidden",
        name !== id
      );

    });

  }


  // =========================================================
  // DRAWING
  // =========================================================

  function setupPad(canvasId, key) {

    const canvas = $(canvasId);

    if (!canvas) {

      console.warn(
        "[DRAW AIR HOCKEY] Canvas not found:",
        canvasId
      );

      return;

    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }


    const colorInput = $(`${key}Color`);
    const widthInput = $(`${key}Width`);
    const widthValue = $(`${key}WidthValue`);

    let currentColor =
      colorInput?.value || "#ffffff";

    let currentWidth =
      Number(widthInput?.value || 6);

    let drawing = false;

    let points = [];


    // -------------------------------------------------------
    // POSITION
    // -------------------------------------------------------

    function getPosition(e) {

      const rect =
        canvas.getBoundingClientRect();

      return {

        x:
          (e.clientX - rect.left)
          * canvas.width
          / rect.width,

        y:
          (e.clientY - rect.top)
          * canvas.height
          / rect.height

      };

    }


    // -------------------------------------------------------
    // PREVIEW
    // -------------------------------------------------------

    function drawPreview() {

      ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      if (points.length === 0) {
        return;
      }

      ctx.beginPath();

      ctx.moveTo(
        points[0].x,
        points[0].y
      );

      for (
        let i = 1;
        i < points.length;
        i++
      ) {

        ctx.lineTo(
          points[i].x,
          points[i].y
        );

      }

      ctx.strokeStyle =
        currentColor;

      ctx.lineWidth =
        currentWidth;

      ctx.lineCap =
        "round";

      ctx.lineJoin =
        "round";

      ctx.stroke();

    }


    // -------------------------------------------------------
    // DOWN
    // -------------------------------------------------------

    function pointerDown(e) {

      e.preventDefault();

      drawing = true;

      points = [
        getPosition(e)
      ];

      try {

        canvas.setPointerCapture(
          e.pointerId
        );

      } catch (_) {}

      drawPreview();

    }


    // -------------------------------------------------------
    // MOVE
    // -------------------------------------------------------

    function pointerMove(e) {

      if (!drawing) {
        return;
      }

      e.preventDefault();

      points.push(
        getPosition(e)
      );

      drawPreview();

    }


    // -------------------------------------------------------
    // UP
    // -------------------------------------------------------

    function pointerUp() {

      if (!drawing) {
        return;
      }

      drawing = false;

      if (points.length < 2) {
        return;
      }

      const polygon =
        normalizePolygon(points);


      state.drawings[key] = {

        polygon: polygon,

        color: currentColor,

        width: currentWidth,

        sourceWidth:
          canvas.width,

        sourceHeight:
          canvas.height

      };

    }


    // -------------------------------------------------------
    // EVENTS
    // -------------------------------------------------------

    canvas.addEventListener(
      "pointerdown",
      pointerDown
    );

    canvas.addEventListener(
      "pointermove",
      pointerMove
    );

    canvas.addEventListener(
      "pointerup",
      pointerUp
    );

    canvas.addEventListener(
      "pointercancel",
      pointerUp
    );


    // -------------------------------------------------------
    // COLOR
    // -------------------------------------------------------

    if (colorInput) {

      colorInput.addEventListener(
        "input",
        () => {

          currentColor =
            colorInput.value ||
            "#ffffff";

          drawPreview();

        }
      );

    }


    // -------------------------------------------------------
    // WIDTH
    // -------------------------------------------------------

    if (widthInput) {

      widthInput.addEventListener(
        "input",
        () => {

          currentWidth =
            Number(
              widthInput.value || 6
            );

          if (widthValue) {

            widthValue.textContent =
              currentWidth + "px";

          }

          drawPreview();

        }
      );

    }


    if (widthValue) {

      widthValue.textContent =
        currentWidth + "px";

    }


    // -------------------------------------------------------
    // CLEAR
    // -------------------------------------------------------

    const clearButton =
      document.querySelector(
        `[data-clear="${key}"]`
      );

    if (clearButton) {

      clearButton.onclick =
        () => {

          ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
          );

          points = [];

          state.drawings[key] =
            null;

        };

    }

  }


  // =========================================================
  // NORMALIZE
  // =========================================================

  function normalizePolygon(points) {

    if (
      !points ||
      points.length === 0
    ) {

      return [];

    }


    const minX =
      Math.min(
        ...points.map(
          p => p.x
        )
      );

    const maxX =
      Math.max(
        ...points.map(
          p => p.x
        )
      );

    const minY =
      Math.min(
        ...points.map(
          p => p.y
        )
      );

    const maxY =
      Math.max(
        ...points.map(
          p => p.y
        )
      );


    const centerX =
      (minX + maxX) / 2;

    const centerY =
      (minY + maxY) / 2;


    const scale =
      Math.max(
        maxX - minX,
        maxY - minY
      ) || 1;


    const step =
      Math.max(
        1,
        Math.ceil(
          points.length / 28
        )
      );


    return points
      .filter(
        (_, index) =>
          index % step === 0
      )
      .map(point => ({

        x:
          (point.x - centerX)
          / scale,

        y:
          (point.y - centerY)
          / scale

      }));

  }


  // =========================================================
  // SETUP DRAWING PADS
  // =========================================================

  setupPad(
    "puckCanvas",
    "puck"
  );

  setupPad(
    "malletCanvas",
    "mallet"
  );


  // =========================================================
  // SUPABASE CHANNEL
  // =========================================================

  async function openChannel(room) {

    if (!supa) {

      throw new Error(
        "Supabase未設定"
      );

    }


    if (state.channel) {

      try {

        await supa.removeChannel(
          state.channel
        );

      } catch (_) {}

      state.channel = null;

    }


    state.channel =
      supa.channel(
        "air-" + room,
        {
          config: {
            broadcast: {
              ack: true
            }
          }
        }
      );


    state.channel.on(
      "broadcast",
      {
        event: "signal"
      },
      ({ payload }) => {

        onSignal(payload);

      }
    );


    state.channel.on(
      "broadcast",
      {
        event: "state"
      },
      ({ payload }) => {

        onGameState(payload);

      }
    );


    state.channel.on(
      "broadcast",
      {
        event: "ready"
      },
      ({ payload }) => {

        onReady(payload);

      }
    );


    state.channel.on(
      "broadcast",
      {
        event: "start"
      },
      ({ payload }) => {

        startFromHost(payload);

      }
    );


    state.channel.on(
      "broadcast",
      {
        event: "reset"
      },
      ({ payload }) => {

        resetRound(payload);

      }
    );


    const result =
      await state.channel.subscribe();


    if (result !== "SUBSCRIBED") {

      throw new Error(
        "通信チャンネルに接続できません"
      );

    }

  }


  // =========================================================
  // SEND
  // =========================================================

  function send(
    event,
    payload = {}
  ) {

    if (!state.channel) {
      return;
    }


    state.channel.send({

      type: "broadcast",

      event: event,

      payload: {

        ...payload,

        from:
          state.playerId

      }

    });

  }


  // =========================================================
  // SIGNAL
  // =========================================================

  function onSignal(payload) {

    if (!payload) {
      return;
    }

    if (
      payload.from ===
      state.playerId
    ) {

      return;

    }


    // HOSTはHOSTのまま

    if (state.host) {

      state.opponent = {

        ...(state.opponent || {}),

        ...payload

      };

      status(
        "対戦相手が接続しました"
      );

      return;

    }


    // GUEST

    state.opponent = {

      ...(state.opponent || {}),

      ...payload

    };

    state.role =
      "guest";

    state.host =
      false;

    state.ready =
      false;

    show("draw");

    status(
      "対戦相手が見つかりました"
    );

  }


  // =========================================================
  // READY
  // =========================================================

  function onReady(payload) {

    if (!payload) {
      return;
    }

    if (
      payload.from ===
      state.playerId
    ) {

      return;

    }


    state.opponent = {

      ...(state.opponent || {}),

      ...payload,

      ready: true

    };


    if (
      state.host &&
      state.ready
    ) {

      const drawings = {

        host:
          state.drawings,

        guest:
          payload.drawings

      };


      send(
        "start",
        {

          drawings:
            drawings,

          seed:
            Math.random()

        }
      );


      startGame(
        drawings
      );

    }

  }


  // =========================================================
  // START FROM HOST
  // =========================================================

  function startFromHost(payload) {

    if (!payload) {
      return;
    }

    if (!payload.drawings) {
      return;
    }


    // HOSTは自分で開始するので無視

    if (state.host) {
      return;
    }


    const drawings = {

      host:
        payload.drawings.host,

      guest:
        payload.drawings.guest

    };


    state.opponent = {

      ...(state.opponent || {}),

      drawings:
        payload.drawings.host

    };


    startGame(
      drawings
    );

  }


  // =========================================================
  // GAME STATE
  // =========================================================

  function onGameState(payload) {

    if (!payload) {
      return;
    }

    if (state.host) {
      return;
    }

    if (!state.running) {
      return;
    }

    if (
      payload.from ===
      state.playerId
    ) {

      return;

    }


    if (state.game) {

      state.game.applyRemote(
        payload
      );

    }

  }


  // =========================================================
  // RESET
  // =========================================================

  function resetRound(payload) {

    if (state.host) {
      return;
    }

    if (!state.game) {
      return;
    }


    state.game.remoteReset(
      payload
    );

  }


  // =========================================================
  // ROOM CODE
  // =========================================================

  function randomRoomCode() {

    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    for (
      let i = 0;
      i < 5;
      i++
    ) {

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
  // CREATE ROOM
  // =========================================================

  async function createRoom() {

    if (!supa) {

      msg(
        "Supabaseが設定されていません。config.jsを確認してください。"
      );

      return;

    }


    try {

      msg(
        "ルームを作成しています…"
      );

      status(
        "ルーム作成中…"
      );


      let success = false;

      let lastError = null;


      for (
        let attempt = 0;
        attempt < 10;
        attempt++
      ) {

        const code =
          randomRoomCode();


        const result =
          await supa
            .from("rooms")
            .insert({

              code:
                code,

              host_id:
                state.playerId,

              guest_id:
                null,

              status:
                "waiting"

            });


        if (!result.error) {

          state.room =
            code;

          state.role =
            "host";

          state.host =
            true;

          state.ready =
            false;

          state.opponent =
            null;


          await openChannel(
            code
          );


          show("draw");


          status(
            "ルーム " + code
          );


          msg(
            "部屋番号: " +
            code +
            "　この番号を相手に伝えてください。"
          );


          send(
            "signal",
            {
              role:
                "host"
            }
          );


          success = true;

          break;

        }


        lastError =
          result.error;


        const errorText =
          String(
            result.error.message ||
            ""
          ).toLowerCase();


        const duplicate =
          result.error.code === "23505" ||
          errorText.includes(
            "duplicate"
          ) ||
          errorText.includes(
            "already exists"
          );


        if (!duplicate) {
          break;
        }

      }


      if (!success) {

        console.error(
          "[DRAW AIR HOCKEY] createRoom failed",
          lastError
        );


        msg(
          "ルーム作成に失敗しました: " +
          (
            lastError?.message ||
            "原因不明"
          )
        );


        status(
          "ルーム作成失敗"
        );

      }

    } catch (error) {

      console.error(
        "[DRAW AIR HOCKEY] createRoom error",
        error
      );


      msg(
        "ルーム作成中にエラーが発生しました: " +
        (
          error?.message ||
          error
        )
      );


      status(
        "ルーム作成失敗"
      );

    }

  }


  // =========================================================
  // JOIN ROOM
  // =========================================================

  async function joinRoom() {

    if (!supa) {

      msg(
        "Supabaseが設定されていません。"
      );

      return;

    }


    const input =
      $("roomInput");


    if (!input) {

      msg(
        "roomInput がHTMLにありません。"
      );

      return;

    }


    const code =
      input.value
        .trim()
        .toUpperCase();


    if (code.length !== 5) {

      msg(
        "5桁の部屋番号を入力してください。"
      );

      return;

    }


    try {

      status(
        "ルームを検索しています…"
      );


      const result =
        await supa
          .from("rooms")
          .select("*")
          .eq(
            "code",
            code
          )
          .eq(
            "status",
            "waiting"
          )
          .maybeSingle();


      if (
        result.error ||
        !result.data
      ) {

        console.error(
          "[DRAW AIR HOCKEY] room search error",
          result.error
        );


        msg(
          "そのルームは見つからないか、満員です。"
        );

        return;

      }


      const updateResult =
        await supa
          .from("rooms")
          .update({

            guest_id:
              state.playerId,

            status:
              "playing"

          })
          .eq(
            "code",
            code
          )
          .eq(
            "status",
            "waiting"
          );


      if (updateResult.error) {

        msg(
          updateResult.error.message
        );

        return;

      }


      state.room =
        code;

      state.role =
        "guest";

      state.host =
        false;

      state.ready =
        false;


      await openChannel(
        code
      );


      show("draw");


      status(
        "ルーム " + code
      );


      send(
        "signal",
        {
          role:
            "guest"
        }
      );

    } catch (error) {

      console.error(
        "[DRAW AIR HOCKEY] joinRoom error",
        error
      );


      msg(
        "参加中にエラーが発生しました: " +
        (
          error?.message ||
          error
        )
      );

    }

  }


  // =========================================================
  // QUICK MATCH
  // =========================================================

  async function quickMatch() {

    if (!supa) {

      msg(
        "Supabaseが設定されていません。"
      );

      return;

    }


    try {

      show("draw");

      status(
        "オンライン対戦相手を検索中…"
      );

      msg(
        "同じくマッチング待ちのプレイヤーを探しています。"
      );


      const ticket =
        crypto.randomUUID();


      state.queueId =
        ticket;


      const searchResult =
        await supa
          .from("match_queue")
          .select("*")
          .eq(
            "status",
            "waiting"
          )
          .neq(
            "player_id",
            state.playerId
          )
          .limit(1)
          .maybeSingle();


      if (
        searchResult.data
      ) {

        const waitingPlayer =
          searchResult.data;


        let roomCode =
          null;

        let roomError =
          null;


        for (
          let attempt = 0;
          attempt < 10;
          attempt++
        ) {

          const code =
            randomRoomCode();


          const result =
            await supa
              .from("rooms")
              .insert({

                code:
                  code,

                host_id:
                  waitingPlayer.player_id,

                guest_id:
                  state.playerId,

                status:
                  "playing"

              });


          if (!result.error) {

            roomCode =
              code;

            break;

          }


          roomError =
            result.error;


          const errorText =
            String(
              result.error.message ||
              ""
            ).toLowerCase();


          const duplicate =
            result.error.code === "23505" ||
            errorText.includes(
              "duplicate"
            );


          if (!duplicate) {
            break;
          }

        }


        if (!roomCode) {

          msg(
            "マッチング用ルーム作成失敗: " +
            (
              roomError?.message ||
              "原因不明"
            )
          );

          return;

        }


        await supa
          .from("match_queue")
          .update({

            status:
              "matched",

            room_code:
              roomCode

          })
          .eq(
            "id",
            waitingPlayer.id
          );


        state.room =
          roomCode;

        state.role =
          "guest";

        state.host =
          false;


        await openChannel(
          roomCode
        );


        status(
          "マッチング成立"
        );


        send(
          "signal",
          {
            role:
              "guest"
          }
        );


        return;

      }


      const queueResult =
        await supa
          .from("match_queue")
          .insert({

            id:
              ticket,

            player_id:
              state.playerId,

            status:
              "waiting"

          });


      if (queueResult.error) {

        msg(
          "マッチング待機に失敗しました: " +
          queueResult.error.message
        );

        return;

      }


      const poll =
        setInterval(
          async () => {

            try {

              const result =
                await supa
                  .from("match_queue")
                  .select("*")
                  .eq(
                    "id",
                    ticket
                  )
                  .maybeSingle();


              const row =
                result.data;


              if (
                row &&
                row.status === "matched" &&
                row.room_code
              ) {

                clearInterval(
                  poll
                );


                state.room =
                  row.room_code;

                state.role =
                  "host";

                state.host =
                  true;


                await openChannel(
                  row.room_code
                );


                status(
                  "マッチング成立"
                );


                send(
                  "signal",
                  {
                    role:
                      "host"
                  }
                );

              }

            } catch (error) {

              console.error(
                "[DRAW AIR HOCKEY] matchmaking error",
                error
              );

            }

          },
          1200
        );

    } catch (error) {

      console.error(
        "[DRAW AIR HOCKEY] quickMatch error",
        error
      );


      msg(
        "マッチング中にエラーが発生しました: " +
        (
          error?.message ||
          error
        )
      );

    }

  }


  // =========================================================
  // PHYSICS GAME
  // =========================================================

  class AirGame {

    constructor(
      drawings,
      host
    ) {

      this.host =
        host;

      this.W =
        1000;

      this.H =
        500;

      this.lastSend =
        0;


      this.engine =
        Matter.Engine.create({
          enableSleeping:
            false
        });


      this.engine.gravity.x =
        0;

      this.engine.gravity.y =
        0;


      this.world =
        this.engine.world;


      this.canvas =
        $("gameCanvas");


      if (!this.canvas) {

        throw new Error(
          "gameCanvas がHTMLにありません。"
        );

      }


      this.ctx =
        this.canvas.getContext(
          "2d"
        );


      this.resize();


      window.addEventListener(
        "resize",
        () => this.resize()
      );


      this.scores =
        [0, 0];


      this.currentPuck =
        Math.random() < 0.5
          ? 0
          : 1;


      this.drawings =
        drawings;


      /*
        HOST = 左
        GUEST = 右
      */

      this.localSide =
        state.role === "host"
          ? 0
          : 1;


      this.makeArena();

      this.makePuck();

      this.makeMallets();

      this.bindInput();


      this.last =
        performance.now();


      requestAnimationFrame(
        time =>
          this.loop(time)
      );

    }


    // =======================================================
    // RESIZE
    // =======================================================

    resize() {

      this.canvas.width =
        this.W;

      this.canvas.height =
        this.H;

    }


    // =======================================================
    // ARENA
    // =======================================================

    makeArena() {

      const options = {

        isStatic:
          true,

        restitution:
          1,

        friction:
          0

      };


      Matter.World.add(
        this.world,
        [

          Matter.Bodies.rectangle(
            this.W / 2,
            -12,
            this.W,
            24,
            options
          ),

          Matter.Bodies.rectangle(
            this.W / 2,
            this.H + 12,
            this.W,
            24,
            options
          ),

          Matter.Bodies.rectangle(
            -12,
            this.H / 2,
            24,
            this.H,
            options
          ),

          Matter.Bodies.rectangle(
            this.W + 12,
            this.H / 2,
            24,
            this.H,
            options
          )

        ]
      );


      this.goalW =
        260;

    }


    // =======================================================
    // BODY FROM DRAWING
    // =======================================================

    bodyFromDrawing(
      drawing,
      x,
      y,
      scale,
      options = {}
    ) {

      const polygon =
        Array.isArray(drawing)
          ? drawing
          : drawing?.polygon;


      const verts =
        (
          polygon &&
          polygon.length > 2
        )
          ? polygon.map(
              p => ({

                x:
                  p.x * scale,

                y:
                  p.y * scale

              })
            )
          : [

              {
                x:
                  -scale / 2,

                y:
                  -scale / 2

              },

              {
                x:
                  scale / 2,

                y:
                  -scale / 2

              },

              {
                x:
                  scale / 2,

                y:
                  scale / 2

              },

              {
                x:
                  -scale / 2,

                y:
                  scale / 2

              }

            ];


      const body =
        Matter.Bodies.fromVertices(
          x,
          y,
          [verts],
          {

            restitution:
              0.95,

            friction:
              0.01,

            frictionAir:
              0.002,

            ...options

          },
          true
        );


      /*
        物理BODY自体は描画しない。
      */

      body.drawData =
        Array.isArray(drawing)
          ? null
          : drawing || null;


      body.drawScale =
        scale;


      return body;

    }


    // =======================================================
    // PUCK
    // =======================================================

    makePuck() {

      const drawing =
        this.drawings[
          this.currentPuck
        ]?.puck;


      this.puck =
        this.bodyFromDrawing(
          drawing,
          this.W / 2,
          this.H / 2,
          70
        );


      this.puck.label =
        "puck";


      this.puck.playerShape =
        this.currentPuck;


      Matter.World.add(
        this.world,
        this.puck
      );

    }


    // =======================================================
    // MALLETS
    // =======================================================

    makeMallets() {

      this.mallets = [];


      for (
        let i = 0;
        i < 2;
        i++
      ) {

        const drawing =
          this.drawings[i]?.mallet;


        const x =
          i === 0
            ? 220
            : 780;


        const body =
          this.bodyFromDrawing(
            drawing,
            x,
            this.H / 2,
            105,
            {
              isStatic:
                true
            }
          );


        body.label =
          "mallet" + i;


        body.player =
          i;


        this.mallets[i] =
          body;


        Matter.World.add(
          this.world,
          body
        );

      }

    }


    // =======================================================
    // RESET PUCK
    // =======================================================

    resetPuck(nextPlayer) {

      Matter.World.remove(
        this.world,
        this.puck
      );


      this.currentPuck =
        nextPlayer;


      this.makePuck();


      Matter.Body.setPosition(
        this.puck,
        {

          x:
            this.W / 2,

          y:
            this.H / 2

        }
      );


      Matter.Body.setVelocity(
        this.puck,
        {

          x:
            (
              Math.random() < 0.5
                ? -1
                : 1
            ) * 7,

          y:
            (
              Math.random() - 0.5
            ) * 5

        }
      );


      this.roundPause =
        performance.now() + 900;

    }


    // =======================================================
    // SCORE
    // =======================================================

    score(side) {

      if (
        this.roundPause &&
        performance.now() <
        this.roundPause
      ) {

        return;

      }


      this.scores[side]++;


      setText(
        "score1",
        this.scores[0]
      );

      setText(
        "score2",
        this.scores[1]
      );


      if (
        this.scores[side] >= 5
      ) {

        this.finish(side);

        return;

      }


      this.resetPuck(
        1 - this.currentPuck
      );


      send(
        "reset",
        {

          scores:
            this.scores,

          currentPuck:
            this.currentPuck

        }
      );

    }


    // =======================================================
    // FINISH
    // =======================================================

    finish(side) {

      state.running =
        false;


      setText(
        "resultTitle",
        side === this.localSide
          ? "WIN!"
          : "LOSE…"
      );


      show("result");


      send(
        "state",
        {

          final:
            true,

          scores:
            this.scores,

          winner:
            side

        }
      );

    }


    // =======================================================
    // REMOTE
    // =======================================================

    applyRemote(payload) {

      if (!payload) {
        return;
      }


      if (payload.final) {

        state.running =
          false;


        show("result");


        setText(
          "resultTitle",
          payload.winner === this.localSide
            ? "WIN!"
            : "LOSE…"
        );


        return;

      }


      if (payload.puck) {

        Matter.Body.setPosition(
          this.puck,
          payload.puck.pos
        );


        Matter.Body.setVelocity(
          this.puck,
          payload.puck.vel
        );


        Matter.Body.setAngle(
          this.puck,
          payload.puck.angle
        );

      }


      if (payload.mallets) {

        for (
          let i = 0;
          i < 2;
          i++
        ) {

          if (
            payload.mallets[i] &&
            i !== this.localSide
          ) {

            Matter.Body.setPosition(
              this.mallets[i],
              payload.mallets[i]
            );

          }

        }

      }


      if (payload.scores) {

        this.scores =
          payload.scores;


        setText(
          "score1",
          this.scores[0]
        );


        setText(
          "score2",
          this.scores[1]
        );

      }

    }


    // =======================================================
    // REMOTE RESET
    // =======================================================

    remoteReset(payload) {

      if (!payload) {
        return;
      }


      this.scores =
        payload.scores;


      setText(
        "score1",
        this.scores[0]
      );


      setText(
        "score2",
        this.scores[1]
      );


      this.resetPuck(
        payload.currentPuck
      );

    }


    // =======================================================
    // INPUT
    // =======================================================

    bindInput() {

      const canvas =
        this.canvas;


      let dragging =
        false;


      const move =
        event => {

          if (!dragging) {
            return;
          }


          const rect =
            canvas.getBoundingClientRect();


          const x =
            (
              event.clientX -
              rect.left
            )
            * this.W
            / rect.width;


          const y =
            (
              event.clientY -
              rect.top
            )
            * this.H
            / rect.height;


          const side =
            this.localSide;


          const minX =
            side === 0
              ? 40
              : this.W / 2 + 40;


          const maxX =
            side === 0
              ? this.W / 2 - 40
              : this.W - 40;


          const clampedX =
            Math.max(
              minX,
              Math.min(
                maxX,
                x
              )
            );


          const clampedY =
            Math.max(
              55,
              Math.min(
                this.H - 55,
                y
              )
            );


          Matter.Body.setPosition(
            this.mallets[side],
            {

              x:
                clampedX,

              y:
                clampedY

            }
          );

        };


      canvas.onpointerdown =
        event => {

          dragging = true;

          move(event);

          try {

            canvas.setPointerCapture(
              event.pointerId
            );

          } catch (_) {}

        };


      canvas.onpointermove =
        move;


      canvas.onpointerup =
        () => {

          dragging = false;

        };


      canvas.onpointercancel =
        () => {

          dragging = false;

        };

    }


    // =======================================================
    // LOOP
    // =======================================================

    loop(time) {

      if (!state.running) {
        return;
      }


      const dt =
        Math.min(
          32,
          time - this.last
        );


      this.last =
        time;


      if (this.host) {

        if (
          !this.roundPause ||
          time > this.roundPause
        ) {

          Matter.Engine.update(
            this.engine,
            dt
          );

        }


        const x =
          this.puck.position.x;


        if (x < -25) {

          this.score(1);

          return;

        }


        if (
          x >
          this.W + 25
        ) {

          this.score(0);

          return;

        }


        if (
          this.puck.position.y < 30 ||
          this.puck.position.y >
            this.H - 30
        ) {

          Matter.Body.setVelocity(
            this.puck,
            {

              x:
                this.puck.velocity.x,

              y:
                -this.puck.velocity.y

            }
          );

        }


        if (
          time - this.lastSend >
          30
        ) {

          send(
            "state",
            {

              puck: {

                pos:
                  this.puck.position,

                vel:
                  this.puck.velocity,

                angle:
                  this.puck.angle

              },

              mallets:
                this.mallets.map(
                  mallet =>
                    mallet.position
                ),

              scores:
                this.scores

            }
          );


          this.lastSend =
            time;

        }

      }


      this.draw();


      requestAnimationFrame(
        nextTime =>
          this.loop(nextTime)
      );

    }


    // =======================================================
    // DRAW GAME
    // =======================================================

    draw() {

      const c =
        this.ctx;


      c.clearRect(
        0,
        0,
        this.W,
        this.H
      );


      // FIELD

      c.fillStyle =
        "#0b7775";

      c.fillRect(
        0,
        0,
        this.W,
        this.H
      );


      // BORDER

      c.strokeStyle =
        "#bff9ef";

      c.lineWidth =
        4;

      c.strokeRect(
        10,
        10,
        this.W - 20,
        this.H - 20
      );


      // CENTER LINE

      c.beginPath();

      c.moveTo(
        this.W / 2,
        10
      );

      c.lineTo(
        this.W / 2,
        this.H - 10
      );

      c.stroke();


      // CENTER CIRCLE

      c.beginPath();

      c.arc(
        this.W / 2,
        this.H / 2,
        90,
        0,
        Math.PI * 2
      );

      c.stroke();


      // GOALS

      c.fillStyle =
        "#092e38";

      c.fillRect(
        0,
        this.H / 2 - 130,
        18,
        260
      );

      c.fillRect(
        this.W - 18,
        this.H / 2 - 130,
        18,
        260
      );


      // DRAWINGS

      this.mallets.forEach(
        mallet => {

          this.drawPlayerShape(
            mallet
          );

        }
      );


      this.drawPlayerShape(
        this.puck
      );

    }


    // =======================================================
    // DRAW PLAYER SHAPE
    // =======================================================

    drawPlayerShape(body) {

      const drawing =
        body.drawData;


      const c =
        this.ctx;


      if (!drawing) {

        c.save();

        c.translate(
          body.position.x,
          body.position.y
        );

        c.beginPath();

        c.arc(
          0,
          0,
          body.drawScale / 2,
          0,
          Math.PI * 2
        );

        c.strokeStyle =
          "#ffffff";

        c.lineWidth =
          5;

        c.stroke();

        c.restore();

        return;

      }


      const polygon =
        drawing.polygon;


      if (
        !polygon ||
        polygon.length < 2
      ) {

        return;

      }


      c.save();


      c.translate(
        body.position.x,
        body.position.y
      );


      c.rotate(
        body.angle
      );


      c.beginPath();


      c.moveTo(
        polygon[0].x *
          body.drawScale,

        polygon[0].y *
          body.drawScale
      );


      for (
        let i = 1;
        i < polygon.length;
        i++
      ) {

        c.lineTo(
          polygon[i].x *
            body.drawScale,

          polygon[i].y *
            body.drawScale
        );

      }


      /*
        ★塗りつぶさない

        ★勝手に閉じない
      */

      c.strokeStyle =
        drawing.color ||
        "#ffffff";


      c.lineWidth =
        Math.max(
          1,
          Math.min(
            20,
            Number(
              drawing.width || 6
            )
          )
        );


      c.lineCap =
        "round";

      c.lineJoin =
        "round";


      c.stroke();


      c.restore();

    }

  }


  // =========================================================
  // START GAME
  // =========================================================

  function startGame(drawings) {

    if (state.running) {
      return;
    }


    if (
      !drawings ||
      !drawings.host ||
      !drawings.guest
    ) {

      console.error(
        "[DRAW AIR HOCKEY] Drawing data missing:",
        drawings
      );

      return;

    }


    try {

      state.game =
        new AirGame(
          drawings,
          state.host
        );


      state.running =
        true;


      show("game");


      setText(
        "roundMsg",
        "先に5点！"
      );


      if (state.host) {

        Matter.Body.setVelocity(
          state.game.puck,
          {

            x:
              (
                Math.random() < 0.5
                  ? -1
                  : 1
              ) * 7,

            y:
              (
                Math.random() - 0.5
              ) * 5

          }
        );

      }

    } catch (error) {

      console.error(
        "[DRAW AIR HOCKEY] startGame error",
        error
      );


      state.game =
        null;

      state.running =
        false;


      msg(
        "ゲーム開始に失敗しました: " +
        error.message
      );

    }

  }


  // =========================================================
  // READY BUTTON
  // =========================================================

  const readyBtn =
    $("readyBtn");


  if (readyBtn) {

    readyBtn.onclick =
      () => {

        if (
          !state.drawings.puck ||
          !state.drawings.mallet
        ) {

          setText(
            "readyMsg",
            "パックとマレットの両方を描いてください。"
          );

          return;

        }


        state.ready =
          true;


        readyBtn.disabled =
          true;


        setText(
          "readyMsg",
          "相手の準備を待っています…"
        );


        send(
          "ready",
          {

            drawings:
              state.drawings

          }
        );


        if (
          state.host &&
          state.opponent?.ready
        ) {

          const drawings = {

            host:
              state.drawings,

            guest:
              state.opponent.drawings

          };


          send(
            "start",
            {

              drawings:
                drawings,

              seed:
                Math.random()

            }
          );


          startGame(
            drawings
          );

        }

      };

  }


  // =========================================================
  // BUTTONS
  // =========================================================

  const quickBtn =
    $("quickBtn");

  if (quickBtn) {

    quickBtn.onclick =
      quickMatch;

  }


  const createBtn =
    $("createBtn");

  if (createBtn) {

    createBtn.onclick =
      createRoom;

  }


  const joinBtn =
    $("joinBtn");

  if (joinBtn) {

    joinBtn.onclick =
      joinRoom;

  }


  const backBtn =
    $("backBtn");

  if (backBtn) {

    backBtn.onclick =
      () => {

        location.reload();

      };

  }


  // =========================================================
  // INITIAL
  // =========================================================

  status(
    "オンライン設定待ち"
  );


  if (!hasCloud) {

    msg(
      "現在はゲーム本体のみ動作します。オンライン対戦を有効にするにはREADMEのSupabase設定をしてください。"
    );

  } else {

    console.log(
      "[DRAW AIR HOCKEY] オンライン接続準備完了"
    );

  }


  console.log(
    "★ DRAW AIR HOCKEY game.js loaded"
  );

})();
