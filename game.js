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


  // poly-decomp が存在する場合は登録
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


        // 物理形状用
        strokeWidthNorm:
          currentWidth /
          normalizationScale

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
      (minX + maxX) /
      2;


    const centerY =
      (minY + maxY) /
      2;


    const scale =
      Math.max(
        maxX - minX,
        maxY - minY
      )
      || 1;


    // 以前の28点よりも形状を残す
    const step =
      Math.max(
        1,
        Math.ceil(
          points.length /
          60
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
            )
            /
            scale,


          y:
            (
              point.y -
              centerY
            )
            /
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


    // GUEST INPUT

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
    // SUPABASE SUBSCRIBE
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


    // HOST

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

      const drawings = {

        host:
          state.drawings,


        guest:
          payload.drawings

      };


      // ホストが最初のパック所有者を決定
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
            currentPuck,


          seed:
            Math.random()

        }
      );


      startGame(
        drawings,
        currentPuck
      );

    }

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


    if (!payload.drawings) {
      return;
    }


    // HOST自身は無視

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


      window.addEventListener(
        "resize",
        () =>
          this.resize()
      );


      this.scores =
        [0, 0];


      this.currentPuck =
        Number.isInteger(
          initialPuck
        )
          ? initialPuck
          : (
              Math.random() < 0.5
                ? 0
                : 1
            );


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


      this.setupCollision();


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
    // GET DRAWING
    // =======================================================

    getDrawing(
      side,
      type
    ) {

      const player =
        side === 0
          ? this.drawings.host
          : this.drawings.guest;


      return (
        player &&
        player[type]
      )
      || null;

    }


    // =======================================================
    // THICK STROKE
    //
    // 描いた線を「太さのある閉じた物理形状」にする
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
        )
        || 0.025;


      /*
        最低4px程度の物理的な太さを確保。

        ただし描画した線の太さも反映する。
      */

      const radius =
        Math.max(
          3,
          strokeNorm *
          scale *
          0.75
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


        const length =
          Math.hypot(
            dx,
            dy
          )
          || 1;


        dx /=
          length;


        dy /=
          length;


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


      /*
        左側を進んで、
        右側を逆方向に戻って閉じる。
      */

      const vertices =
        left.concat(
          right.reverse()
        );


      if (
        vertices.length < 3
      ) {

        return null;

      }


      /*
        Matter.js が要求する
        clockwise order に合わせる。
      */

      if (
        Matter.Vertices &&
        Matter.Vertices.isClockwise &&
        !Matter.Vertices.isClockwise(
          vertices
        )
      ) {

        vertices.reverse();

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

      const polygon =
        drawing?.polygon;


      let body =
        null;


      if (
        drawing &&
        Array.isArray(polygon) &&
        polygon.length >= 2
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
                    0.0005,


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
              "[DRAW AIR HOCKEY] fromVertices failed:",
              error
            );

          }

        }

      }


      /*
        物理形状を作れなかった場合だけ
        円にフォールバック。
      */

      if (
        !body
      ) {

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
                0.0005,


              ...options

            }
          );

      }


      /*
        描画データは物理BODYとは別に保持。
      */

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


      return body;

    }


    // =======================================================
    // PUCK
    // =======================================================

    makePuck() {

      /*
        ★ 修正点

        this.drawings[0] ではなく

        host / guest

        から取得する。
      */

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


      /*
        パックは動的BODY。
      */

      this.puck.isStatic =
        false;


      /*
        エアホッケーなので摩擦を極小に。
      */

      this.puck.friction =
        0;


      this.puck.frictionStatic =
        0;


      this.puck.frictionAir =
        0.0003;


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

              /*
                マレットは静的BODY。

                実際の反射は下の
                collisionActive で処理する。
              */

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


        this.mallets[i] =
          body;


        Matter.World.add(
          this.world,
          body
        );

      }


      /*
        ローカルマレットの初期位置
      */

      this.targetMallet =
        {

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

            const bodyA =
              pair.collision.parentA;


            const bodyB =
              pair.collision.parentB;


            let puck =
              null;


            let mallet =
              null;


            if (
              bodyA &&
              bodyB
            ) {

              if (
                bodyA.label === "puck" &&
                String(
                  bodyB.label
                ).startsWith(
                  "mallet"
                )
              ) {

                puck =
                  bodyA;

                mallet =
                  bodyB;

              }


              if (
                bodyB.label === "puck" &&
                String(
                  bodyA.label
                ).startsWith(
                  "mallet"
                )
              ) {

                puck =
                  bodyB;

                mallet =
                  bodyA;

              }

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
    // MALLET COLLISION RESPONSE
    // =======================================================

    handleMalletCollision(
      puck,
      mallet,
      collision
    ) {

      const now =
        performance.now();


      const key =
        mallet.id;


      const previous =
        this.collisionCooldown.get(
          key
        )
        || 0;


      /*
        同じ接触で毎フレーム
        何度も跳ねさせない。
      */

      if (
        now -
        previous <
        70
      ) {

        return;

      }


      this.collisionCooldown.set(
        key,
        now
      );


      /*
        collision.normal は
        A → B の方向なので、

        「マレットからパックへ」

        の方向に変換する。
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


      /*
        念のため、
        本当にマレット→パック方向か確認。
      */

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


      const malletVelocity =
        mallet.playerVelocity ||
        {
          x: 0,
          y: 0
        };


      /*
        パックとマレットの相対速度。
      */

      const relativeVelocity = {

        x:
          puck.velocity.x -
          malletVelocity.x,


        y:
          puck.velocity.y -
          malletVelocity.y

      };


      const approach =
        relativeVelocity.x * nx +
        relativeVelocity.y * ny;


      /*
        すでに外側へ逃げている場合は
        もう一度反射させない。
      */

      if (
        approach > 0
      ) {

        return;

      }


      /*
        相対速度を法線に対して反射。

        これが「描いた形状の面によって
        跳ね返る角度が変わる」部分。
      */

      let reflected = {

        x:
          relativeVelocity.x -
          2 *
          approach *
          nx,


        y:
          relativeVelocity.y -
          2 *
          approach *
          ny

      };


      /*
        マレット自身の移動速度を加える。

        速く振って当てるほど
        パックが強く飛ぶ。
      */

      reflected.x +=
        malletVelocity.x *
        0.65;


      reflected.y +=
        malletVelocity.y *
        0.65;


      /*
        反射後の速度。
      */

      let speed =
        Math.hypot(
          reflected.x,
          reflected.y
        );


      /*
        遅い衝突でもパックが止まらないようにする。
      */

      const minimumSpeed =
        Math.max(
          6.5,
          Math.hypot(
            malletVelocity.x,
            malletVelocity.y
          ) *
          0.45
        );


      if (
        speed <
        minimumSpeed
      ) {

        reflected.x =
          nx *
          minimumSpeed;


        reflected.y =
          ny *
          minimumSpeed;


        speed =
          minimumSpeed;

      }


      /*
        あまりに速くなりすぎないよう制限。
      */

      const maximumSpeed =
        24;


      if (
        speed >
        maximumSpeed
      ) {

        const ratio =
          maximumSpeed /
          speed;


        reflected.x *=
          ratio;


        reflected.y *=
          ratio;

      }


      /*
        少しだけ押し出して
        めり込みによる停止を防ぐ。
      */

      Matter.Body.setPosition(
        puck,
        {

          x:
            puck.position.x +
            nx * 2,


          y:
            puck.position.y +
            ny * 2

        }
      );


      Matter.Body.setVelocity(
        puck,
        reflected
      );


      /*
        形状による回転も少し反映。
      */

      const tangentX =
        -ny;


      const tangentY =
        nx;


      const tangentSpeed =
        malletVelocity.x *
          tangentX +
        malletVelocity.y *
          tangentY;


      puck.angularVelocity +=
        tangentSpeed *
        0.002;

    }


    // =======================================================
    // RESET PUCK
    // =======================================================

    resetPuck(
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
              Math.random() <
              0.5
                ? -1
                : 1
            ) *
            7,


          y:
            (
              Math.random() -
              0.5
            ) *
            5

        }
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


      this.resetPuck(
        1 -
        this.currentPuck
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
    // REMOTE GAME STATE
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
        パックの持ち主が変わった場合、
        ゲスト側の描画も同期。
      */

      if (
        Number.isInteger(
          payload.currentPuck
        ) &&
        payload.currentPuck !==
          this.currentPuck
      ) {

        this.resetPuckVisualOnly(
          payload.currentPuck
        );

      }


      if (
        payload.puck
      ) {

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


      /*
        ゲスト側では
        相手＝ホストのマレットだけ同期。
      */

      if (
        payload.mallets
      ) {

        for (
          let i = 0;
          i < 2;
          i++
        ) {

          if (
            payload.mallets[i] &&
            i !== this.localSide
          ) {

            const body =
              this.mallets[i];


            const oldX =
              body.position.x;


            const oldY =
              body.position.y;


            const newX =
              payload.mallets[i].x;


            const newY =
              payload.mallets[i].y;


            body.playerVelocity = {

              x:
                newX -
                oldX,


              y:
                newY -
                oldY

            };


            Matter.Body.setPosition(
              body,
              {

                x:
                  newX,


                y:
                  newY

              }
            );

          }

        }

      }


      if (
        payload.scores
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


      if (
        side !== 1
      ) {

        return;

      }


      const body =
        this.mallets[side];


      if (!body) {
        return;
      }


      const oldX =
        body.position.x;


      const oldY =
        body.position.y;


      const newX =
        payload.position.x;


      const newY =
        payload.position.y;


      body.playerVelocity = {

        x:
          newX -
          oldX,


        y:
          newY -
          oldY

      };


      Matter.Body.setPosition(
        body,
        {

          x:
            newX,


          y:
            newY

        }
      );

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
    // PUCK VISUAL RESET
    // =======================================================

    resetPuckVisualOnly(
      nextPlayer
    ) {

      Matter.World.remove(
        this.world,
        this.puck
      );


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
            *
            this.W
            /
            rect.width;


          const y =
            (
              event.clientY -
              rect.top
            )
            *
            this.H
            /
            rect.height;


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


          const body =
            this.mallets[side];


          const dx =
            clampedX -
            body.position.x;


          const dy =
            clampedY -
            body.position.y;


          /*
            マレットの移動速度を保存。

            これがパックへの
            「打撃力」になる。
          */

          body.playerVelocity = {

            x:
              Math.max(
                -25,
                Math.min(
                  25,
                  dx
                )
              ),


            y:
              Math.max(
                -25,
                Math.min(
                  25,
                  dy
                )
              )

          };


          Matter.Body.setPosition(
            body,
            {

              x:
                clampedX,


              y:
                clampedY

            }
          );


          this.targetMallet = {

            x:
              clampedX,


            y:
              clampedY

          };

        };


      canvas.onpointerdown =
        event => {

          dragging =
            true;


          move(
            event
          );


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

          dragging =
            false;

        };


      canvas.onpointercancel =
        () => {

          dragging =
            false;

        };

    }


    // =======================================================
    // LOOP
    // =======================================================

    loop(
      time
    ) {

      if (!state.running) {
        return;
      }


      const dt =
        Math.min(
          32,
          time -
          this.last
        );


      this.last =
        time;


      // =====================================================
      // HOST PHYSICS
      // =====================================================

      if (this.host) {

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


        // 左ゴール

        if (
          x <
          -25
        ) {

          this.score(
            1
          );


          return;

        }


        // 右ゴール

        if (
          x >
          this.W +
          25
        ) {

          this.score(
            0
          );


          return;

        }


        /*
          上下壁から外れないように補正。
        */

        if (
          this.puck.position.y <
            30 ||
          this.puck.position.y >
            this.H -
            30
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


        // ===================================================
        // SEND GAME STATE
        // ===================================================

        if (
          time -
          this.lastSend >
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
      // GUEST SENDS MALLET INPUT
      // =====================================================

      if (
        !this.host &&
        time -
        this.lastInputSend >
        30
      ) {

        const mallet =
          this.mallets[
            this.localSide
          ];


        send(
          "input",
          {

            side:
              this.localSide,


            position:
              mallet.position

          }
        );


        this.lastInputSend =
          time;

      }


      // =====================================================
      // DECAY MALLET VELOCITY
      // =====================================================

      this.mallets.forEach(
        mallet => {

          mallet.playerVelocity.x *=
            0.82;


          mallet.playerVelocity.y *=
            0.82;

        }
      );


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
        this.W -
          20,
        this.H -
          20
      );


      // CENTER LINE

      c.beginPath();


      c.moveTo(
        this.W / 2,
        10
      );


      c.lineTo(
        this.W / 2,
        this.H -
          10
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
        this.H / 2 -
          130,
        18,
        260
      );


      c.fillRect(
        this.W -
          18,
        this.H / 2 -
          130,
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
        polygon.length <
        2
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
        今まで通り

        ・塗りつぶさない
        ・勝手に閉じない
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


      return;

    }


    try {

      /*
        ★ 重要

        AirGame が constructor 内で
        requestAnimationFrame を開始するので、
        running を先に true にする。
      */

      state.running =
        true;


      state.game =
        new AirGame(
          drawings,
          state.host,
          initialPuck
        );


      show(
        "game"
      );


      setText(
        "roundMsg",
        "先に5点！"
      );


      /*
        最初のパックだけ
        ホストが打ち出す。
      */

      if (
        state.host
      ) {

        Matter.Body.setVelocity(
          state.game.puck,
          {

            x:
              (
                Math.random() <
                0.5
                  ? -1
                  : 1
              ) *
              7,


            y:
              (
                Math.random() -
                0.5
              ) *
              5

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


        /*
          HOSTがすでに相手のREADYを
          受け取っていた場合。
        */

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
                currentPuck,


              seed:
                Math.random()

            }
          );


          startGame(
            drawings,
            currentPuck
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
