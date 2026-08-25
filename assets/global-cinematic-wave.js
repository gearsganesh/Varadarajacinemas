/*
 * Varadharaja Cinemas - Option B GOLD Background
 * Standalone drop-in background.
 *
 * Add this script as:
 *   <script type="module" src="assets/global-cinematic-wave-gold.js"></script>
 *
 * It creates its own fixed transparent WebGL canvas, so no HTML/CSS
 * background markup is required.
 *
 * Gold palette matches the existing Varadharaja theme.
 */

(function () {
  if (document.getElementById("varadharaja-gold-wave-canvas")) return;

  const createdCanvas = document.createElement("canvas");
  createdCanvas.id = "varadharaja-gold-wave-canvas";
  Object.assign(createdCanvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "5",
    pointerEvents: "none",
    display: "block"
  });
  document.body.prepend(createdCanvas);

  window.__varadharajaGoldCanvas = createdCanvas;

  const canvas = window.__varadharajaGoldCanvas || document.getElementById("varadharaja-gold-wave-canvas");
  const ctx = canvas.getContext("2d", { alpha: true });

  let W = innerWidth, H = innerHeight;
  let dpr = Math.min(devicePixelRatio || 1, 1.5);
  let isMobile = matchMedia("(max-width:700px)").matches ||
                 matchMedia("(pointer:coarse)").matches;
  let reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;

  const pointer = {x:0, y:0, tx:0, ty:0};
  let scrollY = window.scrollY || 0;
  let scrollVelocity = 0;
  let lastScroll = scrollY;

  function resizeCanvas(){
    W = innerWidth; H = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, isMobile ? 1.15 : 1.5);
    canvas.width = Math.floor(W*dpr);
    canvas.height = Math.floor(H*dpr);
    canvas.style.width = W+"px";
    canvas.style.height = H+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resizeCanvas();
  addEventListener("resize", resizeCanvas, {passive:true});

  addEventListener("pointermove", e => {
    if(isMobile) return;
    pointer.tx = (e.clientX/W-.5)*2;
    pointer.ty = -(e.clientY/H-.5)*2;
  },{passive:true});

  addEventListener("scroll",()=>{
    const n=window.scrollY;
    scrollVelocity=Math.max(-50,Math.min(50,n-lastScroll));
    scrollY=n;
    lastScroll=n;
  },{passive:true});

  function drawFallback(now){
    const rawT = now * 0.00034;
    const motion = reduced ? 0.12 : 1;
    const t = rawT * motion;

    const dx = pointer.tx - pointer.x;
    const dy = pointer.ty - pointer.y;
    pointer.x += dx * 0.075;
    pointer.y += dy * 0.075;
    pointer.vx = (pointer.vx || 0) * 0.88 + dx * 0.18;
    pointer.vy = (pointer.vy || 0) * 0.88 + dy * 0.18;

    ctx.clearRect(0,0,W,H);

    const glowColor="214,168,79";
    const particleColor="215,169,104";
    const dustColor="156,122,75";

    const gx = W*(.5 + pointer.x*.11);
    const gy = H*(.54 - pointer.y*.10);
    const g=ctx.createRadialGradient(gx,gy,0,gx,gy,Math.max(W,H)*.70);
    g.addColorStop(0,`rgba(${glowColor},${.11})`);
    g.addColorStop(.28,`rgba(${glowColor},${.05})`);
    g.addColorStop(.62,`rgba(${glowColor},${.014})`);
    g.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=g;
    ctx.fillRect(0,0,W,H);

    const cols=isMobile?40:92;
    const rows=isMobile?30:56;
    const centerY=H*.58;
    const scrollForce = Math.max(-1.6,Math.min(1.6,scrollVelocity*.045));

    for(let z=0;z<rows;z++){
      const depth=z/(rows-1);
      const perspective=.18+.82*depth;
      const yBase=centerY+(depth-.5)*H*.82;

      for(let x=0;x<cols;x++){
        const u=x/(cols-1)-.5;
        const px0=W*.5+u*W*1.48*perspective;
        const waveA=Math.sin(u*7.2+t*4.5+depth*3.8)*H*.050;
        const waveB=Math.sin(u*15.0-t*3.0-depth*7.0)*H*.023;
        const waveC=Math.cos((u*2.2+depth*1.7)*10+t*2.0)*H*.016;
        const travelling=Math.sin((u-depth*.72)*18+t*5.7)*H*.012;

        const cx = pointer.x;
        const cy = pointer.y;
        const du = u-cx*.72;
        const dd = depth-(.5-cy*.16);
        const cursorD = Math.sqrt(du*du + dd*dd);
        const cursorWake = Math.exp(-cursorD*cursorD*10.0);
        const cursorLift =
          (pointer.vy*H*.055 + pointer.y*H*.018) * cursorWake;
        const cursorSide =
          pointer.vx*W*.035*cursorWake*(.4+depth);

        const ripplePhase = cursorD*16.0 - t*10.0;
        const ripple = Math.sin(ripplePhase) *
                       Math.exp(-cursorD*3.3) * H*.025;

        const scrollWave =
          Math.sin(depth*15 - t*7 + scrollY*.012) *
          scrollForce * H*.022;

        const py=yBase+waveA+waveB+waveC+travelling+
                 cursorLift+ripple+scrollWave+pointer.y*H*.018;

        const px=px0+cursorSide+pointer.x*W*(.025+.045*depth);
        const centreDensity=Math.exp(-Math.pow(u*2.8,2));
        const crest=Math.max(0,Math.sin(u*5.5+t*2.4+depth*4));
        const density=.32+.62*centreDensity+.18*crest;
        const hash=Math.abs(Math.sin((x+1)*12.9898+(z+1)*78.233))*43758.5453;
        if((hash-Math.floor(hash))>Math.min(.98,density)) continue;

        const brightness=.32+.55*centreDensity+.25*Math.max(0,crest);
        const radius=(.55+depth*1.55)*(1+cursorWake*.9+Math.max(0,crest)*.35);

        ctx.fillStyle=`rgba(${particleColor},${Math.min(.95,.18+brightness*.62)})`;
        ctx.beginPath();
        ctx.arc(px,py,radius,0,Math.PI*2);
        ctx.fill();
      }
    }

    const dustCount=isMobile?130:360;
    for(let i=0;i<dustCount;i++){
      const seed=i*17.371;
      const bx=(Math.sin(seed)*.5+.5);
      const by=(Math.cos(seed*1.7)*.5+.5);
      const x=(bx*W + pointer.x*28*(.2+bx))%W;
      const y=(by*H + Math.sin(t*1.7+seed)*18 + pointer.y*20)%H;
      const a=.035+.15*((i%9)/9);
      const r=.45+(i%5)*.33;
      ctx.fillStyle=`rgba(${dustColor},${a})`;
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }

    const hg=ctx.createRadialGradient(
      W*(.5+pointer.x*.08),H*(.64-pointer.y*.05),0,
      W*.5,H*.64,W*.56
    );
    hg.addColorStop(0,`rgba(${glowColor},${.04})`);
    hg.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=hg;
    ctx.fillRect(0,0,W,H);

    scrollVelocity*=0.91;
    requestAnimationFrame(drawFallback);
  }

  async function startThree(){
    try{
      const THREE=await import("https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js");

      const renderer=new THREE.WebGLRenderer({
        canvas, antialias:true, alpha:true,
        powerPreference:"high-performance"
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,isMobile?1.15:1.5));
      renderer.setSize(W,H,false);
      renderer.setClearColor(0x000000,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;

      const scene=new THREE.Scene();
      scene.fog=new THREE.FogExp2(0x020403,.048);

      const camera=new THREE.PerspectiveCamera(55,W/H,.1,140);
      camera.position.set(0,2.6,15);
      camera.lookAt(0,0,0);

      const cols=isMobile?48:88, rows=isMobile?32:56, count=cols*rows;
      const positions=new Float32Array(count*3);
      const base=new Float32Array(count*3);
      const depth=new Float32Array(count);

      for(let z=0;z<rows;z++){
        const zz=(z/(rows-1)-.5)*22;
        for(let x=0;x<cols;x++){
          const xx=(x/(cols-1)-.5)*25;
          const i=z*cols+x,j=i*3;
          const yy=.35*Math.sin(xx*.5)+.16*Math.cos(zz*.7);
          positions[j]=base[j]=xx;
          positions[j+1]=base[j+1]=yy;
          positions[j+2]=base[j+2]=zz;
          depth[i]=z/(rows-1);
        }
      }

      const geo=new THREE.BufferGeometry();
      geo.setAttribute("position",new THREE.BufferAttribute(positions,3));

      const mat=new THREE.PointsMaterial({
        color:0xd7a968,
        size:isMobile?.095:.075,
        transparent:true,opacity:.78,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
        sizeAttenuation:true
      });

      const wave=new THREE.Points(geo,mat);
      wave.rotation.x=-.13;
      scene.add(wave);

      const dustCount=isMobile?320:900;
      const dustPos=new Float32Array(dustCount*3);
      for(let i=0;i<dustCount;i++){
        dustPos[i*3]=(Math.random()-.5)*32;
        dustPos[i*3+1]=(Math.random()-.5)*16;
        dustPos[i*3+2]=-10+Math.random()*28;
      }
      const dg=new THREE.BufferGeometry();
      dg.setAttribute("position",new THREE.BufferAttribute(dustPos,3));
      const dm=new THREE.PointsMaterial({
        color:0x9c7a4b,size:isMobile?.04:.048,
        transparent:true,opacity:.34,depthWrite:false,
        blending:THREE.AdditiveBlending
      });
      const dust=new THREE.Points(dg,dm);
      scene.add(dust);

      const ambient=new THREE.AmbientLight(0xffffff,.18);
      scene.add(ambient);

      const warm=new THREE.PointLight(0xffb45d,11,35,2);
      warm.position.set(-7,5,8);
      scene.add(warm);

      const gold=new THREE.PointLight(0xd99a50,5,30,2);
      gold.position.set(7,-2,3);
      scene.add(gold);

      const glow=new THREE.Mesh(
        new THREE.PlaneGeometry(22,12),
        new THREE.MeshBasicMaterial({
          color:0x5c3a18,transparent:true,opacity:.060,
          depthWrite:false,blending:THREE.AdditiveBlending
        })
      );
      glow.position.set(0,.8,-5);scene.add(glow);

      const glow2=new THREE.Mesh(
        new THREE.PlaneGeometry(15,8),
        new THREE.MeshBasicMaterial({
          color:0xffb45d,transparent:true,opacity:.030,
          depthWrite:false,blending:THREE.AdditiveBlending
        })
      );
      glow2.position.set(0,1.2,-4.2);scene.add(glow2);

      function animate(now){
        requestAnimationFrame(animate);
        const motion=reduced?.12:1;
        const t=now*.00042*motion;
        const pDx=pointer.tx-pointer.x;
        const pDy=pointer.ty-pointer.y;
        pointer.x+=pDx*.075;
        pointer.y+=pDy*.075;
        pointer.vx=(pointer.vx||0)*.88+pDx*.18;
        pointer.vy=(pointer.vy||0)*.88+pDy*.18;

        const pos=geo.attributes.position.array;

        for(let z=0;z<rows;z++)for(let x=0;x<cols;x++){
          const i=z*cols+x,j=i*3,xx=base[j],zz=base[j+2];
          const a=xx*.47+t*2.8+zz*.12;
          const b=xx*.2-t*1.45-zz*.18;

          let y=base[j+1]+Math.sin(a)*.6+Math.cos(b)*.3+
                Math.sin((xx+zz)*.16+t*1.8)*.17;

          const dx=xx*.095-pointer.x*1.8;
          const dz=zz*.07-pointer.y*.85;
          const d=Math.sqrt(dx*dx+dz*dz);
          const cursorWake=Math.exp(-d*d*1.55);

          y+=cursorWake*((pointer.vy||0)*.75+pointer.y*.55);

          const ripple=Math.sin(d*7.5-t*8.0)*
                       Math.exp(-d*1.8)*.22;
          y+=ripple;

          y+=Math.sin(zz*.33+t*7+scrollVelocity*.05)*
             Math.min(.34,Math.abs(scrollVelocity)*.008)*motion;

          pos[j+1]=y;
          pos[j]=xx+pointer.x*(.08+depth[i]*.06);
        }

        geo.attributes.position.needsUpdate=true;
        wave.position.x+=(pointer.x*.62-wave.position.x)*.045;
        wave.position.y+=(pointer.y*.28-wave.position.y)*.045;
        wave.rotation.z+=(pointer.x*.018-wave.rotation.z)*.035;

        camera.position.x+=(pointer.x*1.15-camera.position.x)*.04;
        camera.position.y+=((2.6+pointer.y*.55)-camera.position.y)*.04;
        camera.position.z+=((15-Math.min(2.8,scrollY*.0010))-camera.position.z)*.045;

        dust.rotation.y+=.00028*motion + (pointer.x||0)*.00055;
        dust.rotation.x=Math.sin(t*.55)*.045 + (pointer.y||0)*.025;

        mat.color.setHex(0xd7a968);
        dm.color.setHex(0x9c7a4b);
        glow.material.color.setHex(0x5c3a18);
        glow2.material.color.setHex(0xffb45d);

        glow.material.opacity=.060+Math.sin(t*2.6)*.008*motion;
        glow2.material.opacity=.030+Math.sin(t*2.2+.8)*.005*motion;

        scrollVelocity*=Math.pow(.035,Math.min(.04,Math.max(.001,1/60)));
        renderer.render(scene,camera);
      }

      addEventListener("resize",()=>{
        renderer.setPixelRatio(Math.min(devicePixelRatio||1,isMobile?1.15:1.5));
        renderer.setSize(innerWidth,innerHeight,false);
        camera.aspect=innerWidth/innerHeight;
        camera.updateProjectionMatrix();
      },{passive:true});

      requestAnimationFrame(animate);

    }catch(error){
      console.warn("Three.js background unavailable, using Canvas fallback:",error);
      canvas.style.display="block";
      requestAnimationFrame(drawFallback);
    }
  }

  startThree();
})();
