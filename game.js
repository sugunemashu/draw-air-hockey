/* DRAW AIR HOCKEY
   GitHub Pages + Supabase prototype
   Physics: Matter.js
*/

(() => {

  const $ = id => document.getElementById(id);


  // =========================================================
  // Matter.js
  // =========================================================

  if(window.decomp){
    Matter.Common.setDecomp(window.decomp);
  }


  // =========================================================
  // Supabase
  // =========================================================

  const cfg =
    window.AIR_HOCKEY_CONFIG || {};

  const hasCloud =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_URL.includes("supabase.co") &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_ANON_KEY.includes("YOUR-");

  const supa =
    hasCloud
      ? window.supabase.createClient(
          cfg.SUPABASE_URL,
          cfg.SUPABASE_ANON_KEY
        )
      : null;


  // =========================================================
  // State
  // =========================================================

  const state = {

    room:null,

    role:null,

    playerId:
      crypto.randomUUID(),

    ready:false,

    drawings:{
      puck:null,
      mallet:null
    },

    opponent:null,

    host:false,

    channel:null,

    queueId:null,

    running:false,

    game:null
  };


  // =========================================================
  // UI
  // =========================================================

  function msg(t){
    $("menuMsg").textContent=t;
  }


  function status(t){
    $("status").textContent=t;
  }


  function show(id){

    [
      "menu",
      "draw",
      "game",
      "result"
    ].forEach(x=>{

      $(x).classList.toggle(
        "hidden",
        x!==id
      );

    });
  }


  // =========================================================
  // Drawing
  // =========================================================

  function setupPad(canvasId,key){

    const c=$(canvasId);

    const ctx=
      c.getContext("2d");

    ctx.lineWidth=5;
    ctx.lineCap="round";
    ctx.lineJoin="round";
    ctx.strokeStyle="#111";

    let drawing=false;
    let pts=[];


    function pos(e){

      const r=
        c.getBoundingClientRect();

      const p=
        e.touches
          ? e.touches[0]
          : e;

      return {

        x:
          (p.clientX-r.left)*
          c.width/r.width,

        y:
          (p.clientY-r.top)*
          c.height/r.height

      };
    }


    function down(e){

      e.preventDefault();

      drawing=true;

      pts=[
        pos(e)
      ];

      ctx.beginPath();

      ctx.moveTo(
        pts[0].x,
        pts[0].y
      );
    }


    function move(e){

      if(!drawing)return;

      e.preventDefault();

      const p=
        pos(e);

      pts.push(p);

      ctx.lineTo(
        p.x,
        p.y
      );

      ctx.stroke();
    }


    function up(){

      if(!drawing)return;

      drawing=false;

      if(pts.length>3){

        state.drawings[key]=
          normalizePolygon(
            pts,
            c.width,
            c.height
          );
      }
    }


    c.addEventListener(
      "pointerdown",
      down
    );

    c.addEventListener(
      "pointermove",
      move
    );

    window.addEventListener(
      "pointerup",
      up
    );


    const clearBtn=
      $(`[data-clear="${key}"]`);


    if(clearBtn){

      clearBtn.onclick=()=>{

        ctx.clearRect(
          0,
          0,
          c.width,
          c.height
        );

        state.drawings[key]=null;
      };
    }
  }


  function normalizePolygon(
    points,
    w,
    h
  ){

    const minx=
      Math.min(
        ...points.map(p=>p.x)
      );

    const maxx=
      Math.max(
        ...points.map(p=>p.x)
      );

    const miny=
      Math.min(
        ...points.map(p=>p.y)
      );

    const maxy=
      Math.max(
        ...points.map(p=>p.y)
      );


    const cx=
      (minx+maxx)/2;

    const cy=
      (miny+maxy)/2;


    const scale=
      Math.max(
        maxx-minx,
        maxy-miny
      ) || 1;


    return points.map(p=>({

      x:
        (p.x-cx)/scale,

      y:
        (p.y-cy)/scale

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
  // Supabase channel
  // =========================================================

  async function openChannel(room){

    if(!supa){

      throw new Error(
        "Supabase未設定"
      );
    }


    state.channel=
      supa.channel(
        "air-"+room,
        {
          config:{
            broadcast:{
              ack:true
            }
          }
        }
      );


    state.channel.on(
      "broadcast",
      {event:"signal"},
      ({payload})=>
        onSignal(payload)
    );


    state.channel.on(
      "broadcast",
      {event:"state"},
      ({payload})=>
        onGameState(payload)
    );


    state.channel.on(
      "broadcast",
      {event:"input"},
      ({payload})=>
        onInput(payload)
    );


    state.channel.on(
      "broadcast",
      {event:"ready"},
      ({payload})=>
        onReady(payload)
    );


    state.channel.on(
      "broadcast",
      {event:"start"},
      ({payload})=>
        startFromHost(payload)
    );


    state.channel.on(
      "broadcast",
      {event:"reset"},
      ({payload})=>
        resetRound(payload)
    );


    await state.channel.subscribe(
      status=>{
        console.log(
          "Supabase channel status:",
          status
        );
      }
    );
  }


  function send(
    event,
    payload
  ){

    state.channel?.send({

      type:"broadcast",

      event,

      payload:{
        ...payload,
        from:state.playerId
      }

    });
  }


  // =========================================================
  // Signal
  // =========================================================

  function onSignal(p){

    if(
      p.from===
      state.playerId
    ){
      return;
    }


    if(state.host){

      state.opponent={

        ...(state.opponent||{}),

        ...p

      };

      return;
    }


    if(!state.opponent){

      state.opponent=p;

      state.role="guest";

      state.host=false;

      state.ready=false;

      show("draw");

      status(
        "対戦相手が見つかりました"
      );
    }
  }


  // =========================================================
  // Ready
  // =========================================================

  function onReady(p){

    if(
      p.from===
      state.playerId
    ){
      return;
    }


    state.opponent={

      ...(state.opponent||{}),

      ...p,

      ready:true
    };


    if(
      state.host &&
      state.ready
    ){

      // -----------------------------------------
      // 最初のパックをランダム決定
      // 0 = host
      // 1 = guest
      // -----------------------------------------

      const firstPuck=
        Math.random()<0.5
          ? 0
          : 1;


      const drawings={

        host:
          state.drawings,

        guest:
          p.drawings

      };


      // ホストが決めた結果をゲストへ送る
      send(
        "start",
        {
          drawings,
          currentPuck:
            firstPuck
        }
      );


      // ホストも同じ設定で開始
      startGame(
        drawings,
        firstPuck
      );
    }
  }


  // =========================================================
  // Start received from host
  // =========================================================

  function startFromHost(p){

    console.log(
      "★ ホストからゲーム開始:",
      p
    );


    state.opponent={

      ...(state.opponent||{}),

      drawings:
        p.drawings.host

    };


    // ホストが決めた
    // currentPuckをそのまま使用
    startGame(
      p.drawings,
      p.currentPuck
    );
  }


  // =========================================================
  // Game state
  // =========================================================

  function onGameState(p){

    if(
      state.host ||
      !state.running ||
      p.from===
        state.playerId
    ){
      return;
    }


    state.game?.applyRemote(p);
  }


  // =========================================================
  // Guest input
  // =========================================================

  function onInput(p){

    if(
      !state.host ||
      !state.running ||
      p.from===
        state.playerId
    ){
      return;
    }


    state.game?.applyGuestInput(
      p
    );
  }


  // =========================================================
  // Reset
  // =========================================================

  function resetRound(p){

    if(state.host){
      return;
    }


    state.game?.remoteReset(
      p
    );
  }


  // =========================================================
  // Room create
  // =========================================================

  async function createRoom(){

    if(!supa){

      msg(
        "先にconfig.jsへSupabase設定を入れてください。"
      );

      return;
    }


    const code=
      await uniqueCode();


    const {error}=
      await supa
        .from("rooms")
        .insert({

          code,

          host_id:
            state.playerId,

          status:
            "waiting"

        });


    if(error){

      msg(
        "ルーム作成失敗: "+
        error.message
      );

      return;
    }


    state.room=code;

    state.role="host";

    state.host=true;

    state.ready=false;


    await openChannel(
      code
    );


    show("draw");


    status(
      "ルーム "+code
    );


    msg(
      "部屋番号: "+
      code+
      "　この番号を相手に伝えてください。"
    );
  }


  // =========================================================
  // Unique room code
  // =========================================================

  async function uniqueCode(){

    const chars=
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";


    for(
      let n=0;
      n<20;
      n++
    ){

      let c="";


      for(
        let i=0;
        i<5;
        i++
      ){

        c+=
          chars[
            Math.floor(
              Math.random()*
              chars.length
            )
          ];
      }


      const {data}=
        await supa
          .from("rooms")
          .select("code")
          .eq("code",c)
          .maybeSingle();


      if(!data){
        return c;
      }
    }


    throw new Error(
      "コード生成失敗"
    );
  }


  // =========================================================
  // Join room
  // =========================================================

  async function joinRoom(){

    if(!supa){

      msg(
        "先にconfig.jsへSupabase設定を入れてください。"
      );

      return;
    }


    const code=
      $("roomInput")
        .value
        .trim()
        .toUpperCase();


    if(code.length!==5){

      msg(
        "5桁の部屋番号を入力してください。"
      );

      return;
    }


    const {data,error}=
      await supa
        .from("rooms")
        .select("*")
        .eq("code",code)
        .eq("status","waiting")
        .maybeSingle();


    if(error || !data){

      msg(
        "そのルームは見つからないか、満員です。"
      );

      return;
    }


    const {error:upErr}=
      await supa
        .from("rooms")
        .update({

          guest_id:
            state.playerId,

          status:
            "playing"

        })
        .eq("code",code)
        .eq("status","waiting");


    if(upErr){

      msg(
        upErr.message
      );

      return;
    }


    state.room=code;

    state.role="guest";

    state.host=false;


    await openChannel(
      code
    );


    show("draw");


    status(
      "ルーム "+code
    );


    send(
      "signal",
      {
        role:"guest"
      }
    );
  }


  // =========================================================
  // Quick match
  // =========================================================

  async function quickMatch(){

    if(!supa){

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


    const ticket=
      crypto.randomUUID();


    state.queueId=ticket;


    const {data}=
      await supa
        .from("match_queue")
        .select("*")
        .eq("status","waiting")
        .neq(
          "player_id",
          state.playerId
        )
        .limit(1)
        .maybeSingle();


    if(data){

      const room=
        await uniqueCode();


      const {error}=
        await supa
          .from("rooms")
          .insert({

            code:room,

            host_id:
              data.player_id,

            guest_id:
              state.playerId,

            status:
              "playing"

          });


      if(error){

        msg(
          error.message
        );

        return;
      }


      await supa
        .from("match_queue")
        .update({

          status:"matched",

          room_code:room

        })
        .eq(
          "id",
          data.id
        );


      state.room=room;

      state.role="guest";

      state.host=false;


      await openChannel(
        room
      );


      send(
        "signal",
        {
          role:"guest"
        }
      );


      return;
    }


    await supa
      .from("match_queue")
      .insert({

        id:ticket,

        player_id:
          state.playerId,

        status:
          "waiting"

      });


    const poll=
      setInterval(
        async()=>{

          const {data:r}=
            await supa
              .from("match_queue")
              .select("*")
              .eq("id",ticket)
              .maybeSingle();


          if(
            r?.status==="matched" &&
            r.room_code
          ){

            clearInterval(
              poll
            );


            state.room=
              r.room_code;

            state.role="host";

            state.host=true;


            await openChannel(
              r.room_code
            );


            status(
              "マッチング成立"
            );


            send(
              "signal",
              {
                role:"host"
              }
            );
          }

        },
        1200
      );
  }


  // =========================================================
  // Air Game
  // =========================================================

  class AirGame{

    constructor(
      drawings,
      host,
      initialPuck
    ){

      this.host=host;


      // -----------------------------------------
      // Field
      // -----------------------------------------

      this.W=1000;

      this.H=500;


      // -----------------------------------------
      // Network
      // -----------------------------------------

      this.lastSend=0;

      this.lastInputSend=0;


      // -----------------------------------------
      // Matter
      // -----------------------------------------

      this.engine=
        Matter.Engine.create({

          enableSleeping:false

        });


      this.engine.gravity.x=0;

      this.engine.gravity.y=0;


      this.world=
        this.engine.world;


      // -----------------------------------------
      // Canvas
      // -----------------------------------------

      this.canvas=
        $("gameCanvas");


      this.ctx=
        this.canvas.getContext(
          "2d"
        );


      this.resize();


      addEventListener(
        "resize",
        ()=>this.resize()
      );


      // -----------------------------------------
      // Score
      // -----------------------------------------

      this.scores=[
        0,
        0
      ];


      // -----------------------------------------
      // ★ 重要
      // ホストが決めたパックを
      // そのまま使用する
      // -----------------------------------------

      this.currentPuck=
        initialPuck===0 ||
        initialPuck===1
          ? initialPuck
          : 0;


      // -----------------------------------------
      // Drawing data
      // -----------------------------------------

      this.drawings=
        drawings;


      // -----------------------------------------
      // 自分のサイド
      // -----------------------------------------

      this.localSide=
        state.role==="host"
          ? 0
          : 1;


      // -----------------------------------------
      // Create
      // -----------------------------------------

      this.makeArena();

      this.makePuck();

      this.makeMallets();


      // -----------------------------------------
      // Input
      // -----------------------------------------

      this.bindInput();


      // -----------------------------------------
      // Loop
      // -----------------------------------------

      this.last=
        performance.now();


      this.running=true;


      requestAnimationFrame(
        t=>this.loop(t)
      );
    }


    // =======================================================
    // Resize
    // =======================================================

    resize(){

      this.canvas.width=
        this.W;

      this.canvas.height=
        this.H;
    }


    // =======================================================
    // Arena
    // =======================================================

    makeArena(){

      const wall={

        isStatic:true,

        restitution:1,

        friction:0

      };


      // -----------------------------------------
      // ★ ゴールの幅
      // -----------------------------------------

      this.goalW=300;


      const sideWallH=
        (this.H-this.goalW)/2;


      const upperCenter=
        sideWallH/2;


      const lowerCenter=
        this.H-sideWallH/2;


      Matter.World.add(
        this.world,
        [

          // 上
          Matter.Bodies.rectangle(
            this.W/2,
            -12,
            this.W,
            24,
            wall
          ),


          // 下
          Matter.Bodies.rectangle(
            this.W/2,
            this.H+12,
            this.W,
            24,
            wall
          ),


          // 左上
          Matter.Bodies.rectangle(
            -12,
            upperCenter,
            24,
            sideWallH,
            wall
          ),


          // 左下
          Matter.Bodies.rectangle(
            -12,
            lowerCenter,
            24,
            sideWallH,
            wall
          ),


          // 右上
          Matter.Bodies.rectangle(
            this.W+12,
            upperCenter,
            24,
            sideWallH,
            wall
          ),


          // 右下
          Matter.Bodies.rectangle(
            this.W+12,
            lowerCenter,
            24,
            sideWallH,
            wall
          )

        ]
      );
    }


    // =======================================================
    // Shape → Matter body
    // =======================================================

    bodyFromDrawing(
      d,
      x,
      y,
      scale,
      options={}
    ){

      const source=
        d &&
        d.length>2
          ? d
          : [
              {x:-.5,y:-.5},
              {x:.5,y:-.5},
              {x:.5,y:.5},
              {x:-.5,y:.5}
            ];


      const verts=
        source.map(
          p=>({

            x:p.x*scale,

            y:p.y*scale

          })
        );


      return Matter.Bodies.fromVertices(

        x,

        y,

        [verts],

        {

          restitution:.95,

          friction:.01,

          frictionAir:.002,

          ...options

        },

        true
      );
    }


    // =======================================================
    // Puck
    // =======================================================

    makePuck(){

      // -----------------------------------------
      // currentPuck
      //
      // 0 = hostが描いたパック
      // 1 = guestが描いたパック
      // -----------------------------------------

      const side=
        this.currentPuck===0
          ? "host"
          : "guest";


      const d=
        this.drawings[side]?.puck;


      console.log(
        "★ 今回のパック:",
        side,
        d
      );


      this.puck=
        this.bodyFromDrawing(

          d,

          this.W/2,

          this.H/2,

          70

        );


      this.puck.label=
        "puck";


      this.puck.playerShape=
        this.currentPuck;


      // 表示には元の絵を使う
      this.puck.drawShape=
        d;


      this.puck.drawScale=
        70;


      Matter.World.add(
        this.world,
        this.puck
      );
    }


    // =======================================================
    // Mallets
    // =======================================================

    makeMallets(){

      this.mallets=[];


      for(
        let i=0;
        i<2;
        i++
      ){

        const side=
          i===0
            ? "host"
            : "guest";


        const d=
          this.drawings[side]?.mallet;


        const x=
          i===0
            ? 220
            : 780;


        const y=
          this.H/2;


        const b=
          this.bodyFromDrawing(

            d,

            x,

            y,

            105,

            {
              isStatic:true
            }

          );


        b.label=
          "mallet"+i;


        b.player=i;


        b.drawShape=
          d;


        b.drawScale=
          105;


        this.mallets[i]=b;


        Matter.World.add(
          this.world,
          b
        );
      }
    }


    // =======================================================
    // Reset puck
    // =======================================================

    resetPuck(
      nextPlayer
    ){

      if(this.puck){

        Matter.World.remove(
          this.world,
          this.puck
        );
      }


      // -----------------------------------------
      // ★ 次のパックを交互にする
      // -----------------------------------------

      this.currentPuck=
        nextPlayer;


      this.makePuck();


      Matter.Body.setPosition(
        this.puck,
        {

          x:this.W/2,

          y:this.H/2

        }
      );


      Matter.Body.setVelocity(
        this.puck,
        {

          x:
            (
              Math.random()<0.5
                ? -1
                : 1
            )*7,

          y:
            (
              Math.random()-0.5
            )*5

        }
      );


      this.roundPause=
        performance.now()+900;
    }


    // =======================================================
    // Score
    // =======================================================

    score(side){

      if(
        this.roundPause &&
        performance.now()<
          this.roundPause
      ){
        return;
      }


      this.scores[side]++;


      $("score1").textContent=
        this.scores[0];


      $("score2").textContent=
        this.scores[1];


      console.log(
        "★ 得点:",
        side,
        this.scores
      );


      // -----------------------------------------
      // 5点で終了
      // -----------------------------------------

      if(
        this.scores[side]>=5
      ){

        this.finish(
          side
        );

        return;
      }


      // -----------------------------------------
      // ★ パックを交互に変更
      // -----------------------------------------

      const nextPlayer=
        this.currentPuck===0
          ? 1
          : 0;


      this.resetPuck(
        nextPlayer
      );


      // -----------------------------------------
      // ゲストへ完全な状態を送る
      // -----------------------------------------

      send(
        "reset",
        {

          scores:[
            this.scores[0],
            this.scores[1]
          ],

          currentPuck:
            this.currentPuck

        }
      );
    }


    // =======================================================
    // Finish
    // =======================================================

    finish(side){

      this.running=false;


      $("resultTitle").textContent=
        side===this.localSide
          ? "WIN!"
          : "LOSE…";


      show("result");


      send(
        "state",
        {

          final:true,

          scores:[
            this.scores[0],
            this.scores[1]
          ],

          winner:side

        }
      );
    }


    // =======================================================
    // Guest input
    // =======================================================

    applyGuestInput(p){

      if(!this.host){
        return;
      }


      if(
        !p.position ||
        !this.mallets[1]
      ){
        return;
      }


      const x=
        Math.max(

          this.W/2+40,

          Math.min(
            this.W-40,
            p.position.x
          )

        );


      const y=
        Math.max(

          55,

          Math.min(
            this.H-55,
            p.position.y
          )

        );


      // -----------------------------------------
      // ★ ホスト側のMatter.js上で
      // ゲストマレットを動かす
      // -----------------------------------------

      Matter.Body.setPosition(
        this.mallets[1],
        {
          x,
          y
        }
      );


      // 速度をリセット
      Matter.Body.setVelocity(
        this.mallets[1],
        {
          x:0,
          y:0
        }
      );
    }


    // =======================================================
    // Remote state
    // =======================================================

    applyRemote(p){

      if(p.final){

        this.running=false;

        show("result");


        $("resultTitle").textContent=
          p.winner===this.localSide
            ? "WIN!"
            : "LOSE…";


        return;
      }


      // -----------------------------------------
      // パック
      // -----------------------------------------

      if(p.puck){

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


      // -----------------------------------------
      // マレット
      // -----------------------------------------

      if(p.mallets){

        for(
          let i=0;
          i<2;
          i++
        ){

          if(
            !p.mallets[i]
          ){
            continue;
          }


          Matter.Body.setPosition(
            this.mallets[i],
            p.mallets[i]
          );
        }
      }


      // -----------------------------------------
      // Score
      // -----------------------------------------

      if(p.scores){

        this.scores=[
          p.scores[0],
          p.scores[1]
        ];


        $("score1").textContent=
          p.scores[0];


        $("score2").textContent=
          p.scores[1];
      }
    }


    // =======================================================
    // Remote reset
    // =======================================================

    remoteReset(p){

      this.scores=[
        p.scores[0],
        p.scores[1]
      ];


      $("score1").textContent=
        p.scores[0];


      $("score2").textContent=
        p.scores[1];


      // -----------------------------------------
      // ★ ホストが決めた
      // 次のパック形状を使用
      // -----------------------------------------

      this.resetPuck(
        p.currentPuck
      );
    }


    // =======================================================
    // Input
    // =======================================================

    bindInput(){

      const c=
        this.canvas;


      let drag=false;


      const move=e=>{

        if(!drag){
          return;
        }


        const r=
          c.getBoundingClientRect();


        const x=
          (
            e.clientX-r.left
          )*
          this.W/
          r.width;


        const y=
          (
            e.clientY-r.top
          )*
          this.H/
          r.height;


        const side=
          this.localSide;


        const minX=
          side
            ? this.W/2+40
            : 40;


        const maxX=
          side
            ? this.W-40
            : this.W/2-40;


        const newPos={

          x:
            Math.max(
              minX,
              Math.min(
                maxX,
                x
              )
            ),

          y:
            Math.max(
              55,
              Math.min(
                this.H-55,
                y
              )
            )

        };


        // -----------------------------------------
        // 自分の画面
        // -----------------------------------------

        Matter.Body.setPosition(
          this.mallets[side],
          newPos
        );


        // -----------------------------------------
        // ★ ゲスト → ホスト
        // マレット位置を送信
        // -----------------------------------------

        if(!this.host){

          const now=
            performance.now();


          if(
            now-this.lastInputSend>
            15
          ){

            send(
              "input",
              {
                position:newPos
              }
            );


            this.lastInputSend=
              now;
          }
        }
      };


      c.onpointerdown=e=>{

        drag=true;

        move(e);


        try{

          c.setPointerCapture(
            e.pointerId
          );

        }catch(err){}
      };


      c.onpointermove=
        move;


      c.onpointerup=()=>{

        drag=false;

      };


      c.onpointercancel=()=>{

        drag=false;

      };
    }


    // =======================================================
    // Main loop
    // =======================================================

    loop(t){

      if(!this.running){
        return;
      }


      const dt=
        Math.min(
          16.667,
          Math.max(
            0,
            t-this.last
          )
        );


      this.last=t;


      // =====================================================
      // ★ 物理演算はホストだけ
      // =====================================================

      if(this.host){

        if(
          !this.roundPause ||
          t>this.roundPause
        ){

          Matter.Engine.update(
            this.engine,
            dt
          );
        }


        const x=
          this.puck.position.x;


        const y=
          this.puck.position.y;


        // ===================================================
        // 左ゴール
        // ===================================================

        if(

          x<25 &&

          y>
            this.H/2-
            this.goalW/2 &&

          y<
            this.H/2+
            this.goalW/2

        ){

          console.log(
            "★ 左ゴール"
          );


          // 左に入った
          // → 右側プレイヤー得点
          this.score(1);


          return;
        }


        // ===================================================
        // 右ゴール
        // ===================================================

        if(

          x>
            this.W-25 &&

          y>
            this.H/2-
            this.goalW/2 &&

          y<
            this.H/2+
            this.goalW/2

        ){

          console.log(
            "★ 右ゴール"
          );


          // 右に入った
          // → 左側プレイヤー得点
          this.score(0);


          return;
        }


        // ===================================================
        // ゲーム状態送信
        // ===================================================

        if(
          t-this.lastSend>25
        ){

          send(
            "state",
            {

              puck:{

                pos:{
                  x:this.puck.position.x,
                  y:this.puck.position.y
                },

                vel:{
                  x:this.puck.velocity.x,
                  y:this.puck.velocity.y
                },

                angle:
                  this.puck.angle

              },


              mallets:
                this.mallets.map(
                  m=>({

                    x:m.position.x,

                    y:m.position.y

                  })
                ),


              scores:[
                this.scores[0],
                this.scores[1]
              ]

            }
          );


          this.lastSend=t;
        }
      }


      // =====================================================
      // 描画
      // =====================================================

      this.draw();


      requestAnimationFrame(
        tt=>this.loop(tt)
      );
    }


    // =======================================================
    // Draw
    // =======================================================

    draw(){

      const c=
        this.ctx;


      // 背景
      c.clearRect(
        0,
        0,
        this.W,
        this.H
      );


      c.fillStyle=
        "#0b7775";


      c.fillRect(
        0,
        0,
        this.W,
        this.H
      );


      // 外枠
      c.strokeStyle=
        "#bff9ef";


      c.lineWidth=4;


      c.strokeRect(
        10,
        10,
        this.W-20,
        this.H-20
      );


      // 中央線
      c.beginPath();


      c.moveTo(
        this.W/2,
        10
      );


      c.lineTo(
        this.W/2,
        this.H-10
      );


      c.stroke();


      // 中央円
      c.beginPath();


      c.arc(
        this.W/2,
        this.H/2,
        90,
        0,
        Math.PI*2
      );


      c.stroke();


      // =====================================================
      // ゴール表示
      // =====================================================

      c.fillStyle=
        "#092e38";


      // 左
      c.fillRect(
        0,
        0,
        18,
        this.H/2-
        this.goalW/2
      );


      c.fillRect(
        0,
        this.H/2+
        this.goalW/2,
        18,
        this.H/2-
        this.goalW/2
      );


      // 右
      c.fillRect(
        this.W-18,
        0,
        18,
        this.H/2-
        this.goalW/2
      );


      c.fillRect(
        this.W-18,
        this.H/2+
        this.goalW/2,
        18,
        this.H/2-
        this.goalW/2
      );


      // =====================================================
      // マレット
      // =====================================================

      this.mallets.forEach(
        (b,i)=>{

          this.drawBody(

            b,

            i===this.localSide
              ? "#ffcf4a"
              : "#ff6b9d"

          );
        }
      );


      // =====================================================
      // パック
      // =====================================================

      this.drawBody(

        this.puck,

        this.currentPuck===
        this.localSide

          ? "#fff"

          : "#d7e4ff"

      );
    }


    // =======================================================
    // Draw custom shape
    // =======================================================

    drawBody(
      b,
      fill
    ){

      const c=
        this.ctx;


      c.save();


      c.translate(
        b.position.x,
        b.position.y
      );


      c.rotate(
        b.angle
      );


      c.fillStyle=
        fill;


      c.strokeStyle=
        "#18213a";


      c.lineWidth=3;


      const shape=
        b.drawShape;


      const scale=
        b.drawScale;


      if(
        shape &&
        shape.length>2
      ){

        c.beginPath();


        c.moveTo(

          shape[0].x*
            scale,

          shape[0].y*
            scale

        );


        for(
          const p of
          shape.slice(1)
        ){

          c.lineTo(

            p.x*
              scale,

            p.y*
              scale

          );
        }


        c.closePath();


        c.fill();


        c.stroke();
      }


      c.restore();
    }
  }


  // =========================================================
  // Start game
  // =========================================================

  function startGame(
    drawings,
    currentPuck
  ){

    console.log(
      "★ AirGameを作成します"
    );


    console.log(
      "★ 使用するパック:",
      currentPuck===0
        ? "HOST"
        : "GUEST"
    );


    state.game=
      new AirGame(

        drawings,

        state.host,

        currentPuck

      );


    state.running=true;


    show("game");


    $("roundMsg").textContent=
      "先に5点！";


    // -----------------------------------------
    // 最初のパックをホストから発射
    // -----------------------------------------

    if(state.host){

      Matter.Body.setVelocity(

        state.game.puck,

        {

          x:
            (
              Math.random()<0.5
                ? -1
                : 1
            )*7,

          y:
            (
              Math.random()-0.5
            )*5

        }

      );
    }
  }


  // =========================================================
  // Ready button
  // =========================================================

  $("readyBtn").onclick=()=>{

    if(
      !state.drawings.puck ||
      !state.drawings.mallet
    ){

      $("readyMsg").textContent=
        "パックとマレットの両方を描いてください。";

      return;
    }


    state.ready=true;


    $("readyBtn").disabled=
      true;


    $("readyMsg").textContent=
      "相手の準備を待っています…";


    send(
      "ready",
      {
        drawings:
          state.drawings
      }
    );


    // -------------------------------------------------------
    // ホストが先にReady済みなら開始
    // -------------------------------------------------------

    if(
      state.host &&
      state.opponent?.ready
    ){

      const firstPuck=
        Math.random()<0.5
          ? 0
          : 1;


      const drawings={

        host:
          state.drawings,

        guest:
          state.opponent.drawings

      };


      send(
        "start",
        {

          drawings,

          currentPuck:
            firstPuck

        }
      );


      startGame(
        drawings,
        firstPuck
      );
    }
  };


  // =========================================================
  // Buttons
  // =========================================================

  $("quickBtn").onclick=
    quickMatch;


  $("createBtn").onclick=
    createRoom;


  $("joinBtn").onclick=
    joinRoom;


  $("backBtn").onclick=
    ()=>location.reload();


  // =========================================================
  // Initial
  // =========================================================

  status(
    "オンライン設定待ち"
  );


  if(!hasCloud){

    msg(
      "現在はゲーム本体のみ動作します。"+
      "オンライン対戦を有効にするにはREADMEのSupabase設定をしてください。"
    );
  }

})();
