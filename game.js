/* DRAW AIR HOCKEY
   GitHub Pages + Supabase prototype
   Physics: Matter.js
*/
(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.AIR_HOCKEY_CONFIG || {};
  const hasCloud = cfg.SUPABASE_URL && cfg.SUPABASE_URL.includes("supabase.co") &&
                   cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR-");
  const supa = hasCloud ? window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY) : null;

  const state = {
    room:null, role:null, playerId:crypto.randomUUID(), ready:false,
    drawings:{puck:null,mallet:null}, opponent:null, host:false,
    channel:null, queueId:null, running:false, game:null
  };

  function msg(t){ $("menuMsg").textContent=t; }
  function status(t){ $("status").textContent=t; }
  function show(id){["menu","draw","game","result"].forEach(x=>$(x).classList.toggle("hidden",x!==id));}

  // ---------- Drawing ----------
  function setupPad(canvasId,key){
  const c=$(canvasId), ctx=c.getContext("2d");
  ctx.lineWidth=5;
  ctx.lineCap="round";
  ctx.lineJoin="round";
  ctx.strokeStyle="#111";

  let drawing=false, pts=[];

  function pos(e){
    const r=c.getBoundingClientRect();
    const p=e.touches?e.touches[0]:e;
    return {
      x:(p.clientX-r.left)*c.width/r.width,
      y:(p.clientY-r.top)*c.height/r.height
    };
  }

  function down(e){
    e.preventDefault();
    drawing=true;
    pts=[pos(e)];
    ctx.beginPath();
    ctx.moveTo(pts[0].x,pts[0].y);
  }

  function move(e){
    if(!drawing)return;
    e.preventDefault();
    const p=pos(e);
    pts.push(p);
    ctx.lineTo(p.x,p.y);
    ctx.stroke();
  }

  function up(e){
    if(!drawing)return;
    drawing=false;

    if(pts.length>3){
      ctx.beginPath();
      ctx.moveTo(pts[0].x,pts[0].y);

      for(const p of pts.slice(1)){
        ctx.lineTo(p.x,p.y);
      }

      ctx.closePath();
      ctx.stroke();

      state.drawings[key]=normalizePolygon(
        pts,
        c.width,
        c.height
      );
    }
  }

  c.addEventListener("pointerdown",down);
  c.addEventListener("pointermove",move);
  window.addEventListener("pointerup",up);

  const clearBtn=$(`[data-clear="${key}"]`);

  if(clearBtn){
    clearBtn.onclick=()=>{
      ctx.clearRect(0,0,c.width,c.height);
      state.drawings[key]=null;
    };
  }
}
function normalizePolygon(points,w,h){
    const minx=Math.min(...points.map(p=>p.x)), maxx=Math.max(...points.map(p=>p.x));
    const miny=Math.min(...points.map(p=>p.y)), maxy=Math.max(...points.map(p=>p.y));
    const cx=(minx+maxx)/2, cy=(miny+maxy)/2, scale=Math.max(maxx-minx,maxy-miny)||1;
    // Reduce to max 28 vertices for stable physics.
    const step=Math.max(1,Math.ceil(points.length/28));
    return points.filter((_,i)=>i%step===0).map(p=>({x:(p.x-cx)/scale,y:(p.y-cy)/scale}));
  }
setupPad("puckCanvas","puck"); setupPad("malletCanvas","mallet");
  // ---------- Supabase messaging ----------
  async function openChannel(room){
    if(!supa) throw new Error("Supabase未設定");
    state.channel=supa.channel("air-"+room,{config:{broadcast:{ack:true}}});
    state.channel.on("broadcast",{event:"signal"},({payload})=>onSignal(payload));
    state.channel.on("broadcast",{event:"state"},({payload})=>onGameState(payload));
    state.channel.on("broadcast",{event:"ready"},({payload})=>onReady(payload));
    state.channel.on("broadcast",{event:"start"},({payload})=>startFromHost(payload));
    state.channel.on("broadcast",{event:"reset"},({payload})=>resetRound(payload));
await state.channel.subscribe((status)=>{
  console.log("Supabase channel status:", status);
});
  }
  function send(event,payload){state.channel?.send({type:"broadcast",event,payload:{...payload,from:state.playerId}})}
  function onSignal(p){
  if(p.from===state.playerId)return;
  if(state.host){
    state.opponent={...(state.opponent||{}),...p};
    return;
  }
  if(!state.opponent){
    state.opponent=p;
    state.role="guest";
    state.host=false;
    state.ready=false;
    show("draw");
    status("対戦相手が見つかりました");
  }
}
  function onReady(p){
    if(p.from===state.playerId)return;
    state.opponent={...(state.opponent||{}),...p,ready:true};
    if(state.host && state.ready){send("start",{drawings:{host:state.drawings,guest:p.drawings},seed:Math.random()});startGame({host:state.drawings,guest:p.drawings});}
  }
  function startFromHost(p){
    state.opponent={...(state.opponent||{}),drawings:p.drawings.guest};
    startGame(state.role==="host"?p.drawings:{host:p.drawings.host,guest:state.drawings});
  }
  function onGameState(p){ if(state.host || !state.running || p.from===state.playerId)return; state.game?.applyRemote(p);}
  function resetRound(p){ if(state.host)return; state.game?.remoteReset(p); }

  // ---------- Matchmaking ----------
  async function createRoom(){
    if(!supa){msg("先にconfig.jsへSupabase設定を入れてください。");return;}
    const code=await uniqueCode();
    const {error}=await supa.from("rooms").insert({code,host_id:state.playerId,status:"waiting"});
    if(error){msg("ルーム作成失敗: "+error.message);return;}
    state.room=code;state.role="host";state.host=true;state.ready=false;
    await openChannel(code);
    show("draw");status("ルーム "+code);msg("部屋番号: "+code+"　この番号を相手に伝えてください。");
  }
  async function uniqueCode(){
    const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for(let n=0;n<20;n++){let c="";for(let i=0;i<5;i++)c+=chars[Math.floor(Math.random()*chars.length)];
      const {data}=await supa.from("rooms").select("code").eq("code",c).maybeSingle(); if(!data)return c;}
    throw new Error("コード生成失敗");
  }
  async function joinRoom(){
    if(!supa){msg("先にconfig.jsへSupabase設定を入れてください。");return;}
    const code=$("roomInput").value.trim().toUpperCase();
    if(code.length!==5){msg("5桁の部屋番号を入力してください。");return;}
    const {data,error}=await supa.from("rooms").select("*").eq("code",code).eq("status","waiting").maybeSingle();
    if(error||!data){msg("そのルームは見つからないか、満員です。");return;}
    const {error:upErr}=await supa.from("rooms").update({guest_id:state.playerId,status:"playing"}).eq("code",code).eq("status","waiting");
    if(upErr){msg(upErr.message);return;}
    state.room=code;state.role="guest";state.host=false;
    await openChannel(code);show("draw");status("ルーム "+code);
    send("signal",{role:"guest"});
  }
  async function quickMatch(){
    if(!supa){msg("先にconfig.jsへSupabase設定を入れてください。");return;}
    show("draw");status("オンライン対戦相手を検索中…");msg("同じくマッチング待ちのプレイヤーを探しています。");
    const ticket=crypto.randomUUID();state.queueId=ticket;
    const {data}=await supa.from("match_queue").select("*").eq("status","waiting").neq("player_id",state.playerId).limit(1).maybeSingle();
    if(data){
      const room=await uniqueCode();
      const {error}=await supa.from("rooms").insert({code:room,host_id:data.player_id,guest_id:state.playerId,status:"playing"});
      if(error){msg(error.message);return;}
      await supa.from("match_queue").update({status:"matched",room_code:room}).eq("id",data.id);
      state.room=room;state.role="guest";state.host=false;await openChannel(room);send("signal",{role:"guest"});return;
    }
    await supa.from("match_queue").insert({id:ticket,player_id:state.playerId,status:"waiting"});
    const poll=setInterval(async()=>{
      const {data:r}=await supa.from("match_queue").select("*").eq("id",ticket).maybeSingle();
      if(r?.status==="matched" && r.room_code){clearInterval(poll);state.room=r.room_code;state.role="host";state.host=true;await openChannel(r.room_code);status("マッチング成立");send("signal",{role:"host"});}
    },1200);
  }

  // ---------- Physics game ----------
  class AirGame{
    constructor(drawings,host){
      this.host=host;this.W=1000;this.H=500;this.lastSend=0;this.seq=0;
      this.engine=Matter.Engine.create({enableSleeping:false});
      this.engine.gravity.x=0;this.engine.gravity.y=0;
      this.world=this.engine.world;
      this.canvas=$("gameCanvas");this.ctx=this.canvas.getContext("2d");
      this.resize();
      addEventListener("resize",()=>this.resize());
      this.scores=[0,0];this.currentPuck=Math.random()<.5?0:1;
      this.drawings=drawings;this.localSide=state.role==="host"?0:1;
      this.makeArena();this.makePuck();this.makeMallets();
      this.bindInput();
this.last=performance.now();
this.running=true;
requestAnimationFrame(t=>this.loop(t));
}

resize(){
  this.canvas.width=this.W;
  this.canvas.height=this.H;
}
    makeArena(){
      const o={isStatic:true,restitution:1,friction:0};
      Matter.World.add(this.world,[
        Matter.Bodies.rectangle(this.W/2,-12,this.W,24,o),
        Matter.Bodies.rectangle(this.W/2,this.H+12,this.W,24,o),
        Matter.Bodies.rectangle(-12,this.H/2,24,this.H,o),
        Matter.Bodies.rectangle(this.W+12,this.H/2,24,this.H,o),
        Matter.Bodies.rectangle(this.W/2,0,4,4,{isStatic:true})
      ]);
      this.goalW=260;
    }
    bodyFromDrawing(d,x,y,scale,options={}){
      const verts=(d&&d.length>2?d:[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}])
        .map(p=>({x:p.x*scale,y:p.y*scale}));
      return Matter.Bodies.fromVertices(x,y,[verts],{restitution:.95,friction:.01,frictionAir:.002,...options},true);
    }
    makePuck(){
      const d=this.drawings[this.currentPuck]?.puck;
      this.puck=this.bodyFromDrawing(d,this.W/2,this.H/2,70);
      this.puck.label="puck";this.puck.playerShape=this.currentPuck;
      Matter.World.add(this.world,this.puck);
    }
    makeMallets(){
      this.mallets=[];
      for(let i=0;i<2;i++){
        const d=this.drawings[i]?.mallet;
        const x=i===0?220:780;
        const y=this.H/2;
        const b=this.bodyFromDrawing(d,x,y,105,{isStatic:true});
        b.label="mallet"+i;b.player=i;this.mallets[i]=b;Matter.World.add(this.world,b);
      }
    }
    resetPuck(nextPlayer){
      Matter.World.remove(this.world,this.puck);this.currentPuck=nextPlayer;
      this.makePuck();
      Matter.Body.setPosition(this.puck,{x:this.W/2,y:this.H/2});
      Matter.Body.setVelocity(this.puck,{x:(Math.random()<.5?-1:1)*7,y:(Math.random()-.5)*5});
      this.roundPause=performance.now()+900;
    }
    score(side){
      if(this.roundPause&&performance.now()<this.roundPause)return;
      this.scores[side]++;
      $("score1").textContent=this.scores[0];$("score2").textContent=this.scores[1];
      if(this.scores[side]>=5){this.finish(side);return;}
      this.resetPuck(1-this.currentPuck);
      send("reset",{scores:this.scores,currentPuck:this.currentPuck});
    }
    finish(side){
      this.running=false;
      $("resultTitle").textContent=(side===this.localSide?"WIN!":"LOSE…");
      show("result");send("state",{final:true,scores:this.scores,winner:side});
    }
    applyRemote(p){
      if(p.final){this.running=false;show("result");$("resultTitle").textContent=(p.winner===this.localSide?"WIN!":"LOSE…");return}
      if(p.puck){Matter.Body.setPosition(this.puck,p.puck.pos);Matter.Body.setVelocity(this.puck,p.puck.vel);Matter.Body.setAngle(this.puck,p.puck.angle)}
      if(p.mallets)for(let i=0;i<2;i++)if(p.mallets[i])Matter.Body.setPosition(this.mallets[i],p.mallets[i]);
      if(p.scores){this.scores=p.scores;$("score1").textContent=p.scores[0];$("score2").textContent=p.scores[1]}
    }
    remoteReset(p){this.scores=p.scores; $("score1").textContent=p.scores[0];$("score2").textContent=p.scores[1];this.resetPuck(p.currentPuck)}
    bindInput(){
      const c=this.canvas;let drag=false;
      const move=e=>{
        if(!drag)return;const r=c.getBoundingClientRect(),x=(e.clientX-r.left)*this.W/r.width,y=(e.clientY-r.top)*this.H/r.height;
        const side=this.localSide;const minX=side?this.W/2+40:40,maxX=side?this.W-40:this.W/2-40;
        Matter.Body.setPosition(this.mallets[side],{x:Math.max(minX,Math.min(maxX,x)),y:Math.max(55,Math.min(this.H-55,y))});
      };
      c.onpointerdown=e=>{drag=true;move(e);c.setPointerCapture(e.pointerId)};c.onpointermove=move;c.onpointerup=()=>drag=false;c.onpointercancel=()=>drag=false;
    }
    loop(t){
      if(!this.running)return;
      const dt=Math.min(32,t-this.last);this.last=t;
      if(this.host){
        if(!this.roundPause||t>this.roundPause)Matter.Engine.update(this.engine,dt);
        const x=this.puck.position.x,y=this.puck.position.y;
        // Goals are the center openings in the left/right walls.
        if(x<-25){this.score(1);return}
        if(x>this.W+25){this.score(0);return}
        if(this.puck.position.y<30||this.puck.position.y>this.H-30)Matter.Body.setVelocity(this.puck,{x:this.puck.velocity.x,y:-this.puck.velocity.y});
        if(t-this.lastSend>30){send("state",{puck:{pos:this.puck.position,vel:this.puck.velocity,angle:this.puck.angle},mallets:this.mallets.map(m=>m.position),scores:this.scores});this.lastSend=t}
      }
      this.draw();requestAnimationFrame(tt=>this.loop(tt));
    }
    draw(){
      const c=this.ctx;c.clearRect(0,0,this.W,this.H);
      c.fillStyle="#0b7775";c.fillRect(0,0,this.W,this.H);
      c.strokeStyle="#bff9ef";c.lineWidth=4;c.strokeRect(10,10,this.W-20,this.H-20);
      c.beginPath();c.moveTo(this.W/2,10);c.lineTo(this.W/2,this.H-10);c.stroke();
      c.beginPath();c.arc(this.W/2,this.H/2,90,0,Math.PI*2);c.stroke();
      c.fillStyle="#092e38";c.fillRect(0,this.H/2-130,18,260);c.fillRect(this.W-18,this.H/2-130,18,260);
      this.mallets.forEach((b,i)=>this.drawBody(b,i===this.localSide?"#ffcf4a":"#ff6b9d"));
      this.drawBody(this.puck,this.currentPuck===this.localSide?"#fff":"#d7e4ff");
    }
    drawBody(b,fill){
      const c=this.ctx;c.save();c.translate(b.position.x,b.position.y);c.rotate(b.angle);c.fillStyle=fill;c.strokeStyle="#18213a";c.lineWidth=3;
      const vs=b.vertices;c.beginPath();c.moveTo(vs[0].x-b.position.x,vs[0].y-b.position.y);for(const v of vs.slice(1))c.lineTo(v.x-b.position.x,v.y-b.position.y);c.closePath();c.fill();c.stroke();c.restore();
    }
  }

function startGame(drawings){
  console.log("★ AirGameを作成します");
  state.game=new AirGame(drawings,state.host);
  state.running=true;
  show("game");
  $("roundMsg").textContent="先に5点！";
    if(state.host){Matter.Body.setVelocity(state.game.puck,{x:(Math.random()<.5?-1:1)*7,y:(Math.random()-.5)*5});}
  }

  $("readyBtn").onclick=()=>{
    if(!state.drawings.puck||!state.drawings.mallet){$("readyMsg").textContent="パックとマレットの両方を描いてください。";return}
    state.ready=true;$("readyBtn").disabled=true;$("readyMsg").textContent="相手の準備を待っています…";
    send("ready",{drawings:state.drawings});
    if(state.host&&state.opponent?.ready){send("start",{drawings:{host:state.drawings,guest:state.opponent.drawings},seed:Math.random()});startGame({host:state.drawings,guest:state.opponent.drawings});}
  };
  $("quickBtn").onclick=quickMatch;$("createBtn").onclick=createRoom;$("joinBtn").onclick=joinRoom;
  $("backBtn").onclick=()=>location.reload();

  status("オンライン設定待ち");
  if(!hasCloud)msg("現在はゲーム本体のみ動作します。オンライン対戦を有効にするにはREADMEのSupabase設定をしてください。");
})();
