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

  const cfg =
    window.AIR_HOCKEY_CONFIG || {};


  const hasCloud =
    !!(
      window.supabase &&
      cfg.SUPABASE_URL &&
      cfg.SUPABASE_URL.includes("supabase.co") &&
      cfg.SUPABASE_ANON_KEY &&
      !cfg.SUPABASE_ANON_KEY.includes("YOUR-")
    );


  const supa =
    hasCloud
      ? window.supabase.createClient(
          cfg.SUPABASE_URL,
          cfg.SUPABASE_ANON_KEY
        )
      : null;


  // =========================================================
  // MATTER / POLY-DECOMP
  // =========================================================

  if (
    window.Matter &&
    window.decomp &&
    Matter.Common &&
    Matter.Common.setDecomp
  ) {

    Matter.Common.setDecomp(
      window.decomp
    );

  }


  // =========================================================
  // STATE
  // =========================================================

  const state = {

    room: null,

    role: null,

    playerId:
      crypto.randomUUID(),

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

    const el =
      $("menuMsg");

    if (el) {

      el.textContent =
        text;

    }

  }


  function status(text) {

    const el =
      $("status");

    if (el) {

      el.textContent =
        text;

    }

  }


  function setText(
    id,
    text
  ) {

    const el =
      $(id);

    if (el) {

      el.textContent =
        text;

    }

  }


  function show(id) {

    [
      "menu",
      "draw",
      "game",
      "result"

    ].forEach(
      name => {

        const el =
          $(name);

        if (!el) {
          return;
        }

        el.classList.toggle(
          "hidden",
          name !== id
        );

      }
    );

  }


  // =========================================================
  // DRAWING
  // =========================================================

  function setupPad(
    canvasId,
    key
  ) {

    const canvas =
      $(canvasId);


    if (!canvas) {

      console.warn(
        "[DRAW AIR HOCKEY] Canvas not found:",
        canvasId
      );

      return;

    }


    const ctx =
      canvas.getContext(
        "2d"
      );


    if (!ctx) {
      return;
    }


    const colorInput =
      $(`${key}Color`);

    const widthInput =
      $(`${key}Width`);

    const widthValue =
      $(`${key}WidthValue`);


    let currentColor =
      colorInput?.value ||
      "#ffffff";


    let currentWidth =
      Number(
        widthInput?.value ||
        6
      );


    let drawing =
      false;


    let points =
      [];


    // -------------------------------------------------------
    // POSITION
    // -------------------------------------------------------

    function getPosition(e) {

      const rect =
        canvas.getBoundingClientRect();


      return {

        x:
          (
            e.clientX -
            rect.left
          )
          *
          canvas.width
          /
          rect.width,


        y:
          (
            e.clientY -
            rect.top
          )
          *
          canvas.height
          /
          rect.height

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


      if (
        points.length === 0
      ) {

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


      drawing =
        true;


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


      drawing =
        false;


      if (
        points.length < 2
      ) {

        return;

      }


      const polygon =
        normalizePolygon(
          points
        );


      const normalizationScale =
        getNormalizationScale(
          points
        );


      state.drawings[key] = {

        polygon:
          polygon,

        color:
          currentColor,

        width:
          currentWidth,

        sourceWidth:
          canvas.width,

        sourceHeight:
          canvas.height,

        strokeWidthNorm:
          currentWidth /
          normalizationScale

      };

    }


    // -------------------------------------------------------
    // EVENTS
    // -------------------------------------------------------

    canvas.style.touchAction =
      "none";


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
              widthInput.value ||
              6
            );


          if (widthValue) {

            widthValue.textContent =
              currentWidth +
              "px";

          }


          drawPreview();

        }
      );

    }


    if (widthValue) {

      widthValue.textContent =
        currentWidth +
        "px";

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

  function getNormalizationScale(
    points
  ) {

    if (
      !points ||
      points.length === 0
    ) {

      return 1;

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


    return (
      Math.max(
        maxX - minX,
        maxY - minY
      )
      || 1
    );

  }


  function normalizePolygon(
    points
  ) {

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
      )
      || 1;


    const step =
      Math.max(
        1,
        Math.ceil(
          points.length / 60
        )
      );


    return points
      .filter(
        (_, index) =>
          index % step === 0
      )
      .map(
        point => ({

          x:
            (
              point.x -
              centerX
            ) /
            scale,

          y:
            (
              point.y -
              centerY
            ) /
            scale

        })
      );

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

  async function openChannel(
    room
  ) {

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


      state.channel =
        null;

    }


    state.channel =
      supa.channel(
        "air-" + room,
        {

          config: {

            broadcast: {

              ack:
                true

            }

          }

        }
      );


    // SIGNAL

    state.channel.on(
      "broadcast",
      {
        event:
          "signal"
      },
      ({ payload }) => {

        onSignal(
          payload
        );

      }
    );


    // GAME STATE

    state.channel.on(
      "broadcast",
      {
        event:
          "state"
      },
      ({ payload }) => {

        onGameState(
          payload
        );

      }
    );


    // GUEST MALLET INPUT

    state.channel.on(
      "broadcast",
      {
        event:
          "input"
      },
      ({ payload }) => {

        onRemoteInput(
          payload
        );

      }
    );


    // READY

    state.channel.on(
      "broadcast",
      {
        event:
          "ready"
      },
      ({ payload }) => {

        onReady(
          payload
        );

      }
    );


    // START

    state.channel.on(
      "broadcast",
      {
        event:
          "start"
      },
      ({ payload }) => {

        startFromHost(
          payload
        );

      }
    );


    // RESET

    state.channel.on(
      "broadcast",
      {
        event:
          "reset"
      },
      ({ payload }) => {

        resetRound(
          payload
        );

      }
    );


    // =======================================================
    // SUBSCRIBE
    // =======================================================

    await new Promise(
      (resolve, reject) => {

        let finished =
          false;


        const timeout =
          setTimeout(
            () => {

              if (finished) {
                return;
              }


              finished =
                true;


              reject(
                new Error(
                  "通信チャンネルへの接続がタイムアウトしました"
                )
              );

            },
            10000
          );


        state.channel.subscribe(
          subscribeStatus => {

            console.log(
              "[DRAW AIR HOCKEY] channel status:",
              subscribeStatus
            );


            if (
              subscribeStatus ===
              "SUBSCRIBED"
            ) {

              if (finished) {
                return;
              }


              finished =
                true;


              clearTimeout(
                timeout
              );


              resolve();

            }


            if (
              subscribeStatus ===
              "CHANNEL_ERROR"
            ) {

              if (finished) {
                return;
              }


              finished =
                true;


              clearTimeout(
                timeout
              );


              reject(
                new Error(
                  "Supabase通信チャンネルでエラーが発生しました"
                )
              );

            }


            if (
              subscribeStatus ===
              "TIMED_OUT"
            ) {

              if (finished) {
                return;
              }


              finished =
                true;


              clearTimeout(
                timeout
              );


              reject(
                new Error(
                  "Supabase通信チャンネルへの接続がタイムアウトしました"
                )
              );

            }

          }
        );

      }
    );

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

      type:
        "broadcast",

      event:
        event,

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

  function onSignal(
    payload
  ) {

    if (!payload) {
      return;
    }


    if (
      payload.from ===
      state.playerId
    ) {

      return;

    }


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

  function onReady(
    payload
  ) {

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

      ready:
        true

    };


    if (
      state.host &&
      state.ready
    ) {

      startMatch(
        payload.drawings
      );

    }

  }


  // =========================================================
  // START MATCH
  // =========================================================

  function startMatch(
    guestDrawings
  ) {

    if (
      !guestDrawings
    ) {

      console.error(
        "[DRAW AIR HOCKEY] guest drawing missing"
      );

      return;

    }


    const drawings = {

      host:
        state.drawings,

      guest:
        guestDrawings

    };


    const currentPuck =
      Math.random() <
      0.5
        ? 0
        : 1;


    send(
      "start",
      {

        drawings:
          drawings,

        currentPuck:
          currentPuck

      }
    );


    startGame(
      drawings,
      currentPuck
    );

  }


  // =========================================================
  // START FROM HOST
  // =========================================================

  function startFromHost(
    payload
  ) {

    if (!payload) {
      return;
    }


    if (
      state.host
    ) {

      return;

    }


    if (
      !payload.drawings
    ) {

      console.error(
        "[DRAW AIR HOCKEY] start drawing missing",
        payload
      );

      return;

    }


    const drawings = {

      host:
        payload.drawings.host,

      guest:
        payload.drawings.guest

    };


    console.log(
      "[DRAW AIR HOCKEY] received drawings",
      drawings
    );


    startGame(
      drawings,
      payload.currentPuck
    );

  }


  // =========================================================
  // GAME STATE
  // =========================================================

  function onGameState(
    payload
  ) {

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
  // REMOTE INPUT
  // =========================================================

  function onRemoteInput(
    payload
  ) {

    if (!payload) {
      return;
    }


    if (!state.host) {
      return;
    }


    if (!state.game) {
      return;
    }


    if (
      payload.from ===
      state.playerId
    ) {

      return;

    }


    state.game.applyRemoteMallet(
      payload
    );

  }


  // =========================================================
  // RESET
  // =========================================================

  function resetRound(
    payload
  ) {

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


    let code =
      "";


    for (
      let attempt = 0;
      attempt < 5;
      attempt++
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


      let success =
        false;


      let lastError =
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


          success =
            true;


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
          result.error.code ===
            "23505" ||
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


    if (
      code.length !== 5
    ) {

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
            result.error.code ===
              "23505" ||
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
                row.status ===
                  "matched" &&
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
      host,
      initialPuck
    ) {

      this.host =
        host;


      this.W =
        1000;


      this.H =
        500;


      this.lastSend =
        0;


      this.lastInputSend =
        0;


      this.collisionCooldown =
        new Map();


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


      this.scores =
        [0, 0];


      this.currentPuck =
        initialPuck === 0 ||
        initialPuck === 1
          ? initialPuck
          : 0;


      this.drawings =
        drawings;


      this.localSide =
        state.role === "host"
          ? 0
          : 1;


      this.roundPause =
        performance.now() +
        1000;


      this.makeArena();


      this.makePuck();


      this.makeMallets();


      this.bindInput();


      this.setupCollision();


      this.last =
        performance.now();


      console.log(
        "[DRAW AIR HOCKEY] GAME START",
        {
          host: this.host,
          localSide: this.localSide,
          drawings: this.drawings
        }
      );


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


      const goalH =
        260;


      const goalTop =
        this.H / 2 -
        goalH / 2;


      const goalBottom =
        this.H / 2 +
        goalH / 2;


      Matter.World.add(
        this.world,
        [

          // 上

          Matter.Bodies.rectangle(
            this.W / 2,
            -12,
            this.W,
            24,
            options
          ),


          // 下

          Matter.Bodies.rectangle(
            this.W / 2,
            this.H + 12,
            this.W,
            24,
            options
          ),


          // 左上

          Matter.Bodies.rectangle(
            -12,
            goalTop / 2,
            24,
            goalTop,
            options
          ),


          // 左下

          Matter.Bodies.rectangle(
            -12,
            (
              goalBottom +
              this.H
            ) / 2,
            24,
            this.H -
              goalBottom,
            options
          ),


          // 右上

          Matter.Bodies.rectangle(
            this.W + 12,
            goalTop / 2,
            24,
            goalTop,
            options
          ),


          // 右下

          Matter.Bodies.rectangle(
            this.W + 12,
            (
              goalBottom +
              this.H
            ) / 2,
            24,
            this.H -
              goalBottom,
            options
          )

        ]
      );


      this.goalW =
        goalH;

    }


    // =======================================================
    // GET DRAWING
    // =======================================================

    getDrawing(
      side,
      type
    ) {

      const player =
        side === 0
          ? this.drawings?.host
          : this.drawings?.guest;


      if (
        !player
      ) {

        return null;

      }


      return (
        player[type] ||
        null
      );

    }


    // =======================================================
    // STROKE → PHYSICS SHAPE
    // =======================================================

    makeStrokeVertices(
      drawing,
      scale
    ) {

      const polygon =
        drawing?.polygon;


      if (
        !Array.isArray(polygon) ||
        polygon.length < 2
      ) {

        return null;

      }


      const points =
        polygon.map(
          p => ({

            x:
              p.x * scale,

            y:
              p.y * scale

          })
        );


      const strokeNorm =
        Number(
          drawing.strokeWidthNorm
        ) || 0.025;


      const radius =
        Math.max(
          4,
          strokeNorm *
          scale *
          0.85
        );


      const left =
        [];


      const right =
        [];


      for (
        let i = 0;
        i < points.length;
        i++
      ) {

        const current =
          points[i];


        const previous =
          points[
            Math.max(
              0,
              i - 1
            )
          ];


        const next =
          points[
            Math.min(
              points.length - 1,
              i + 1
            )
          ];


        let dx =
          next.x -
          previous.x;


        let dy =
          next.y -
          previous.y;


        const len =
          Math.hypot(
            dx,
            dy
          ) || 1;


        dx /=
          len;


        dy /=
          len;


        const nx =
          -dy;


        const ny =
          dx;


        left.push({

          x:
            current.x +
            nx * radius,

          y:
            current.y +
            ny * radius

        });


        right.push({

          x:
            current.x -
            nx * radius,

          y:
            current.y -
            ny * radius

        });

      }


      const vertices =
        left.concat(
          right.reverse()
        );


      if (
        vertices.length < 3
      ) {

        return null;

      }


      return vertices;

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

      let body =
        null;


      if (
        drawing &&
        Array.isArray(
          drawing.polygon
        ) &&
        drawing.polygon.length >= 2
      ) {

        const vertices =
          this.makeStrokeVertices(
            drawing,
            scale
          );


        if (
          vertices &&
          vertices.length >= 3
        ) {

          try {

            body =
              Matter.Bodies.fromVertices(
                x,
                y,
                [vertices],
                {

                  restitution:
                    1,

                  friction:
                    0,

                  frictionStatic:
                    0,

                  frictionAir:
                    0.0001,

                  density:
                    0.001,

                  ...options

                },
                true,
                0.005,
                1,
                0.005
              );

          } catch (error) {

            console.warn(
              "[DRAW AIR HOCKEY] fromVertices error",
              error
            );

          }

        }

      }


      // フォールバック

      if (!body) {

        body =
          Matter.Bodies.circle(
            x,
            y,
            scale / 2,
            {

              restitution:
                1,

              friction:
                0,

              frictionAir:
                0.0001,

              ...options

            }
          );

      }


      body.drawData =
        drawing ||
        null;


      body.drawScale =
        scale;


      body.playerVelocity = {

        x:
          0,

        y:
          0

      };


      body._lastSample = {

        x:
          body.position.x,

        y:
          body.position.y

      };


      return body;

    }


    // =======================================================
    // PUCK
    // =======================================================

    makePuck() {

      const drawing =
        this.getDrawing(
          this.currentPuck,
          "puck"
        );


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


      this.puck.drawSide =
        this.currentPuck;


      this.puck.drawType =
        "puck";


      this.puck.isStatic =
        false;


      this.puck.friction =
        0;


      this.puck.frictionStatic =
        0;


      this.puck.frictionAir =
        0.0001;


      Matter.World.add(
        this.world,
        this.puck
      );

    }


    // =======================================================
    // MALLETS
    // =======================================================

    makeMallets() {

      this.mallets =
        [];


      for (
        let i = 0;
        i < 2;
        i++
      ) {

        const drawing =
          this.getDrawing(
            i,
            "mallet"
          );


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
                true,

              restitution:
                1,

              friction:
                0

            }
          );


        body.label =
          "mallet" + i;


        body.player =
          i;


        body.drawSide =
          i;


        body.drawType =
          "mallet";


        body.friction =
          0;


        body.restitution =
          1;


        body.playerVelocity = {

          x:
            0,

          y:
            0

        };


        body._lastSample = {

          x:
            body.position.x,

          y:
            body.position.y

        };


        this.mallets[i] =
          body;


        Matter.World.add(
          this.world,
          body
        );

      }


      this.targetMallet = {

        x:
          this.mallets[
            this.localSide
          ].position.x,

        y:
          this.mallets[
            this.localSide
          ].position.y

      };

    }


    // =======================================================
    // SAMPLE MALLET VELOCITY
    // =======================================================

    sampleMalletVelocity() {

      for (
        const mallet of
        this.mallets
      ) {

        const old =
          mallet._lastSample;


        const dx =
          mallet.position.x -
          old.x;


        const dy =
          mallet.position.y -
          old.y;


        mallet.playerVelocity = {

          x:
            Math.max(
              -30,
              Math.min(
                30,
                dx
              )
            ),

          y:
            Math.max(
              -30,
              Math.min(
                30,
                dy
              )
            )

        };


        mallet._lastSample = {

          x:
            mallet.position.x,

          y:
            mallet.position.y

        };

      }

    }


    // =======================================================
    // COLLISION
    // =======================================================

    setupCollision() {

      Matter.Events.on(
        this.engine,
        "collisionActive",
        event => {

          if (!this.host) {
            return;
          }


          for (
            const pair of event.pairs
          ) {

            const a =
              pair.collision.parentA;


            const b =
              pair.collision.parentB;


            let puck =
              null;


            let mallet =
              null;


            if (
              a?.label === "puck" &&
              String(
                b?.label || ""
              ).startsWith(
                "mallet"
              )
            ) {

              puck =
                a;

              mallet =
                b;

            }


            else if (
              b?.label === "puck" &&
              String(
                a?.label || ""
              ).startsWith(
                "mallet"
              )
            ) {

              puck =
                b;

              mallet =
                a;

            }


            if (
              !puck ||
              !mallet
            ) {

              continue;

            }


            this.handleMalletCollision(
              puck,
              mallet,
              pair.collision
            );

          }

        }
      );

    }


    // =======================================================
    // MALLET COLLISION
    // =======================================================

    handleMalletCollision(
      puck,
      mallet,
      collision
    ) {

      const now =
        performance.now();


      const previous =
        this.collisionCooldown.get(
          mallet.id
        ) || 0;


      if (
        now -
        previous <
        55
      ) {

        return;

      }


      /*
        Matter の法線を
        マレット → パック
        に統一
      */

      let nx =
        collision.normal.x;


      let ny =
        collision.normal.y;


      if (
        collision.parentA ===
        puck
      ) {

        nx =
          -nx;

        ny =
          -ny;

      }


      const centerDx =
        puck.position.x -
        mallet.position.x;


      const centerDy =
        puck.position.y -
        mallet.position.y;


      if (
        centerDx * nx +
        centerDy * ny <
        0
      ) {

        nx =
          -nx;

        ny =
          -ny;

      }


      const mv =
        mallet.playerVelocity ||
        {
          x: 0,
          y: 0
        };


      /*
        パック速度
        - マレット速度
      */

      const rvx =
        puck.velocity.x -
        mv.x;


      const rvy =
        puck.velocity.y -
        mv.y;


      const approach =
        rvx * nx +
        rvy * ny;


      /*
        外へ向かっているだけなら
        二重反射しない。

        ただしマレットを動かしている
        場合は打撃として処理する。
      */

      const malletSpeed =
        Math.hypot(
          mv.x,
          mv.y
        );


      if (
        approach > 0 &&
        malletSpeed < 1
      ) {

        return;

      }


      /*
        法線反射
      */

      let vx =
        rvx -
        2 *
        approach *
        nx;


      let vy =
        rvy -
        2 *
        approach *
        ny;


      /*
        マレットの移動速度を
        パックに伝える。
      */

      vx +=
        mv.x *
        0.85;


      vy +=
        mv.y *
        0.85;


      /*
        速度が弱すぎる場合、
        法線方向へ最低速度を与える。
      */

      let speed =
        Math.hypot(
          vx,
          vy
        );


      const minimumSpeed =
        Math.max(
          8,
          malletSpeed *
          0.7
        );


      if (
        speed <
        minimumSpeed
      ) {

        vx +=
          nx *
          (
            minimumSpeed -
            speed
          );


        vy +=
          ny *
          (
            minimumSpeed -
            speed
          );


        speed =
          Math.hypot(
            vx,
            vy
          );

      }


      /*
        最大速度
      */

      const maximumSpeed =
        28;


      if (
        speed >
        maximumSpeed
      ) {

        const ratio =
          maximumSpeed /
          speed;


        vx *=
          ratio;


        vy *=
          ratio;

      }


      /*
        パックを少し押し出す。
      */

      Matter.Body.setPosition(
        puck,
        {

          x:
            puck.position.x +
            nx * 3,

          y:
            puck.position.y +
            ny * 3

        },
        false
      );


      Matter.Body.setVelocity(
        puck,
        {
          x:
            vx,

          y:
            vy
        }
      );


      /*
        打った方向によって
        少し回転させる。
      */

      const tangentX =
        -ny;


      const tangentY =
        nx;


      const tangent =
        mv.x *
          tangentX +
        mv.y *
          tangentY;


      puck.angularVelocity =
        tangent *
        0.004;


      this.collisionCooldown.set(
        mallet.id,
        now
      );

    }


    // =======================================================
    // RESET PUCK
    // =======================================================

    resetPuck(
      nextPlayer,
      velocity = null
    ) {

      if (this.puck) {

        Matter.World.remove(
          this.world,
          this.puck
        );

      }


      this.currentPuck =
        nextPlayer === 0 ||
        nextPlayer === 1
          ? nextPlayer
          : 0;


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


      const launch =
        velocity || {

          x:
            (
              Math.random() <
              0.5
                ? -1
                : 1
            ) * 7,

          y:
            (
              Math.random() -
              0.5
            ) * 5

        };


      Matter.Body.setVelocity(
        this.puck,
        launch
      );


      Matter.Body.setAngularVelocity(
        this.puck,
        0
      );


      this.roundPause =
        performance.now() +
        900;

    }


    // =======================================================
    // SCORE
    // =======================================================

    score(
      side
    ) {

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
        this.scores[side] >=
        5
      ) {

        this.finish(
          side
        );


        return;

      }


      const nextPlayer =
        1 -
        this.currentPuck;


      const vx =
        (
          Math.random() <
          0.5
            ? -1
            : 1
        ) * 7;


      const vy =
        (
          Math.random() -
          0.5
        ) * 5;


      this.resetPuck(
        nextPlayer,
        {
          x:
            vx,
          y:
            vy
        }
      );


      send(
        "reset",
        {

          scores:
            this.scores,

          currentPuck:
            this.currentPuck,

          velocity:
            {
              x:
                vx,

              y:
                vy
            }

        }
      );

    }


    // =======================================================
    // FINISH
    // =======================================================

    finish(
      side
    ) {

      state.running =
        false;


      setText(
        "resultTitle",
        side === this.localSide
          ? "WIN!"
          : "LOSE…"
      );


      show(
        "result"
      );


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
    // REMOTE STATE
    // =======================================================

    applyRemote(
      payload
    ) {

      if (!payload) {
        return;
      }


      if (
        payload.final
      ) {

        state.running =
          false;


        show(
          "result"
        );


        setText(
          "resultTitle",
          payload.winner ===
            this.localSide
            ? "WIN!"
            : "LOSE…"
        );


        return;

      }


      /*
        パックの種類変更
      */

      if (
        (
          payload.currentPuck === 0 ||
          payload.currentPuck === 1
        ) &&
        payload.currentPuck !==
        this.currentPuck
      ) {

        this.resetPuckVisualOnly(
          payload.currentPuck
        );

      }


      if (
        payload.puck &&
        this.puck
      ) {

        Matter.Body.setPosition(
          this.puck,
          payload.puck.pos,
          false
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


      /*
        ホストマレットを
        ゲスト側へ同期
      */

      if (
        Array.isArray(
          payload.mallets
        )
      ) {

        for (
          let i = 0;
          i < 2;
          i++
        ) {

          if (
            i === this.localSide
          ) {

            continue;

          }


          const remote =
            payload.mallets[i];


          if (!remote) {
            continue;
          }


          const body =
            this.mallets[i];


          const dx =
            remote.x -
            body.position.x;


          const dy =
            remote.y -
            body.position.y;


          body.playerVelocity = {

            x:
              dx,

            y:
              dy

          };


          Matter.Body.setPosition(
            body,
            {
              x:
                remote.x,

              y:
                remote.y
            },
            false
          );


          body._lastSample = {

            x:
              remote.x,

            y:
              remote.y

          };

        }

      }


      if (
        Array.isArray(
          payload.scores
        )
      ) {

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
    // REMOTE MALLET
    // =======================================================

    applyRemoteMallet(
      payload
    ) {

      if (
        !payload.position
      ) {

        return;

      }


      const side =
        Number(
          payload.side
        );


      /*
        ゲストは右側
      */

      if (
        side !== 1
      ) {

        return;

      }


      const body =
        this.mallets[1];


      if (!body) {
        return;
      }


      const x =
        Number(
          payload.position.x
        );


      const y =
        Number(
          payload.position.y
        );


      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {

        return;

      }


      const oldX =
        body.position.x;


      const oldY =
        body.position.y;


      body.playerVelocity = {

        x:
          x -
          oldX,

        y:
          y -
          oldY

      };


      Matter.Body.setPosition(
        body,
        {
          x:
            x,

          y:
            y
        },
        false
      );


      body._lastSample = {

        x:
          x,

        y:
          y

      };

    }


    // =======================================================
    // REMOTE RESET
    // =======================================================

    remoteReset(
      payload
    ) {

      if (!payload) {
        return;
      }


      this.scores =
        Array.isArray(
          payload.scores
        )
          ? payload.scores
          : [0, 0];


      setText(
        "score1",
        this.scores[0]
      );


      setText(
        "score2",
        this.scores[1]
      );


      this.resetPuck(
        payload.currentPuck,
        payload.velocity || null
      );

    }


    // =======================================================
    // PUCK VISUAL RESET
    // =======================================================

    resetPuckVisualOnly(
      nextPlayer
    ) {

      if (this.puck) {

        Matter.World.remove(
          this.world,
          this.puck
        );

      }


      this.currentPuck =
        nextPlayer;


      this.makePuck();

    }


    // =======================================================
    // INPUT
    // =======================================================

    bindInput() {

      const canvas =
        this.canvas;


      canvas.style.touchAction =
        "none";


      let dragging =
        false;


      let activePointerId =
        null;


      const move =
        event => {

          if (
            !dragging
          ) {

            return;

          }


          if (
            activePointerId !== null &&
            event.pointerId !== undefined &&
            event.pointerId !==
              activePointerId
          ) {

            return;

          }


          event.preventDefault();


          const rect =
            canvas.getBoundingClientRect();


          if (
            rect.width <= 0 ||
            rect.height <= 0
          ) {

            return;

          }


          const x =
            (
              event.clientX -
              rect.left
            )
            *
            this.W /
            rect.width;


          const y =
            (
              event.clientY -
              rect.top
            )
            *
            this.H /
            rect.height;


          const side =
            this.localSide;


          const minX =
            side === 0
              ? 45
              : this.W / 2 + 45;


          const maxX =
            side === 0
              ? this.W / 2 - 45
              : this.W - 45;


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


          const body =
            this.mallets[side];


          if (!body) {
            return;
          }


          Matter.Body.setPosition(
            body,
            {
              x:
                clampedX,

              y:
                clampedY
            },
            false
          );


          this.targetMallet = {

            x:
              clampedX,

            y:
              clampedY

          };

        };


      const start =
        event => {

          event.preventDefault();


          dragging =
            true;


          activePointerId =
            event.pointerId ??
            null;


          try {

            canvas.setPointerCapture(
              event.pointerId
            );

          } catch (_) {}


          move(
            event
          );

        };


      const end =
        event => {

          if (
            event &&
            activePointerId !== null &&
            event.pointerId !== undefined &&
            event.pointerId !==
              activePointerId
          ) {

            return;

          }


          dragging =
            false;


          activePointerId =
            null;

        };


      canvas.addEventListener(
        "pointerdown",
        start,
        {
          passive:
            false
        }
      );


      canvas.addEventListener(
        "pointermove",
        move,
        {
          passive:
            false
        }
      );


      canvas.addEventListener(
        "pointerup",
        end
      );


      canvas.addEventListener(
        "pointercancel",
        end
      );


      /*
        pointer capture が外れても
        ドラッグを継続できるようにする。
      */

      window.addEventListener(
        "pointermove",
        event => {

          if (
            dragging
          ) {

            move(
              event
            );

          }

        },
        {
          passive:
            false
        }
      );


      window.addEventListener(
        "pointerup",
        end
      );


      window.addEventListener(
        "pointercancel",
        end
      );

    }


    // =======================================================
    // LOOP
    // =======================================================

    loop(
      time
    ) {

      if (
        !state.running
      ) {

        return;

      }


      const dt =
        Math.min(
          32,
          Math.max(
            1,
            time -
            this.last
          )
        );


      this.last =
        time;


      /*
        マレット移動速度を計測
      */

      this.sampleMalletVelocity();


      // =====================================================
      // HOST PHYSICS
      // =====================================================

      if (
        this.host
      ) {

        if (
          !this.roundPause ||
          time >
            this.roundPause
        ) {

          Matter.Engine.update(
            this.engine,
            dt
          );

        }


        const x =
          this.puck.position.x;


        /*
          左ゴール
        */

        if (
          x <
          -30
        ) {

          this.score(
            1
          );


          return;

        }


        /*
          右ゴール
        */

        if (
          x >
          this.W +
          30
        ) {

          this.score(
            0
          );


          return;

        }


        /*
          上下壁の安全補正
        */

        if (
          this.puck.position.y <
            25
        ) {

          Matter.Body.setPosition(
            this.puck,
            {
              x:
                this.puck.position.x,

              y:
                25
            },
            false
          );


          if (
            this.puck.velocity.y <
            0
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

        }


        if (
          this.puck.position.y >
            this.H -
            25
        ) {

          Matter.Body.setPosition(
            this.puck,
            {
              x:
                this.puck.position.x,

              y:
                this.H -
                  25
            },
            false
          );


          if (
            this.puck.velocity.y >
            0
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

        }


        // ===================================================
        // SEND GAME STATE
        // ===================================================

        if (
          time -
          this.lastSend >
          25
        ) {

          send(
            "state",
            {

              puck: {

                pos:
                  {
                    x:
                      this.puck.position.x,

                    y:
                      this.puck.position.y
                  },

                vel:
                  {
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
                  mallet => ({

                    x:
                      mallet.position.x,

                    y:
                      mallet.position.y

                  })
                ),


              scores:
                this.scores,


              currentPuck:
                this.currentPuck

            }
          );


          this.lastSend =
            time;

        }

      }


      // =====================================================
      // GUEST SEND MALLET
      // =====================================================

      if (
        !this.host &&
        time -
        this.lastInputSend >
        25
      ) {

        const mallet =
          this.mallets[
            this.localSide
          ];


        if (mallet) {

          send(
            "input",
            {

              side:
                this.localSide,

              position:
                {
                  x:
                    mallet.position.x,

                  y:
                    mallet.position.y
                }

            }
          );

        }


        this.lastInputSend =
          time;

      }


      // =====================================================
      // DRAW
      // =====================================================

      this.draw();


      requestAnimationFrame(
        nextTime =>
          this.loop(
            nextTime
          )
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


      // MALLETS

      this.mallets.forEach(
        mallet => {

          this.drawPlayerShape(
            mallet
          );

        }
      );


      // PUCK

      this.drawPlayerShape(
        this.puck
      );

    }


    // =======================================================
    // DRAW PLAYER SHAPE
    // =======================================================

    drawPlayerShape(
      body
    ) {

      const c =
        this.ctx;


      /*
        ★ 重要

        body.drawDataだけを信用しない。

        body.drawSide / drawType から
        現在の描画データを直接取得する。
      */

      let drawing =
        body.drawData;


      if (
        body.drawType &&
        (
          body.drawSide === 0 ||
          body.drawSide === 1
        )
      ) {

        drawing =
          this.getDrawing(
            body.drawSide,
            body.drawType
          ) ||
          drawing;

      }


      if (
        !drawing ||
        !Array.isArray(
          drawing.polygon
        ) ||
        drawing.polygon.length < 2
      ) {

        /*
          本当に描画データがない場合のみ
          円を表示。
        */

        c.save();


        c.translate(
          body.position.x,
          body.position.y
        );


        c.rotate(
          body.angle
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
        描いた線をそのまま表示。

        勝手に閉じない。
        塗りつぶさない。
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
              drawing.width ||
              6
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

  function startGame(
    drawings,
    initialPuck
  ) {

    if (
      state.running
    ) {

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


      msg(
        "描画データの同期に失敗しました。"
      );


      return;

    }


    try {

      /*
        drawing data確認
      */

      console.log(
        "[DRAW AIR HOCKEY] START DRAWINGS",
        {
          host:
            drawings.host,

          guest:
            drawings.guest,

          currentPuck:
            initialPuck
        }
      );


      state.running =
        true;


      state.game =
        new AirGame(
          drawings,
          state.host,
          initialPuck
        );


      /*
        先にゲーム画面を表示
      */

      show(
        "game"
      );


      setText(
        "roundMsg",
        "先に5点！"
      );


      /*
        ホストだけ最初のパックを発射
      */

      if (
        state.host
      ) {

        setTimeout(
          () => {

            if (
              !state.game ||
              !state.running
            ) {

              return;

            }


            Matter.Body.setVelocity(
              state.game.puck,
              {

                x:
                  (
                    Math.random() <
                    0.5
                      ? -1
                      : 1
                  ) * 7,

                y:
                  (
                    Math.random() -
                    0.5
                  ) * 5

              }
            );

          },
          1000
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


        /*
          先に相手がREADYしていた場合
        */

        if (
          state.host &&
          state.opponent?.ready &&
          state.opponent?.drawings
        ) {

          startMatch(
            state.opponent.drawings
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
