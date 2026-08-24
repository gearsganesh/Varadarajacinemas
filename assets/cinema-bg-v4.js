import * as THREE from 'three';
import { EffectComposer } from 'https://raw.githubusercontent.com/gearsganesh/Tools-Resources/3a56b819c4e19f6789cc38b88635de2f6612b3ce/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://raw.githubusercontent.com/gearsganesh/Tools-Resources/3a56b819c4e19f6789cc38b88635de2f6612b3ce/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://raw.githubusercontent.com/gearsganesh/Tools-Resources/3a56b819c4e19f6789cc38b88635de2f6612b3ce/examples/jsm/postprocessing/UnrealBloomPass.js';

const hero = document.querySelector('.hero');
const state = { scene:null, camera:null, renderer:null, composer:null, bloom:null, particles:null, particleData:[], reels:[], strip:null, pointer:new THREE.Vector2(), target:new THREE.Vector2(), clock:new THREE.Clock(), raf:0, visible:true, mobile:false };

function createScene(){
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x070707);
  state.scene.fog = new THREE.Fog(0x070707, 5, 30);
}

function createCamera(){
  state.camera = new THREE.PerspectiveCamera(46, hero.clientWidth / hero.clientHeight, 0.1, 50);
  state.camera.position.set(0,0.4,11);
}

function createRenderer(){
  const canvas=document.createElement('canvas');
  canvas.className='cinematic-background-canvas';
  canvas.setAttribute('aria-hidden','true');
  hero.prepend(canvas);
  try{
    state.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:!state.mobile,powerPreference:'high-performance'});
    state.renderer.setPixelRatio(Math.min(devicePixelRatio || 1,state.mobile?1.2:1.5));
    state.renderer.setClearColor(0x070707,0);
    state.renderer.outputColorSpace=THREE.SRGBColorSpace;
    state.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure=0.95;
  }catch(error){ console.warn('WebGL unavailable:',error); canvas.remove(); return false; }
  return true;
}

function createParticles(){
  const count=state.mobile?220:650;
  const positions=new Float32Array(count*3);
  const data=[];
  for(let i=0;i<count;i++){
    const n=i*3, depth=Math.random();
    const x=(Math.random()-0.5)*22, y=(Math.random()-0.5)*11, z=-1.5-depth*22;
    positions[n]=x; positions[n+1]=y; positions[n+2]=z;
    data.push({x,y,z,phase:Math.random()*Math.PI*2,speed:0.045+Math.random()*0.09,drift:0.05+Math.random()*0.15});
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({color:0xd6a84f,size:state.mobile?0.075:0.095,sizeAttenuation:true,transparent:true,opacity:0.58,depthWrite:false,blending:THREE.AdditiveBlending});
  state.particles=new THREE.Points(geometry,material);
  state.scene.add(state.particles); state.particleData=data;
}

function createFilmReel(x,y,z,scale,rotation){
  const group=new THREE.Group(); group.position.set(x,y,z); group.scale.setScalar(scale); group.rotation.z=rotation;
  const metal=new THREE.MeshStandardMaterial({color:0x3b3328,metalness:0.82,roughness:0.28});
  const edge=new THREE.MeshStandardMaterial({color:0x8b6a35,metalness:0.9,roughness:0.2});
  const dark=new THREE.MeshBasicMaterial({color:0x0a0908});
  group.add(new THREE.Mesh(new THREE.TorusGeometry(2.05,0.14,12,80),edge));
  const plate=new THREE.Mesh(new THREE.CylinderGeometry(1.84,1.84,0.07,64),metal); plate.rotation.x=Math.PI/2; group.add(plate);
  const hubRing=new THREE.Mesh(new THREE.TorusGeometry(0.48,0.1,10,40),edge); group.add(hubRing);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.34,0.13,40),metal); hub.rotation.x=Math.PI/2; group.add(hub);
  const axle=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.18,24),dark); axle.rotation.x=Math.PI/2; group.add(axle);
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    const spoke=new THREE.Mesh(new THREE.BoxGeometry(0.11,1.35,0.08),edge); spoke.position.set(Math.cos(a)*0.72,Math.sin(a)*0.72,0.08); spoke.rotation.z=a; group.add(spoke);
    const hole=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,0.1,24),dark); hole.rotation.x=Math.PI/2; hole.position.set(Math.cos(a)*1.2,Math.sin(a)*1.2,0.08); group.add(hole);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(0.22,0.022,6,20),edge); ring.position.copy(hole.position); ring.position.z+=0.07; group.add(ring);
  }
  const inner=new THREE.Mesh(new THREE.TorusGeometry(1.55,0.028,8,64),edge); inner.position.z=0.07; group.add(inner);
  state.scene.add(group); state.reels.push({group,baseX:x,baseY:y,phase:Math.random()*6.28});
}

function createFilmStrip(){
  const group=new THREE.Group();
  const frameMat=new THREE.MeshStandardMaterial({color:0x24201a,metalness:0.25,roughness:0.7,transparent:true,opacity:0.5});
  const edgeMat=new THREE.MeshBasicMaterial({color:0x806338,transparent:true,opacity:0.45});
  const segments=state.mobile?7:11;
  for(let i=0;i<segments;i++){
    const t=i/(segments-1),x=-8+t*16,y=-2.1+Math.sin(t*Math.PI*1.7)*0.7,z=-10-Math.sin(t*Math.PI)*1.4;
    const frame=new THREE.Mesh(new THREE.BoxGeometry(1.7,1.05,0.045),frameMat); frame.position.set(x,y,z); frame.rotation.z=Math.sin(t*Math.PI*1.7)*0.11; group.add(frame);
    for(const side of [-0.69,0.69]) for(const yy of [-0.34,0,0.34]){const hole=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,0.055,12),edgeMat); hole.rotation.x=Math.PI/2; hole.position.set(x+side,y+yy,z+0.04); group.add(hole);}
  }
  group.position.y=-0.4; state.scene.add(group); state.strip=group;
}

function createLights(){
  state.scene.add(new THREE.AmbientLight(0x806b4e,0.65));
  const key=new THREE.DirectionalLight(0xffd98b,1.5); key.position.set(-5,5,7); state.scene.add(key);
  const projector=new THREE.PointLight(0xd6a84f,3.5,20,2); projector.position.set(4,2,3); state.scene.add(projector);
  const fill=new THREE.PointLight(0x6b3028,1.1,18,2); fill.position.set(-5,-1,-5); state.scene.add(fill);
}

function createPostProcessing(){
  try{
    state.composer=new EffectComposer(state.renderer);
    state.composer.addPass(new RenderPass(state.scene,state.camera));
    if(!state.mobile){ state.bloom=new UnrealBloomPass(new THREE.Vector2(hero.clientWidth,hero.clientHeight),0.32,0.28,0.84); state.composer.addPass(state.bloom); }
  }catch(error){ console.warn('Bloom disabled:',error); state.composer=null; state.bloom=null; }
}

function resize(){
  if(!state.renderer)return;
  const w=Math.max(1,hero.clientWidth),h=Math.max(1,hero.clientHeight);
  state.camera.aspect=w/h; state.camera.updateProjectionMatrix();
  state.renderer.setPixelRatio(Math.min(devicePixelRatio||1,state.mobile?1.2:1.5)); state.renderer.setSize(w,h,false);
  if(state.composer)state.composer.setSize(w,h);
  if(state.bloom)state.bloom.resolution.set(w,h);
}

function pointerMove(e){ const r=hero.getBoundingClientRect(); state.target.x=((e.clientX-r.left)/r.width-0.5)*2; state.target.y=((e.clientY-r.top)/r.height-0.5)*2; }

function update(){
  const t=state.clock.getElapsedTime(); state.pointer.lerp(state.target,0.035);
  const p=state.pointer;
  state.camera.position.x+=(p.x*0.55-state.camera.position.x)*0.02;
  state.camera.position.y+=(0.4-p.y*0.22-state.camera.position.y)*0.02;
  state.camera.lookAt(p.x*0.25,-p.y*0.12,-4);
  const attr=state.particles.geometry.getAttribute('position');
  for(let i=0;i<state.particleData.length;i++){const d=state.particleData[i],n=i*3; attr.array[n]=d.x+Math.sin(t*d.speed+d.phase)*d.drift+p.x*0.12; attr.array[n+1]=d.y+Math.cos(t*d.speed*0.8+d.phase)*d.drift*0.6-p.y*0.08; attr.array[n+2]=d.z+Math.sin(t*0.06+d.phase)*0.12;} attr.needsUpdate=true;
  state.reels.forEach((r,i)=>{r.group.rotation.z+=0.00065+i*0.0002; r.group.rotation.y=Math.sin(t*0.04+r.phase)*0.04+p.x*0.06; r.group.position.x=r.baseX+p.x*(i?-.15:.22); r.group.position.y=r.baseY-p.y*0.08;});
  if(state.strip){state.strip.position.x=Math.sin(t*0.035)*0.22+p.x*0.08; state.strip.position.z=Math.cos(t*0.025)*0.15;}
}

function animate(){ if(!state.visible)return; state.raf=requestAnimationFrame(animate); update(); if(state.composer)state.composer.render(); else state.renderer.render(state.scene,state.camera); }

function init(){
  if(!hero)return;
  state.mobile=matchMedia('(max-width:760px)').matches;
  createScene(); createCamera(); if(!createRenderer())return;
  createLights(); createParticles();
  createFilmReel(5.2,1.1,-8.5,1.05,-0.18);
  createFilmReel(-5.6,-0.5,-12,0.72,0.28);
  createFilmStrip(); createPostProcessing(); resize();
  addEventListener('pointermove',pointerMove,{passive:true}); addEventListener('resize',resize,{passive:true});
  if('ResizeObserver' in window){const ro=new ResizeObserver(resize);ro.observe(hero);state.ro=ro;}
  if('IntersectionObserver' in window){const io=new IntersectionObserver(es=>{state.visible=!!es[0]?.isIntersecting;if(state.visible&&!state.raf)animate();if(!state.visible&&state.raf){cancelAnimationFrame(state.raf);state.raf=0;}},{threshold:0.02});io.observe(hero);state.io=io;}
  animate();
}

try{init();}catch(error){console.error('Varadaraja cinematic background failed:',error);}
