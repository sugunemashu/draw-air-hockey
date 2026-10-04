(() => {

  const $ = id => document.getElementById(id);


  /* =========================================================
     Matter.js / poly-decomp
  ========================================================= */

  if(window.decomp){
    Matter.Common.setDecomp(window.decomp);
  }


  /* =========================================================
     Supabase
  ========================================================= */

  const supabaseClient =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );


  /* =========================================================
     STATE
  ========================================================= */

  const state = {

    playerId:
      crypto.randomUUID(),

    host:false,

    roomCode:null,

    channel:null,

    ready:false,

    running:false,

    drawings:{
      puck:null,
      mallet:null
    },

    opponent:null,

    game:null

  };


  /* =========================================================
     UI
  ========================================================= */

  function msg(text){

    console.log(text);

    const el=$("message");

    if(el){
      el.textContent=text;
    }
  }


  function statusText(text){

    console.log(text);

    const el=$("status");

    if(el){
      el.textContent=text;
    }
  }


  function show(id){

    document
      .querySelectorAll(".screen")
      .forEach(el=>{
        el.style.display="none";
      });


    const target=$(id);

    if(target){
      target.style.display="block";
    }
  }


  /* =========================================================
     DRAWING
  ========================================================= */

  function normalizePolygon(points){

    if(
      !points ||
      points.length<3
    ){
      return null;
    }


    let cx=0;
    let cy=0;


    for(const p of points){

      cx+=p.x;
      cy+=p.y;

    }


    cx/=points.length;
    cy/=points.length;


    let max=0;


    const result=
      points.map(p=>{

        const x=
          p.x-cx;

        const y=
          p.y-cy;


        max=
          Math.max(
            max,
            Math.sqrt(
              x*x+y*y
            )
          );


        return {
          x,
          y
        };

      });


    if(max===0){
      return null;
    }


    return result.map(p=>({

      x:p.x/max,

      y:p.y/max

    }));
  }


  function setupPad(
    id,
    type
  ){

    const canvas=$(id);


    if(!canvas){
      console.warn(
        "Canvasがありません:",
        id
      );

      return;
    }


    const ctx=
      canvas.getContext("2d");


    let drawing=false;

    let points=[];


    function resize(){

      const rect=
        canvas.getBoundingClientRect();


      const dpr=
        window.devicePixelRatio||1;


      canvas.width=
        rect.width*dpr;


      canvas.height=
        rect.height*dpr;


      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );


      redraw();
    }


    function getPoint(e){

      const rect=
        canvas.getBoundingClientRect();


      return {

        x:
          e.clientX-
          rect.left,

        y:
          e.clientY-
          rect.top

      };
    }


    function redraw(){

      const rect=
        canvas.getBoundingClientRect();


      ctx.clearRect(
        0,
        0,
        rect.width,
        rect.height
      );


      ctx.fillStyle="#fff";


      ctx.fillRect(
        0,
        0,
        rect.width,
        rect.height
      );


      if(points.length){

        ctx.strokeStyle="#222";

        ctx.lineWidth=4;

        ctx.lineCap="round";

        ctx.lineJoin="round";


        ctx.beginPath();


        ctx.moveTo(
          points[0].x,
          points[0].y
        );


        for(
          let i=1;
          i<points.length;
          i++
        ){

          ctx.lineTo(
            points[i].x,
            points[i].y
          );

        }


        ctx.stroke();
      }
    }


    function start(e){

      e.preventDefault();


      drawing=true;


      points=[];


      points.push(
        getPoint(e)
      );


      redraw();


      try{

        canvas.setPointerCapture(
          e.pointerId
        );

      }catch(err){}
    }


    function move(e){

      if(!drawing){
        return;
      }


      e.preventDefault();


      const p=
        getPoint(e);


      const last=
        points[
          points.length-1
        ];


      const dx=
        p.x-last.x;


      const dy=
        p.y-last.y;


      if(
        Math.sqrt(
          dx*dx+dy*dy
        )<2
      ){

        return;
      }


      points.push(p);


      redraw();
    }


    function end(){

      if(!drawing){
        return;
      }


      drawing=false;


      if(points.length>=3){

        const normalized=
          normalizePolygon(
            points
          );


        if(normalized){

          state.drawings[type]=
            normalized;


          console.log(
            "★ 描画完成:",
            type
          );
        }
      }


      redraw();
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


    window.addEventListener(
      "resize",
      resize
    );


    resize();
  }


  /* =========================================================
     SUPABASE SEND
  ========================================================= */

  function send(
    type,
    data={}
  ){

    if(!state.channel){

      console.warn(
        "チャンネルがありません"
      );

      return;
    }


    state.channel.send({

      type:"broadcast",

      event:type,

      payload:{

        from:
          state.playerId,

        ...data

      }

    });
  }


  /* =========================================================
     SUPABASE RECEIVE
  ========================================================= */

  function onSignal(payload){

    const p=
      payload.payload||payload;


    if(!p){
      return;
    }


    if(
      p.from===
      state.playerId
    ){

      return;
    }


    switch(payload.event){

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

    }
  }


  /* =========================================================
     READY
  ========================================================= */

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

      const firstPuck=
        Math.random()<0.5
          ?0
          :1;


      const drawings={

        host:
          state.drawings,

        guest:
          p.drawings

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
  }


  /* =========================================================
     START FROM HOST
  ========================================================= */

  function startFromHost(p){

    console.log(
      "★ ホストからゲーム開始",
      p
    );


    state.opponent={

      ...(state.opponent||{}),

      drawings:
        p.drawings.host

    };


    startGame(
      p.drawings,
      p.currentPuck
    );
  }


  /* =========================================================
     REMOTE GAME STATE
  ========================================================= */

  function onGameState(p){

    if(
      state.host ||
      !state.game
    ){

      return;
    }


    state.game.applyRemote(p);
  }


  /* =========================================================
     GUEST INPUT
  ========================================================= */

  function onInput(p){

    if(
      !state.host ||
      !state.running ||
      p.from===
      state.playerId
    ){

      return;
    }


    if(
      state.game &&
      p.position
    ){

      state.game.applyGuestInput(p);
    }
  }


  /* =========================================================
     RESET
  ========================================================= */

  function resetRound(p){

    if(!state.game){
      return;
    }


    if(
      !p.scores ||
      !Array.isArray(p.scores)
    ){

      return;
    }


    state.game.remoteReset(p);
  }


  /* =========================================================
     FINISH
  ========================================================= */

  function onFinish(p){

    if(!state.game){
      return;
    }


    state.game.running=false;

    state.running=false;


    $("roundMsg").textContent=
      p.winner===0
        ?"プレイヤー1の勝利！"
        :"プレイヤー2の勝利！";
  }


  /* =========================================================
     ROOM
  ========================================================= */

  function uniqueCode(){

    const chars=
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";


    let result="";


    for(
      let i=0;
      i<6;
      i++
    ){

      result+=
        chars[
          Math.floor(
            Math.random()*
            chars.length
          )
        ];
    }


    return result;
  }


  async function createRoom(){

    const code=
      uniqueCode();


    state.host=true;

    state.roomCode=code;


    await joinChannel(
      code
    );


    $("roomCode").textContent=
      code;


    show("room");


    statusText(
      "ルームを作成しました"
    );
  }


  async function joinRoom(code){

    if(!code){
      return;
    }


    state.host=false;


    state.roomCode=
      code.trim().toUpperCase();


    await joinChannel(
      state.roomCode
    );


    show("room");


    statusText(
      "ルームに参加しました"
    );
  }


  async function quickMatch(){

    const code=
      prompt(
        "ルームコードを入力してください"
      );


    if(!code){
      return;
    }


    await joinRoom(code);
  }


  /* =========================================================
     SUPABASE CHANNEL
  ========================================================= */

  async function joinChannel(code){

    if(state.channel){

      try{

        await supabaseClient
          .removeChannel(
            state.channel
          );

      }catch(err){}


      state.channel=null;
    }


    const channel=
      supabaseClient.channel(
        "air-hockey-"+code,
        {
          config:{
            broadcast:{
              self:false
            }
          }
        }
      );


    state.channel=channel;


    const events=[
      "ready",
      "start",
      "state",
      "input",
      "reset",
      "finish"
    ];


    for(
      const event of events
    ){

      channel.on(
        "broadcast",
        {event},
        payload=>{
          onSignal(payload);
        }
      );
    }


    await channel.subscribe(
      s=>{

        console.log(
          "Supabase:",
          s
        );


        if(
          s==="SUBSCRIBED"
        ){

          statusText(
            "接続済み"
          );
        }
      }
    );
  }


  /* =========================================================
     AIR GAME
  ========================================================= */

  class AirGame{

    constructor(
      drawings,
      host,
      initialPuck
    ){

      this.drawings=
        drawings;


      this.host=
        host;


      this.running=
        true;


      this.currentPuck=
        initialPuck===0 ||
        initialPuck===1
          ?initialPuck
          :0;


      this.scores=[
        0,
        0
      ];


      this.localSide=
        host
          ?0
          :1;


      this.W=960;

      this.H=540;


      this.canvas=
        $("gameCanvas");


      this.ctx=
        this.canvas.getContext(
          "2d"
        );


      this.engine=
        Matter.Engine.create();


      this.world=
        this.engine.world;


      this.engine.gravity.x=0;

      this.engine.gravity.y=0;


      this.puck=null;

      this.mallets=[];


      this.goalW=300;


      this.last=
        performance.now();


      this.lastSend=0;

      this.lastInputSend=0;

      this.roundPause=0;


      this.resize();

      this.makeArena();

      this.makePuck();

      this.makeMallets();

      this.bindInput();


      this.loop(
        performance.now()
      );
    }


    /* =======================================================
       RESIZE
    ======================================================= */

    resize(){

      const rect=
        this.canvas.getBoundingClientRect();


      if(
        rect.width>0 &&
        rect.height>0
      ){

        this.W=
          rect.width;

        this.H=
          rect.height;

      }else{

        this.W=960;

        this.H=540;
      }


      const dpr=
        window.devicePixelRatio||1;


      this.canvas.width=
        this.W*dpr;


      this.canvas.height=
        this.H*dpr;


      this.ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );
    }


    /* =======================================================
       ARENA
       
       ★ 今回の重要部分
       
       ・上下は完全に壁
       ・左右はゴール部分だけ開ける
       ・それ以外は壁
    ======================================================= */

    makeArena(){

      const wall={

        isStatic:true,

        restitution:1,

        friction:0,

        frictionStatic:0,

        slop:0

      };


      this.goalW=300;


      const sideWallH=
        (this.H-this.goalW)/2;


      const upperCenter=
        sideWallH/2;


      const lowerCenter=
        this.H-
        sideWallH/2;


      Matter.World.add(
        this.world,
        [

          /*
           * 上
           */

          Matter.Bodies.rectangle(
            this.W/2,
            -10,
            this.W+40,
            20,
            wall
          ),


          /*
           * 下
           */

          Matter.Bodies.rectangle(
            this.W/2,
            this.H+10,
            this.W+40,
            20,
            wall
          ),


          /*
           * 左上
           */

          Matter.Bodies.rectangle(
            -10,
            upperCenter,
            20,
            sideWallH,
            wall
          ),


          /*
           * 左下
           */

          Matter.Bodies.rectangle(
            -10,
            lowerCenter,
            20,
            sideWallH,
            wall
          ),


          /*
           * 右上
           */

          Matter.Bodies.rectangle(
            this.W+10,
            upperCenter,
            20,
            sideWallH,
            wall
          ),


          /*
           * 右下
           */

          Matter.Bodies.rectangle(
            this.W+10,
            lowerCenter,
            20,
            sideWallH,
            wall
          )

        ]
      );
    }


    /* =======================================================
       BODY FROM DRAWING
    ======================================================= */

    bodyFromDrawing(
      drawing,
      x,
      y,
      scale
    ){

      if(
        !drawing ||
        drawing.length<3
      ){

        const body=
          Matter.Bodies.circle(
            x,
            y,
            scale*0.45,
            {

              restitution:0.9,

              friction:0,

              frictionAir:0

            }
          );


        body.drawShape=null;

        body.drawScale=
          scale;


        return body;
      }


      const vertices=
        drawing.map(
          p=>({

            x:p.x*scale,

            y:p.y*scale

          })
        );


      let body;


      try{

        body=
          Matter.Bodies.fromVertices(
            x,
            y,
            [vertices],
            {

              restitution:0.9,

              friction:0,

              frictionAir:0

            },

            true
          );

      }catch(err){

        console.error(
          "fromVertices失敗:",
          err
        );


        body=
          Matter.Bodies.circle(
            x,
            y,
            scale*0.45,
            {

              restitution:0.9,

              friction:0,

              frictionAir:0

            }
          );
      }


      body.drawShape=
        drawing;


      body.drawScale=
        scale;


      return body;
    }


    /* =======================================================
       PUCK
    ======================================================= */

    makePuck(){

      const side=
        this.currentPuck===0
          ?"host"
          :"guest";


      const drawing=
        this.drawings[
          side
        ]?.puck;


      this.puck=
        this.bodyFromDrawing(
          drawing,
          this.W/2,
          this.H/2,
          70
        );


      this.puck.playerShape=
        this.currentPuck;


      this.puck.drawShape=
        drawing;


      this.puck.drawScale=70;


      Matter.World.add(
        this.world,
        this.puck
      );
    }


    /* =======================================================
       MALLETS
    ======================================================= */

    makeMallets(){

      const hostDrawing=
        this.drawings.host?.mallet;


      const guestDrawing=
        this.drawings.guest?.mallet;


      const hostMallet=
        this.bodyFromDrawing(
          hostDrawing,
          this.W*0.25,
          this.H/2,
          55
        );


      const guestMallet=
        this.bodyFromDrawing(
          guestDrawing,
          this.W*0.75,
          this.H/2,
          55
        );


      hostMallet.isStatic=true;

      guestMallet.isStatic=true;


      this.mallets=[
        hostMallet,
        guestMallet
      ];


      Matter.World.add(
        this.world,
        this.mallets
      );
    }


    /* =======================================================
       RESET PUCK
    ======================================================= */

    resetPuck(
      nextPlayer
    ){

      if(this.puck){

        Matter.World.remove(
          this.world,
          this.puck
        );
      }


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
            (Math.random()<0.5
              ?-1
              :1)*7,

          y:
            (Math.random()-0.5)*5
        }
      );


      Matter.Body.setAngularVelocity(
        this.puck,
        0
      );


      /*
       * 0.9秒間だけ
       * 新しいラウンドを待つ
       */

      this.roundPause=
        performance.now()+900;
    }


    /* =======================================================
       SCORE
    ======================================================= */

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


      if(
        this.scores[side]>=5
      ){

        this.finish(side);

        return;
      }


      /*
       * パック形状を交代
       */

      const nextPlayer=
        this.currentPuck===0
          ?1
          :0;


      this.resetPuck(
        nextPlayer
      );


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


    /* =======================================================
       FINISH
    ======================================================= */

    finish(winner){

      this.running=false;

      state.running=false;


      $("roundMsg").textContent=
        winner===0
          ?"プレイヤー1の勝利！"
          :"プレイヤー2の勝利！";


      send(
        "finish",
        {
          winner
        }
      );
    }


    /* =======================================================
       GUEST INPUT
    ======================================================= */

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
          x:0,
          y:0
        }
      );
    }


    /* =======================================================
       REMOTE STATE
    ======================================================= */

    applyRemote(p){

      if(this.host){
        return;
      }


      if(
        p.scores &&
        p.scores.length>=2
      ){

        this.scores=[
          p.scores[0],
          p.scores[1]
        ];


        $("score1").textContent=
          this.scores[0];


        $("score2").textContent=
          this.scores[1];
      }


      if(
        p.puck &&
        this.puck
      ){

        Matter.Body.setPosition(
          this.puck,
          p.puck.pos
        );


        Matter.Body.setVelocity(
          this.puck,
          p.puck.vel
        );


        if(
          typeof p.puck.angle===
          "number"
        ){

          Matter.Body.setAngle(
            this.puck,
            p.puck.angle
          );
        }
      }


      if(
        p.mallets &&
        p.mallets.length>=2
      ){

        for(
          let i=0;
          i<2;
          i++
        ){

          if(
            !this.mallets[i]
          ){

            continue;
          }


          Matter.Body.setPosition(
            this.mallets[i],
            {
              x:p.mallets[i].x,
              y:p.mallets[i].y
            }
          );
        }
      }
    }


    /* =======================================================
       REMOTE RESET
    ======================================================= */

    remoteReset(p){

      this.scores=[
        p.scores[0],
        p.scores[1]
      ];


      $("score1").textContent=
        p.scores[0];


      $("score2").textContent=
        p.scores[1];


      this.resetPuck(
        p.currentPuck
      );
    }


    /* =======================================================
       INPUT
    ======================================================= */

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
          (e.clientX-r.left)*
          this.W/r.width;


        const y=
          (e.clientY-r.top)*
          this.H/r.height;


        const side=
          this.localSide;


        const minX=
          side
            ?this.W/2+40
            :40;


        const maxX=
          side
            ?this.W-40
            :this.W/2-40;


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


        Matter.Body.setPosition(
          this.mallets[side],
          newPos
        );


        if(!this.host){

          const now=
            performance.now();


          if(
            now-
            this.lastInputSend>
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


      c.onpointermove=move;


      c.onpointerup=()=>{
        drag=false;
      };


      c.onpointercancel=()=>{
        drag=false;
      };
    }


    /* =======================================================
       ★ OUT OF BOUNDS SAFETY
       
       Matterの壁をすり抜けた場合でも
       パックを場外に放置しない。
    ======================================================= */

    keepPuckInside(){

      if(!this.puck){
        return;
      }


      const p=
        this.puck.position;


      const v=
        this.puck.velocity;


      /*
       * ゴール判定範囲内なら
       * 場外へ出るのを許可する。
       *
       * ここはscore()が処理する。
       */

      const inGoal=
        (
          p.y>
            this.H/2-
            this.goalW/2
        ) &&
        (
          p.y<
            this.H/2+
            this.goalW/2
        );


      /*
       * 左右
       */

      if(
        p.x<0 &&
        !inGoal
      ){

        Matter.Body.setPosition(
          this.puck,
          {
            x:25,
            y:Math.max(
              20,
              Math.min(
                this.H-20,
                p.y
              )
            )
          }
        );


        Matter.Body.setVelocity(
          this.puck,
          {
            x:
              Math.abs(v.x),
            y:
              v.y
          }
        );
      }


      if(
        p.x>this.W &&
        !inGoal
      ){

        Matter.Body.setPosition(
          this.puck,
          {
            x:this.W-25,
            y:Math.max(
              20,
              Math.min(
                this.H-20,
                p.y
              )
            )
          }
        );


        Matter.Body.setVelocity(
          this.puck,
          {
            x:
              -Math.abs(v.x),
            y:
              v.y
          }
        );
      }


      /*
       * 上下
       */

      if(
        p.y<0
      ){

        Matter.Body.setPosition(
          this.puck,
          {
            x:Math.max(
              20,
              Math.min(
                this.W-20,
                p.x
              )
            ),
            y:25
          }
        );


        Matter.Body.setVelocity(
          this.puck,
          {
            x:v.x,
            y:
              Math.abs(v.y)
          }
        );
      }


      if(
        p.y>this.H
      ){

        Matter.Body.setPosition(
          this.puck,
          {
            x:Math.max(
              20,
              Math.min(
                this.W-20,
                p.x
              )
            ),
            y:this.H-25
          }
        );


        Matter.Body.setVelocity(
          this.puck,
          {
            x:v.x,
            y:
              -Math.abs(v.y)
          }
        );
      }
    }


    /* =======================================================
       ★ 速度制限
    ======================================================= */

    limitPuckSpeed(){

      if(!this.puck){
        return;
      }


      const maxSpeed=14;


      const vx=
        this.puck.velocity.x;


      const vy=
        this.puck.velocity.y;


      const speed=
        Math.sqrt(
          vx*vx+
          vy*vy
        );


      if(
        speed>maxSpeed
      ){

        const ratio=
          maxSpeed/speed;


        Matter.Body.setVelocity(
          this.puck,
          {
            x:vx*ratio,
            y:vy*ratio
          }
        );
      }
    }


    /* =======================================================
       GAME LOOP
    ======================================================= */

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


        /*
         * ゴール判定
         */

        const x=
          this.puck.position.x;


        const y=
          this.puck.position.y;


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
            "★ 左ゴール！"
          );


          this.score(1);

        }

        else if(
          x>this.W-25 &&
          y>
            this.H/2-
            this.goalW/2 &&
          y<
            this.H/2+
            this.goalW/2
        ){

          console.log(
            "★ 右ゴール！"
          );


          this.score(0);
        }


        /*
         * ゴールしていない場合だけ
         * 場外安全処理
         */

        if(
          this.running
        ){

          this.keepPuckInside();

          this.limitPuckSpeed();
        }


        /*
         * 状態送信
         */

        if(
          t-this.lastSend>25
        ){

          send(
            "state",
            {

              puck:{

                pos:{

                  x:
                    this.puck.position.x,

                  y:
                    this.puck.position.y

                },

                vel:{

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
                  m=>({

                    x:
                      m.position.x,

                    y:
                      m.position.y

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


      this.draw();


      /*
       * ★ 絶対にここでループを止めない
       */

      requestAnimationFrame(
        tt=>this.loop(tt)
      );
    }


    /* =======================================================
       DRAW
    ======================================================= */

    draw(){

      const c=
        this.ctx;


      c.clearRect(
        0,
        0,
        this.W,
        this.H
      );


      /*
       * テーブル
       */

      c.fillStyle="#0b7775";


      c.fillRect(
        0,
        0,
        this.W,
        this.H
      );


      /*
       * 外枠
       */

      c.strokeStyle="#bff9ef";

      c.lineWidth=4;


      c.strokeRect(
        10,
        10,
        this.W-20,
        this.H-20
      );


      /*
       * センターライン
       */

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


      /*
       * センターサークル
       */

      c.beginPath();


      c.arc(
        this.W/2,
        this.H/2,
        90,
        0,
        Math.PI*2
      );


      c.stroke();


      /*
       * ゴール以外の壁
       */

      c.fillStyle="#092e38";


      /*
       * 左上
       */

      c.fillRect(
        0,
        0,
        18,
        this.H/2-
        this.goalW/2
      );


      /*
       * 左下
       */

      c.fillRect(
        0,
        this.H/2+
        this.goalW/2,
        18,
        this.H/2-
        this.goalW/2
      );


      /*
       * 右上
       */

      c.fillRect(
        this.W-18,
        0,
        18,
        this.H/2-
        this.goalW/2
      );


      /*
       * 右下
       */

      c.fillRect(
        this.W-18,
        this.H/2+
        this.goalW/2,
        18,
        this.H/2-
        this.goalW/2
      );


      /*
       * マレット
       */

      this.mallets.forEach(
        (b,i)=>{

          this.drawBody(
            b,
            i===this.localSide
              ?" #ffcf4a".trim()
              :"#ff6b9d"
          );

        }
      );


      /*
       * パック
       */

      this.drawBody(
        this.puck,
        this.currentPuck===
        this.localSide
          ?" #fff".trim()
          :"#d7e4ff"
      );
    }


    /* =======================================================
       DRAW BODY
    ======================================================= */

    drawBody(
      b,
      fill
    ){

      if(!b){
        return;
      }


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
          shape[0].x*scale,
          shape[0].y*scale
        );


        for(
          const p of
          shape.slice(1)
        ){

          c.lineTo(
            p.x*scale,
            p.y*scale
          );
        }


        c.closePath();


        c.fill();

        c.stroke();

      }else{

        c.beginPath();


        c.arc(
          0,
          0,
          scale*0.45,
          0,
          Math.PI*2
        );


        c.fill();

        c.stroke();
      }


      c.restore();
    }

  }


  /* =========================================================
     START GAME
  ========================================================= */

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
        ?"HOST"
        :"GUEST"
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


    /*
     * 初回のみホストから発射
     */

    if(state.host){

      Matter.Body.setVelocity(
        state.game.puck,
        {

          x:
            (Math.random()<0.5
              ?-1
              :1)*7,

          y:
            (Math.random()-0.5)*5

        }
      );
    }
  }


  /* =========================================================
     READY BUTTON
  ========================================================= */

  const readyButton=
    $("readyBtn");


  if(readyButton){

    readyButton.onclick=()=>{

      if(
        !state.drawings.puck ||
        !state.drawings.mallet
      ){

        alert(
          "パックとマレットの両方を描いてください"
        );

        return;
      }


      state.ready=true;


      readyButton.disabled=true;


      statusText(
        "準備完了。相手を待っています..."
      );


      send(
        "ready",
        {
          drawings:
            state.drawings
        }
      );


      if(
        state.host &&
        state.opponent?.ready
      ){

        const firstPuck=
          Math.random()<0.5
            ?0
            :1;


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
  }


  /* =========================================================
     BUTTONS
  ========================================================= */

  const createBtn=
    $("createRoomBtn");


  if(createBtn){

    createBtn.onclick=
      createRoom;
  }


  const joinBtn=
    $("joinRoomBtn");


  if(joinBtn){

    joinBtn.onclick=()=>{

      const input=
        $("roomInput");


      const code=
        input
          ?input.value
          :"";


      joinRoom(code);
    };
  }


  const quickBtn=
    $("quickMatchBtn");


  if(quickBtn){

    quickBtn.onclick=
      quickMatch;
  }


  /* =========================================================
     DRAWING PADS
  ========================================================= */

  setupPad(
    "puckCanvas",
    "puck"
  );


  setupPad(
    "malletCanvas",
    "mallet"
  );


  /* =========================================================
     INITIAL
  ========================================================= */

  show("menu");


  console.log(
    "★ game.js 読み込み完了"
  );

})();
