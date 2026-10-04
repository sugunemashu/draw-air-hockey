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
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_URL.includes("supabase.co") &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_ANON_KEY.includes("YOUR-");


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
  // UI
  // =========================================================

  function msg(text) {

    $("menuMsg").textContent = text;

  }


  function status(text) {

    $("status").textContent = text;

  }


  function show(id) {

    [
      "menu",
      "draw",
      "game",
      "result"
    ].forEach(x => {

      $(x).classList.toggle(
        "hidden",
        x !== id
      );

    });

  }



  // =========================================================
  // DRAWING SYSTEM
  // =========================================================

  function setupPad(canvasId, key) {

    const canvas = $(canvasId);

    const ctx = canvas.getContext("2d");


    const colorInput =
      $(`${key}Color`);

    const widthInput =
      $(`${key}Width`);

    const widthValue =
      $(`${key}WidthValue`);


    let drawing = false;

    let points = [];


    function getPosition(e) {

      const r =
        canvas.getBoundingClientRect();

      return {

        x:
          (e.clientX - r.left)
          * canvas.width
          / r.width,

        y:
          (e.clientY - r.top)
          * canvas.height
          / r.height

      };

    }


    function drawLine() {

      if (points.length < 2) {
        return;
      }


      ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );


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


      /*
        最後に最初の点へ戻す。

        これによって、
        描いた線が閉じた形になる。
      */

      ctx.closePath();


      ctx.strokeStyle =
        colorInput.value;

      ctx.lineWidth =
        Number(widthInput.value);

      ctx.lineCap = "round";

      ctx.lineJoin = "round";

      ctx.stroke();

    }


    function down(e) {

      e.preventDefault();

      drawing = true;

      points = [
        getPosition(e)
      ];

      canvas.setPointerCapture(
        e.pointerId
      );

      drawLine();

    }


    function move(e) {

      if (!drawing) {
        return;
      }

      e.preventDefault();


      points.push(
        getPosition(e)
      );


      drawLine();

    }


    function up(e) {

      if (!drawing) {
        return;
      }


      drawing = false;


      if (points.length >= 3) {

        const polygon =
          normalizePolygon(
            points,
            canvas.width,
            canvas.height
          );


        /*
          描いた線そのものを保存する。

          以前は polygon だけ保存していたため、
          ゲーム画面で色付きの物理図形が
          描画されてしまっていた。

          今回は、

          polygon
          color
          width

          をセットで保存する。
        */

        state.drawings[key] = {

          polygon,

          color:
            colorInput.value,

          width:
            Number(widthInput.value),

          /*
            描画データの基準サイズ。

            ゲーム中にこのサイズを基準として
            実際のマレット・パックを描画する。
          */

          sourceWidth:
            canvas.width,

          sourceHeight:
            canvas.height

        };

      }

    }


    canvas.addEventListener(
      "pointerdown",
      down
    );


    canvas.addEventListener(
      "pointermove",
      move
    );


    canvas.addEventListener(
      "pointerup",
      up
    );


    canvas.addEventListener(
      "pointercancel",
      up
    );


    colorInput.addEventListener(
      "input",
      () => {

        widthValue.textContent =
          widthInput.value + "px";

        drawLine();

      }
    );


    widthInput.addEventListener(
      "input",
      () => {

        widthValue.textContent =
          widthInput.value + "px";

        drawLine();

      }
    );


    $(`[data-clear="${key}"]`)
      .onclick = () => {

        ctx.clearRect(
          0,
          0,
          canvas.width,
          canvas.height
        );

        points = [];

        state.drawings[key] = null;

      };

  }



  /*
    描いた線を物理計算用の座標へ変換。

    - 中心を0,0にする
    - 最大サイズを1にする

    これにより、
    ゲーム画面上で好きなサイズに
    拡大縮小できる。
  */

  function normalizePolygon(
    points,
    width,
    height
  ) {

    const minX =
      Math.min(
        ...points.map(p => p.x)
      );

    const maxX =
      Math.max(
        ...points.map(p => p.x)
      );


    const minY =
      Math.min(
        ...points.map(p => p.y)
      );

    const maxY =
      Math.max(
        ...points.map(p => p.y)
      );


    const cx =
      (minX + maxX) / 2;


    const cy =
      (minY + maxY) / 2;


    const scale =
      Math.max(
        maxX - minX,
        maxY - minY
      ) || 1;


    /*
      最大28点まで。

      物理計算を重くしすぎないため。
    */

    const step =
      Math.max(
        1,
        Math.ceil(points.length / 28)
      );


    return points

      .filter(
        (_, i) => i % step === 0
      )

      .map(p => ({

        x:
          (p.x - cx) / scale,

        y:
          (p.y - cy) / scale

      }));

  }


  setupPad(
    "puckCanvas",
    "puck"
  );


  setupPad(
    "malletCanvas",
    "mallet"
  );



  // =========================================================
  // SUPABASE
  // =========================================================

  async function openChannel(room) {

    if (!supa) {

      throw new Error(
        "Supabase未設定"
      );

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


    const res =
      await state.channel.subscribe();


    if (res !== "SUBSCRIBED") {

      throw new Error(
        "通信チャンネルに接続できません"
      );

    }

  }



  function send(event, payload) {

    if (!state.channel) {
      return;
    }


    state.channel.send({

      type: "broadcast",

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

  function onSignal(p) {

    if (
      !p ||
      p.from === state.playerId
    ) {

      return;

    }


    /*
      ★重要修正

      以前は、

        hostがguestからsignalを受信
        ↓
        role = guest
        host = false

      となっていた。

      これが、

      ・自分のマレットが消える
      ・相手マレットが自陣へ来る
      ・左右が逆になる

      原因の一つ。

      ホストは絶対にhostのままにする。
    */


    if (state.host) {

      state.opponent = {

        ...(state.opponent || {}),

        ...p

      };


      status(
        "対戦相手が接続しました"
      );


      return;

    }


    /*
      guest側。

      guestはsignalを受け取った場合、
      相手がhostだと判断。
    */

    state.opponent = {

      ...(state.opponent || {}),

      ...p

    };


    state.role = "guest";

    state.host = false;

    state.ready = false;


    show("draw");


    status(
      "対戦相手が見つかりました"
    );

  }



  // =========================================================
  // READY
  // =========================================================

  function onReady(p) {

    if (
      p.from === state.playerId
    ) {

      return;

    }


    state.opponent = {

      ...(state.opponent || {}),

      ...p,

      ready: true

    };


    /*
      ホストだけがゲーム開始を決定する。
    */

    if (
      state.host &&
      state.ready
    ) {

      const drawings = {

        host:
          state.drawings,

        guest:
          p.drawings

      };


      send(
        "start",
        {
          drawings,
          seed: Math.random()
        }
      );


      startGame(drawings);

    }

  }



  // =========================================================
  // START
  // =========================================================

  function startFromHost(p) {

    if (!p || !p.drawings) {
      return;
    }


    /*
      guest側はホストから

        hostの描画

      を受け取る。


      自分の描画は既に

        state.drawings

      にある。
    */

    if (state.role === "guest") {

      const drawings = {

        host:
          p.drawings.host,

        guest:
          p.drawings.guest

      };


      state.opponent = {

        ...(state.opponent || {}),

        drawings:
          p.drawings.host

      };


      startGame(drawings);

    }

  }



  // =========================================================
  // GAME STATE
  // =========================================================

  function onGameState(p) {

    if (
      state.host ||
      !state.running ||
      p.from === state.playerId
    ) {

      return;

    }


    if (state.game) {

      state.game.applyRemote(p);

    }

  }



  function resetRound(p) {

    if (state.host) {
      return;
    }


    if (state.game) {

      state.game.remoteReset(p);

    }

  }



  // =========================================================
  // ROOM
  // =========================================================

async function createRoom(){

  if(!supa){
    msg("Supabaseが設定されていません。config.jsを確認してください。");
    return;
  }

  try{

    msg("ルームを作成しています…");
    status("ルーム作成中…");

    /*
      DBへSELECTして空き番号を探す方式をやめる。

      これまでは

        SELECT → 空いている？
        ↓
        INSERT

      という2段階だったため、
      SELECTの権限/RLSで失敗すると
      ルーム作成自体ができなくなっていた。

      今回はINSERTを直接試す。
    */

    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";


    let created = false;
    let lastError = null;


    /*
      最大10回までコードを変えてINSERT。

      5桁なので衝突確率はかなり低い。
      万一同じコードが存在していても、
      別のコードで再試行する。
    */

    for(let attempt = 0; attempt < 10; attempt++){

      let code = "";

      for(let i = 0; i < 5; i++){

        code += chars[
          Math.floor(
            Math.random() * chars.length
          )
        ];

      }


      const {
        error
      } = await supa
        .from("rooms")
        .insert({

          code: code,

          host_id:
            state.playerId,

          guest_id:
            null,

          status:
            "waiting"

        });


      if(!error){

        state.room = code;

        state.role = "host";

        state.host = true;

        state.ready = false;

        state.opponent = null;


        /*
          ルーム作成成功後にだけ
          通信チャンネルを開く。
        */

        await openChannel(code);


        show("draw");


        status(
          "ルーム " + code
        );


        msg(
          "部屋番号: " +
          code +
          "　この番号を相手に伝えてください。"
        );


        /*
          相手に「ホストがいる」と知らせる。
        */

        send(
          "signal",
          {
            role: "host"
          }
        );


        created = true;

        break;

      }


      lastError = error;


      /*
        primary key(code)の重複なら
        次のコードで再試行。

        それ以外のエラーなら
        無駄に10回繰り返さない。
      */

      const text =
        String(
          error.message || ""
        ).toLowerCase();


      const isDuplicate =
        error.code === "23505" ||
        text.includes("duplicate") ||
        text.includes("already exists");


      if(!isDuplicate){

        break;

      }

    }


    if(!created){

      console.error(
        "[DRAW AIR HOCKEY] ルーム作成失敗",
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

  }catch(error){

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
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";


    for (
      let n = 0;
      n < 20;
      n++
    ) {

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


      const {
        data
      } =
        await supa
          .from("rooms")
          .select("code")
          .eq("code", code)
          .maybeSingle();


      if (!data) {

        return code;

      }

    }


    throw new Error(
      "コード生成失敗"
    );

  }



  async function joinRoom() {

    if (!supa) {

      msg(
        "先にconfig.jsへSupabase設定を入れてください。"
      );

      return;

    }


    const code =
      $("roomInput")
        .value
        .trim()
        .toUpperCase();


    if (code.length !== 5) {

      msg(
        "5桁の部屋番号を入力してください。"
      );

      return;

    }


    const {
      data,
      error
    } =
      await supa
        .from("rooms")
        .select("*")
        .eq("code", code)
        .eq("status", "waiting")
        .maybeSingle();


    if (
      error ||
      !data
    ) {

      msg(
        "そのルームは見つからないか、満員です。"
      );

      return;

    }


    const {
      error: upErr
    } =
      await supa
        .from("rooms")
        .update({

          guest_id:
            state.playerId,

          status:
            "playing"

        })
        .eq("code", code)
        .eq("status", "waiting");


    if (upErr) {

      msg(upErr.message);

      return;

    }


    state.room = code;

    state.role = "guest";

    state.host = false;


    await openChannel(code);


    show("draw");


    status(
      "ルーム " + code
    );


    send(
      "signal",
      {
        role: "guest"
      }
    );

  }



  // =========================================================
  // QUICK MATCH
  // =========================================================

  async function quickMatch() {

    if (!supa) {

      msg(
        "先にconfig.jsへSupabase設定を入れてください。"
      );

      return;

    }


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


    const {
      data
    } =
      await supa
        .from("match_queue")
        .select("*")
        .eq("status", "waiting")
        .neq(
          "player_id",
          state.playerId
        )
        .limit(1)
        .maybeSingle();


    if (data) {

      const room =
        await uniqueCode();


      const {
        error
      } =
      await supa
        .from("rooms")
        .insert({

          code: room,

          host_id:
            data.player_id,

          guest_id:
            state.playerId,

          status:
            "playing"

        });


      if (error) {

        msg(error.message);

        return;

      }


      await supa
        .from("match_queue")
        .update({

          status:
            "matched",

          room_code:
            room

        })
        .eq(
          "id",
          data.id
        );


      state.room =
        room;

      state.role =
        "guest";

      state.host =
        false;


      await openChannel(room);


      send(
        "signal",
        {
          role: "guest"
        }
      );


      return;

    }


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


    const poll =
      setInterval(
        async () => {

          const {
            data: r
          } =
          await supa
            .from("match_queue")
            .select("*")
            .eq("id", ticket)
            .maybeSingle();


          if (
            r?.status === "matched" &&
            r.room_code
          ) {

            clearInterval(poll);


            state.room =
              r.room_code;


            state.role =
              "host";


            state.host =
              true;


            await openChannel(
              r.room_code
            );


            status(
              "マッチング成立"
            );


            send(
              "signal",
              {
                role: "host"
              }
            );

          }

        },
        1200
      );

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
        Math.random() < .5
          ? 0
          : 1;


      this.drawings =
        drawings;


      /*
        host = 左

        guest = 右
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
        t => this.loop(t)
      );

    }



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

        isStatic: true,

        restitution: 1,

        friction: 0

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
    // PHYSICS BODY
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
                x: -scale / 2,
                y: -scale / 2
              },

              {
                x: scale / 2,
                y: -scale / 2
              },

              {
                x: scale / 2,
                y: scale / 2
              },

              {
                x: -scale / 2,
                y: scale / 2
              }

            ];


      const body =
        Matter.Bodies.fromVertices(

          x,

          y,

          [verts],

          {

            restitution:
              .95,

            friction:
              .01,

            frictionAir:
              .002,

            ...options

          },

          true

        );


      /*
        ★物理判定用の色付き図形は
        一切canvasへ描画しない。

        描画用データだけbodyへ保存。
      */

      body.drawData =
        drawing || null;


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

        /*
          i = 0
          → PLAYER 1
          → 左


          i = 1
          → PLAYER 2
          → 右
        */

        const drawing =
          this.drawings[i]?.mallet;


        const x =
          i === 0
            ? 220
            : 780;


        const y =
          this.H / 2;


        const body =
          this.bodyFromDrawing(

            drawing,

            x,

            y,

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

    resetPuck(
      nextPlayer
    ) {

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
              Math.random() < .5
                ? -1
                : 1
            ) * 7,

          y:
            (
              Math.random() - .5
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


      $("score1").textContent =
        this.scores[0];


      $("score2").textContent =
        this.scores[1];


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

      this.running =
        false;


      $("resultTitle").textContent =
        side === this.localSide
          ? "WIN!"
          : "LOSE…";


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

    applyRemote(p) {

      if (p.final) {

        this.running =
          false;


        show("result");


        $("resultTitle").textContent =
          p.winner === this.localSide
            ? "WIN!"
            : "LOSE…";


        return;

      }


      if (p.puck) {

        Matter.Body.setPosition(
          this.puck,
          p.puck.pos
        );


        Matter.Body.setVelocity(
          this.puck,
          p.puck.vel
        );


        Matter.Body.setAngle(
          this.puck,
          p.puck.angle
        );

      }


      if (p.mallets) {

        for (
          let i = 0;
          i < 2;
          i++
        ) {

          if (
            p.mallets[i]
          ) {

            /*
              相手から受け取った位置。

              ただしローカル側では
              自分のマレットは自分で操作する。
            */

            if (
              i !== this.localSide
            ) {

              Matter.Body.setPosition(
                this.mallets[i],
                p.mallets[i]
              );

            }

          }

        }

      }


      if (p.scores) {

        this.scores =
          p.scores;


        $("score1").textContent =
          p.scores[0];


        $("score2").textContent =
          p.scores[1];

      }

    }



    remoteReset(p) {

      this.scores =
        p.scores;


      $("score1").textContent =
        p.scores[0];


      $("score2").textContent =
        p.scores[1];


      this.resetPuck(
        p.currentPuck
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


      const move = e => {

        if (!dragging) {
          return;
        }


        const r =
          canvas.getBoundingClientRect();


        const x =
          (
            e.clientX -
            r.left
          ) *
          this.W /
          r.width;


        const y =
          (
            e.clientY -
            r.top
          ) *
          this.H /
          r.height;


        const side =
          this.localSide;


        /*
          左プレイヤーは左半分だけ。

          右プレイヤーは右半分だけ。
        */

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
        e => {

          dragging = true;


          move(e);


          canvas.setPointerCapture(
            e.pointerId
          );

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

    loop(t) {

      if (!state.running) {
        return;
      }


      const dt =
        Math.min(
          32,
          t - this.last
        );


      this.last =
        t;


      /*
        物理演算はホストだけ。

        guestはホストから
        状態を受信する。
      */

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


        if (
          x < -25
        ) {

          this.score(1);

          return;

        }


        if (
          x > this.W + 25
        ) {

          this.score(0);

          return;

        }


        /*
          上下の壁。
        */

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


        /*
          30msごとに
          ゲーム状態を送信。
        */

        if (
          t - this.lastSend > 30
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
                  m =>
                    m.position
                ),

              scores:
                this.scores

            }
          );


          this.lastSend =
            t;

        }

      }


      this.draw();


      requestAnimationFrame(
        tt => this.loop(tt)
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


      /*
        FIELD
      */

      c.fillStyle =
        "#0b7775";


      c.fillRect(
        0,
        0,
        this.W,
        this.H
      );


      /*
        FIELD LINE
      */

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


      /*
        CENTER LINE
      */

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


      /*
        CENTER CIRCLE
      */

      c.beginPath();

      c.arc(
        this.W / 2,
        this.H / 2,
        90,
        0,
        Math.PI * 2
      );

      c.stroke();


      /*
        GOAL AREA
      */

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


      /*
        ★重要

        物理Bodyそのものは描画しない。

        描画データを使って
        「プレイヤーが実際に描いた線」
        だけを表示する。
      */

      this.mallets.forEach(
        (body, i) => {

          this.drawPlayerShape(
            body
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


      if (!drawing) {

        /*
          絵がない場合だけ、
          最低限の円を表示。

          通常はここには来ない。
        */

        const c =
          this.ctx;


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


      const c =
        this.ctx;


      c.save();


      c.translate(
        body.position.x,
        body.position.y
      );


      c.rotate(
        body.angle
      );


      /*
        polygonは
        -0.5～0.5程度に正規化されている。

        物理Bodyと同じscaleを使うため、
        描いた形と当たり判定の形が一致する。
      */

      c.beginPath();


      const first =
        polygon[0];


      c.moveTo(
        first.x *
          body.drawScale,

        first.y *
          body.drawScale
      );


      for (
        let i = 1;
        i < polygon.length;
        i++
      ) {

        const p =
          polygon[i];


        c.lineTo(
          p.x *
            body.drawScale,

          p.y *
            body.drawScale
        );

      }


      c.closePath();


      /*
        ★ここでは fill() しない。

        これが、
        「勝手に色付き図形が乗る」
        問題を解消する部分。

        プレイヤーが描いた線だけ。
      */

      c.strokeStyle =
        drawing.color ||
        "#ffffff";


      /*
        描画時の太さを
        ゲームサイズに合わせる。

        ただし極端に太くならないよう制限。
      */

      const lineWidth =
        Number(
          drawing.width || 6
        );


      c.lineWidth =
        Math.max(
          1,
          Math.min(
            20,
            lineWidth
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

    /*
      既にゲームが動いていたら作り直さない。
    */

    if (state.running) {
      return;
    }


    state.game =
      new AirGame(
        drawings,
        state.host
      );


    state.running =
      true;


    show("game");


    $("roundMsg").textContent =
      "先に5点！";


    /*
      ホストだけパックを発射。
    */

    if (state.host) {

      Matter.Body.setVelocity(
        state.game.puck,
        {

          x:
            (
              Math.random() < .5
                ? -1
                : 1
            ) * 7,

          y:
            (
              Math.random() - .5
            ) * 5

        }
      );

    }

  }



  // =========================================================
  // READY BUTTON
  // =========================================================

  $("readyBtn").onclick = () => {

    if (
      !state.drawings.puck ||
      !state.drawings.mallet
    ) {

      $("readyMsg").textContent =
        "パックとマレットの両方を描いてください。";


      return;

    }


    state.ready =
      true;


    $("readyBtn").disabled =
      true;


    $("readyMsg").textContent =
      "相手の準備を待っています…";


    send(
      "ready",
      {

        drawings:
          state.drawings

      }
    );


    /*
      ホストが既に相手のREADYを
      受け取っている場合。
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


      send(
        "start",
        {

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



  // =========================================================
  // BUTTONS
  // =========================================================

  $("quickBtn")
    .onclick =
      quickMatch;


  $("createBtn")
    .onclick =
      createRoom;


  $("joinBtn")
    .onclick =
      joinRoom;


  $("backBtn")
    .onclick =
      () => {

        location.reload();

      };



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

  }

})();
