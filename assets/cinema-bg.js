import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js';

(() => {
  if (window.__varadarajaImmersive) return;
  window.__varadarajaImmersive = true;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const canvas = document.createElement('canvas');
  canvas.id = 'cinema-webgl';
  Object.assign(canvas.style, {
    position:'fixed', inset:'0', width:'100%', height:'100%',
    zIndex:'0', pointerEvents:'none', opacity:mobile?'0.72':'0.82'
  });
  document.body.prepend(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true, powerPreference:'high-performance'});
  } catch (error) {
    canvas.remove();
    console.warn('Three.js WebGL unavailable:', error);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.7));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 180);
  camera.position.set(0, 0.8, 15);

  // Deep 3D particle tunnel. The particles are deliberately distributed in depth,
  // rather than on a flat screen, so cursor movement and scrolling have visible parallax.
  const particleCount = mobile ? 8500 : 26000;
  const positions = new Float32Array(particleCount * 3);
  const randoms = new Float32Array(particleCount * 4);

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    const i4 = i * 4;
    const z = -Math.random() * 125 + 12;
    const depth = Math.max(0.2, (-z + 8) / 125);
    const radius = (2.0 + Math.random() * 12.0) * (0.65 + depth * 0.9);
    const angle = Math.random() * Math.PI * 2;
    positions[i3] = Math.cos(angle) * radius;
    positions[i3 + 1] = Math.sin(angle) * radius * 0.62;
    positions[i3 + 2] = z;
    randoms[i4] = Math.random();
    randoms[i4 + 1] = Math.random();
    randoms[i4 + 2] = Math.random();
    randoms[i4 + 3] = Math.random();
  }

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 4));

  const particleMaterial = new THREE.ShaderMaterial({
    transparent:true,
    depthWrite:false,
    blending:THREE.AdditiveBlending,
    uniforms:{
      uTime:{value:0},
      uScroll:{value:0},
      uPixelRatio:{value:renderer.getPixelRatio()},
      uSize:{value:mobile?1.5:1.8}
    },
    vertexShader:`
      attribute vec4 aRandom;
      uniform float uTime;
      uniform float uScroll;
      uniform float uPixelRatio;
      uniform float uSize;
      varying float vGlow;
      varying float vDepth;
      void main(){
        vec3 p=position;
        float depth=-p.z;
        float orbit=sin(uTime*0.16+aRandom.x*6.2831+depth*0.045)*0.55;
        float wave=sin(depth*0.14+uTime*0.55+aRandom.y*8.0);
        float twist=uTime*0.025+depth*0.012;
        float ca=cos(twist), sa=sin(twist);
        float xx=p.x*ca-p.y*sa;
        float yy=p.x*sa+p.y*ca;
        p.x=xx+orbit;
        p.y=yy+wave*(0.35+aRandom.z*0.8);

        // Scroll moves the viewer through the particle field.
        p.z += mod(uScroll*72.0 + aRandom.w*10.0, 10.0);
        p.x += sin(uScroll*5.0+depth*0.025)*0.8;

        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*mv;
        float perspective=42.0/max(5.0,-mv.z);
        gl_PointSize=uSize*uPixelRatio*(1.5+aRandom.x*3.5)*perspective;
        vDepth=clamp(1.0-(-mv.z/150.0),0.0,1.0);
        vGlow=0.55+0.45*sin(aRandom.y*10.0+uTime*1.7);
      }
    `,
    fragmentShader:`
      precision highp float;
      varying float vGlow;
      varying float vDepth;
      void main(){
        vec2 p=gl_PointCoord-0.5;
        float d=length(p);
        float soft=smoothstep(0.5,0.0,d);
        float core=smoothstep(0.16,0.0,d);
        vec3 gold=vec3(1.0,0.64,0.15);
        vec3 white=vec3(1.0,0.92,0.65);
        vec3 color=mix(gold,white,core*0.8);
        float alpha=soft*(0.22+0.55*vGlow)*(0.45+vDepth);
        gl_FragColor=vec4(color,alpha);
      }
    `
  });

  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);

  // Large luminous rings create the obvious 3D depth that the previous shader lacked.
  const rings = [];
  const ringGroup = new THREE.Group();
  scene.add(ringGroup);
  const ringCount = mobile ? 7 : 10;

  for (let i = 0; i < ringCount; i++) {
    const geometry = new THREE.TorusGeometry(3.8 + (i % 3) * 0.75, 0.018, 8, 96);
    const material = new THREE.MeshBasicMaterial({
      color: i % 3 === 0 ? 0xffc45a : 0x9b5b18,
      transparent:true,
      opacity:i % 3 === 0 ? 0.72 : 0.38,
      blending:THREE.AdditiveBlending,
      depthWrite:false
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.position.z = -8 - i * 10;
    ring.rotation.x = Math.PI * 0.5;
    ring.rotation.z = i * 0.33;
    ring.userData.phase = i * 0.73;
    ringGroup.add(ring);
    rings.push(ring);
  }

  // A subtle central cinematic halo gives the tunnel a focal point without obscuring text.
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(5.4, 64),
    new THREE.MeshBasicMaterial({
      color:0x7a3b13,
      transparent:true,
      opacity:0.075,
      blending:THREE.AdditiveBlending,
      depthWrite:false
    })
  );
  halo.position.set(0,0,-28);
  scene.add(halo);

  let targetScroll = 0;
  let currentScroll = 0;
  let targetX = 0;
  let targetY = 0;
  let mouseX = 0;
  let mouseY = 0;

  function resize(){
    const w=window.innerWidth;
    const h=window.innerHeight;
    renderer.setSize(w,h,false);
    camera.aspect=w/Math.max(1,h);
    camera.updateProjectionMatrix();
    particleMaterial.uniforms.uPixelRatio.value=renderer.getPixelRatio();
  }

  function updateScroll(){
    const max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
    targetScroll=window.scrollY/max;
  }

  function pointerMove(e){
    targetX=(e.clientX/Math.max(1,window.innerWidth)-0.5)*2;
    targetY=(e.clientY/Math.max(1,window.innerHeight)-0.5)*2;
  }

  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('scroll',updateScroll,{passive:true});
  window.addEventListener('pointermove',pointerMove,{passive:true});
  resize();
  updateScroll();

  const clock=new THREE.Clock();
  function animate(){
    const t=clock.getElapsedTime();
    currentScroll += (targetScroll-currentScroll)*0.075;
    mouseX += (targetX-mouseX)*0.075;
    mouseY += (targetY-mouseY)*0.075;

    particleMaterial.uniforms.uTime.value=t;
    particleMaterial.uniforms.uScroll.value=currentScroll;

    // Cursor controls the camera and the entire tunnel visibly follows it.
    camera.position.x = mouseX*2.15;
    camera.position.y = 0.8 - mouseY*1.15;
    camera.position.z = 15 - currentScroll*18;
    camera.rotation.z = mouseX*0.018;
    camera.lookAt(mouseX*1.4, -mouseY*0.7, -25-currentScroll*15);

    particles.rotation.z = t*0.018 + mouseX*0.045;
    particles.rotation.x = mouseY*0.018;

    rings.forEach((ring,i)=>{
      ring.rotation.z += 0.0015 + i*0.00025;
      ring.rotation.y = Math.sin(t*0.32+ring.userData.phase)*0.42 + mouseX*0.12;
      ring.rotation.x = Math.PI*0.5 + Math.cos(t*0.22+ring.userData.phase)*0.22 + mouseY*0.08;
      ring.position.x = Math.sin(t*0.18+ring.userData.phase)*0.8 + mouseX*0.8;
      ring.position.y = Math.cos(t*0.15+ring.userData.phase)*0.42 - mouseY*0.5;
      ring.material.opacity = (i%3===0?0.66:0.30) + Math.sin(t*1.1+ring.userData.phase)*0.08;
    });

    halo.position.x = mouseX*1.5;
    halo.position.y = -mouseY*0.8;
    halo.material.opacity = 0.055 + Math.sin(t*0.7)*0.018;

    renderer.render(scene,camera);
    if(!reduced) requestAnimationFrame(animate);
  }

  if(reduced) renderer.render(scene,camera);
  else requestAnimationFrame(animate);
})();
