import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js';

(() => {
  if (window.__varadarajaWebGL) return;
  window.__varadarajaWebGL = true;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const canvas = document.createElement('canvas');
  canvas.id = 'cinema-webgl';
  Object.assign(canvas.style, {position:'fixed',inset:'0',width:'100%',height:'100%',zIndex:'0',pointerEvents:'none',opacity:mobile?'0.58':'0.68'});
  document.body.prepend(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas,antialias:false,alpha:true,powerPreference:'high-performance'});
  } catch (error) {
    canvas.remove();
    console.warn('Varadaraja WebGL unavailable:', error);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 140);
  camera.position.set(0, 2.4, 16);

  const count = mobile ? 6500 : 19000;
  const positions = new Float32Array(count * 3);
  const randoms = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const i4 = i * 4;
    positions[i3] = (Math.random() - 0.5) * 42;
    positions[i3 + 1] = (Math.random() - 0.5) * 11;
    positions[i3 + 2] = -Math.random() * 82 + 7;
    randoms[i4] = Math.random();
    randoms[i4 + 1] = Math.random();
    randoms[i4 + 2] = Math.random();
    randoms[i4 + 3] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 4));

  const material = new THREE.ShaderMaterial({
    transparent:true,
    depthWrite:false,
    blending:THREE.AdditiveBlending,
    uniforms:{uTime:{value:0},uScroll:{value:0},uPixelRatio:{value:renderer.getPixelRatio()},uPointSize:{value:mobile?1.75:1.55}},
    vertexShader:`
      attribute vec4 aRandom;
      uniform float uTime;
      uniform float uScroll;
      uniform float uPixelRatio;
      uniform float uPointSize;
      varying float vDepth;
      varying float vEnergy;
      void main(){
        vec3 p=position;
        float depth=-p.z;
        float waveA=sin(p.x*0.34+depth*0.105-uTime*0.42+aRandom.x*5.0);
        float waveB=sin(p.x*0.16-depth*0.18+uTime*0.22+aRandom.y*8.0);
        float waveC=cos(depth*0.12+p.x*0.28-uTime*0.18);
        float envelope=exp(-abs(p.x)*0.035);
        p.y+=(waveA*1.15+waveB*0.75+waveC*0.35)*envelope;
        p.y+=sin(p.x*0.08+uTime*0.12)*0.35;
        p.x+=sin(depth*0.075+uTime*0.16+aRandom.z*6.2831)*0.55;
        float travel=uScroll*34.0;
        p.z+=mod(travel+aRandom.w*7.0,8.0);
        p.y+=uScroll*1.8;
        vec4 mvPosition=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*mvPosition;
        float perspective=1.0/max(1.0,-mvPosition.z*0.055);
        gl_PointSize=uPointSize*uPixelRatio*(2.0+aRandom.x*2.5)*perspective;
        vDepth=clamp(1.0-(-mvPosition.z/100.0),0.0,1.0);
        vEnergy=clamp(0.45+envelope*0.55+aRandom.y*0.35,0.0,1.0);
      }
    `,
    fragmentShader:`
      precision highp float;
      varying float vDepth;
      varying float vEnergy;
      void main(){
        vec2 uv=gl_PointCoord-0.5;
        float d=length(uv);
        float glow=smoothstep(0.5,0.02,d);
        float core=smoothstep(0.18,0.0,d);
        float fade=pow(vDepth,0.35)*vEnergy;
        vec3 gold=vec3(0.92,0.61,0.20);
        vec3 amber=vec3(1.0,0.78,0.35);
        vec3 burgundy=vec3(0.42,0.035,0.075);
        vec3 color=mix(gold,amber,core);
        color=mix(color,burgundy,max(0.0,0.22-vEnergy)*2.0);
        gl_FragColor=vec4(color,glow*fade*0.72);
      }
    `
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  const fog = new THREE.Mesh(
    new THREE.PlaneGeometry(70,45),
    new THREE.ShaderMaterial({
      transparent:true,
      depthWrite:false,
      blending:THREE.AdditiveBlending,
      uniforms:{uTime:{value:0},uScroll:{value:0}},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`precision highp float;uniform float uTime;uniform float uScroll;varying vec2 vUv;void main(){vec2 p=vUv-0.5;float d=length(p*vec2(1.0,0.65));float beam=smoothstep(0.65,0.02,d);float flow=0.5+0.5*sin(p.x*8.0+p.y*5.0+uTime*0.16+uScroll*4.0);vec3 c=mix(vec3(0.28,0.015,0.045),vec3(0.78,0.38,0.08),flow);gl_FragColor=vec4(c,beam*0.035);}`
    })
  );
  fog.position.set(0,0,-5);
  fog.rotation.x=-0.12;
  scene.add(fog);

  let targetScroll=0;
  let currentScroll=0;
  let pointerX=0;
  let pointerY=0;
  let targetPointerX=0;
  let targetPointerY=0;

  function resize(){
    const width=window.innerWidth;
    const height=window.innerHeight;
    renderer.setSize(width,height,false);
    camera.aspect=width/Math.max(1,height);
    camera.updateProjectionMatrix();
    material.uniforms.uPixelRatio.value=renderer.getPixelRatio();
  }

  function updateScroll(){
    const max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
    targetScroll=window.scrollY/max;
  }

  function pointerMove(event){
    targetPointerX=(event.clientX/Math.max(1,window.innerWidth)-0.5)*2;
    targetPointerY=(event.clientY/Math.max(1,window.innerHeight)-0.5)*2;
  }

  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('scroll',updateScroll,{passive:true});
  window.addEventListener('pointermove',pointerMove,{passive:true});
  resize();
  updateScroll();

  const clock=new THREE.Clock();
  const animate=()=>{
    const time=clock.getElapsedTime();
    currentScroll+=(targetScroll-currentScroll)*0.055;
    pointerX+=(targetPointerX-pointerX)*0.035;
    pointerY+=(targetPointerY-pointerY)*0.035;
    material.uniforms.uTime.value=time;
    material.uniforms.uScroll.value=currentScroll;
    fog.material.uniforms.uTime.value=time;
    fog.material.uniforms.uScroll.value=currentScroll;
    camera.position.x=pointerX*0.7;
    camera.position.y=2.4-pointerY*0.45+currentScroll*1.8;
    camera.position.z=16-currentScroll*11;
    camera.lookAt(pointerX*0.25,currentScroll*1.1,-12-currentScroll*8);
    points.rotation.y=Math.sin(time*0.06)*0.025;
    points.rotation.x=Math.sin(time*0.045)*0.012;
    fog.position.y=Math.sin(time*0.08)*0.35;
    renderer.render(scene,camera);
    if(!reduced) requestAnimationFrame(animate);
  };

  if(reduced) renderer.render(scene,camera);
  else requestAnimationFrame(animate);
})();
