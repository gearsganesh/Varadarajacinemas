import * as THREE from 'three';
import { EffectComposer } from 'https://raw.githubusercontent.com/gearsganesh/Tools-Resources/main/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://raw.githubusercontent.com/gearsganesh/Tools-Resources/main/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://raw.githubusercontent.com/gearsganesh/Tools-Resources/main/examples/jsm/postprocessing/UnrealBloomPass.js';

const HERO_SELECTOR = '.hero';

const state = {
  scene: null,
  camera: null,
  renderer: null,
  composer: null,
  bloomPass: null,
  clock: new THREE.Clock(),
  root: null,
  particles: null,
  particleData: [],
  reels: [],
  filmStrip: null,
  pointer: new THREE.Vector2(),
  pointerTarget: new THREE.Vector2(),
  raf: 0,
  resizeObserver: null,
  intersectionObserver: null,
  reducedMotion: false,
  mobile: false,
};

function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070707);
  scene.fog = new THREE.Fog(0x070707, 12, 42);
  state.scene = scene;
  state.root = new THREE.Group();
  scene.add(state.root);
  return scene;
}

function createCamera() {
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 70);
  camera.position.set(0, 0.6, 14);
  state.camera = camera;
  return camera;
}

function createRenderer(hero) {
  const canvas = document.createElement('canvas');
  canvas.className = 'cinematic-background-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  hero.prepend(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !state.mobile,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, state.mobile ? 1.25 : 1.65));
  renderer.setClearColor(0x070707, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  state.renderer = renderer;
  return renderer;
}

function createParticles() {
  const count = state.mobile ? 260 : 620;
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  const data = [];

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const depth = Math.random();
    const x = (Math.random() - 0.5) * 24;
    const y = (Math.random() - 0.5) * 12;
    const z = -2 - depth * 36;
    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = z;
    data.push({
      phase: Math.random() * Math.PI * 2,
      speed: 0.06 + Math.random() * 0.13,
      drift: 0.08 + Math.random() * 0.18,
      baseX: x,
      baseY: y,
      baseZ: z,
    });
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xd6a84f,
    size: state.mobile ? 0.085 : 0.105,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const particles = new THREE.Points(geometry, material);
  particles.position.set(0, 0.3, 0);
  state.root.add(particles);
  state.particles = particles;
  state.particleData = data;
  return particles;
}

function createFilmReel({ x, y, z, scale = 1, rotation = 0 }) {
  const reel = new THREE.Group();
  reel.position.set(x, y, z);
  reel.rotation.z = rotation;
  reel.scale.setScalar(scale);

  const metal = new THREE.MeshStandardMaterial({
    color: 0x24211d,
    metalness: 0.78,
    roughness: 0.32,
  });
  const edge = new THREE.MeshStandardMaterial({
    color: 0x4a3a25,
    metalness: 0.88,
    roughness: 0.22,
  });
  const dark = new THREE.MeshBasicMaterial({
    color: 0x090909,
    transparent: true,
    opacity: 0.94,
  });

  const outer = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.16, 12, 96), edge);
  reel.add(outer);

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(2.12, 2.12, 0.08, 64), metal);
  plate.rotation.x = Math.PI / 2;
  reel.add(plate);

  const hubOuter = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.12, 10, 48), edge);
  reel.add(hubOuter);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.16, 48), metal);
  hub.rotation.x = Math.PI / 2;
  reel.add(hub);

  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 32), dark);
  axle.rotation.x = Math.PI / 2;
  reel.add(axle);

  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 1.65, 10), edge);
    spoke.rotation.z = angle;
    spoke.position.set(Math.cos(angle) * 0.84, Math.sin(angle) * 0.84, 0.06);
    reel.add(spoke);

    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 24), dark);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(Math.cos(angle) * 1.35, Math.sin(angle) * 1.35, 0.08);
    reel.add(hole);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 6, 24), edge);
    rim.position.copy(hole.position);
    rim.position.z += 0.08;
    reel.add(rim);
  }

  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.035, 8, 64), edge);
  innerRing.position.z = 0.07;
  reel.add(innerRing);

  state.root.add(reel);
  state.reels.push({ object: reel, baseX: x, baseY: y, phase: Math.random() * Math.PI * 2 });
  return reel;
}

function createFilmStrip() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x171512,
    metalness: 0.2,
    roughness: 0.72,
    transparent: true,
    opacity: 0.42,
  });
  const edgeMaterial = new THREE.MeshBasicMaterial({
    color: 0x4b3b25,
    transparent: true,
    opacity: 0.32,
  });

  const segments = state.mobile ? 8 : 13;
  for (let i = 0; i < segments; i += 1) {
    const t = i / (segments - 1);
    const x = -9.5 + t * 19;
    const y = -2.6 + Math.sin(t * Math.PI * 1.7) * 0.95;
    const z = -13 - Math.sin(t * Math.PI) * 1.8;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.3, 0.045), material);
    frame.position.set(x, y, z);
    frame.rotation.z = Math.sin(t * Math.PI * 1.7) * 0.12;
    group.add(frame);

    const topEdge = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.035, 0.06), edgeMaterial);
    topEdge.position.set(x, y + 0.64, z + 0.04);
    topEdge.rotation.z = frame.rotation.z;
    group.add(topEdge);
    const bottomEdge = topEdge.clone();
    bottomEdge.position.y = y - 0.64;
    group.add(bottomEdge);

    for (const side of [-0.86, 0.86]) {
      for (let h = -0.43; h <= 0.43; h += 0.43) {
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.065, 16), edgeMaterial);
        hole.rotation.x = Math.PI / 2;
        hole.position.set(x + side, y + h, z + 0.045);
        group.add(hole);
      }
    }
  }

  group.position.y = -0.6;
  group.rotation.y = -0.08;
  state.root.add(group);
  state.filmStrip = group;
  return group;
}

function createLights() {
  const ambient = new THREE.AmbientLight(0x7d6a4e, 0.42);
  state.scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffd58a, 1.0);
  key.position.set(-6, 6, 8);
  state.scene.add(key);

  const projector = new THREE.PointLight(0xd6a84f, 2.2, 24, 2);
  projector.position.set(4, 2.8, 2);
  state.scene.add(projector);

  const fill = new THREE.PointLight(0x5d2b25, 1.0, 18, 2);
  fill.position.set(-6, -1, -8);
  state.scene.add(fill);
}

function createPostProcessing() {
  try {
    const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
    const composer = new EffectComposer(state.renderer);
    composer.addPass(new RenderPass(state.scene, state.camera));

    if (!state.mobile && !state.reducedMotion) {
      const bloom = new UnrealBloomPass(resolution, 0.42, 0.32, 0.86);
      composer.addPass(bloom);
      state.bloomPass = bloom;
    }

    state.composer = composer;
  } catch (error) {
    console.warn('Cinematic post-processing unavailable:', error);
    state.composer = null;
    state.bloomPass = null;
  }
}

function handleResize() {
  const hero = document.querySelector(HERO_SELECTOR);
  if (!hero || !state.renderer || !state.camera) return;
  const width = Math.max(1, hero.clientWidth);
  const height = Math.max(1, hero.clientHeight);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, state.mobile ? 1.25 : 1.65));
  state.renderer.setSize(width, height, false);
  if (state.composer) state.composer.setSize(width, height);
  if (state.bloomPass) state.bloomPass.resolution.set(width, height);
}

function handlePointerMove(event) {
  const hero = document.querySelector(HERO_SELECTOR);
  if (!hero) return;
  const rect = hero.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  state.pointerTarget.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
  state.pointerTarget.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
}

function updateScene(elapsed) {
  state.pointer.lerp(state.pointerTarget, 0.035);
  const p = state.pointer;

  state.camera.position.x += (p.x * 0.72 - state.camera.position.x) * 0.018;
  state.camera.position.y += (0.6 - p.y * 0.34 - state.camera.position.y) * 0.018;
  state.camera.lookAt(p.x * 0.35, -p.y * 0.18, -10);

  const attr = state.particles?.geometry.getAttribute('position');
  if (attr) {
    for (let i = 0; i < state.particleData.length; i += 1) {
      const d = state.particleData[i];
      const i3 = i * 3;
      attr.array[i3] = d.baseX + Math.sin(elapsed * d.speed + d.phase) * d.drift + p.x * (0.08 + (-d.baseZ / 50) * 0.14);
      attr.array[i3 + 1] = d.baseY + Math.cos(elapsed * d.speed * 0.8 + d.phase) * d.drift * 0.6 - p.y * 0.12;
      attr.array[i3 + 2] = d.baseZ + Math.sin(elapsed * 0.08 + d.phase) * 0.18;
    }
    attr.needsUpdate = true;
  }

  state.reels.forEach((item, index) => {
    item.object.rotation.z += 0.0009 + index * 0.00025;
    item.object.rotation.y = Math.sin(elapsed * 0.055 + item.phase) * 0.055 + p.x * (index === 0 ? 0.16 : 0.09);
    item.object.position.x = item.baseX + p.x * (index === 0 ? 0.34 : -0.22);
    item.object.position.y = item.baseY - p.y * (index === 0 ? 0.16 : 0.10);
  });

  if (state.filmStrip) {
    state.filmStrip.position.x = Math.sin(elapsed * 0.045) * 0.28 + p.x * 0.12;
    state.filmStrip.position.z = -0.5 + Math.cos(elapsed * 0.035) * 0.18;
  }
}

function animate() {
  state.raf = requestAnimationFrame(animate);
  if (!state.renderer || !state.scene || !state.camera) return;
  const elapsed = state.clock.getElapsedTime();
  updateScene(elapsed);
  if (state.composer) state.composer.render();
  else state.renderer.render(state.scene, state.camera);
}

function pause() {
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = 0;
}

function resume() {
  if (!state.raf && !state.reducedMotion) animate();
}

function dispose() {
  pause();
  if (state.intersectionObserver) state.intersectionObserver.disconnect();
  if (state.resizeObserver) state.resizeObserver.disconnect();
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('resize', handleResize);

  state.scene?.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    }
  });
  state.composer?.dispose?.();
  const canvas = state.renderer?.domElement;
  state.renderer?.dispose();
  if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);

  state.scene = null;
  state.camera = null;
  state.renderer = null;
  state.composer = null;
  state.bloomPass = null;
  state.particles = null;
  state.particleData = [];
  state.reels = [];
  state.filmStrip = null;
}

function init() {
  const hero = document.querySelector(HERO_SELECTOR);
  if (!hero || state.renderer) return;

  state.mobile = window.matchMedia('(max-width: 760px)').matches;
  state.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  try {
    createScene();
    createCamera();
    createRenderer(hero);
    createLights();
    createParticles();
    createFilmReel({ x: 6.0, y: 1.5, z: -17, scale: 1.15, rotation: -0.22 });
    createFilmReel({ x: -6.7, y: -0.7, z: -24, scale: 0.82, rotation: 0.4 });
    createFilmStrip();
    createPostProcessing();
    handleResize();

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });

    if ('ResizeObserver' in window) {
      state.resizeObserver = new ResizeObserver(handleResize);
      state.resizeObserver.observe(hero);
    }

    if ('IntersectionObserver' in window) {
      state.intersectionObserver = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) resume();
        else pause();
      }, { threshold: 0.02 });
      state.intersectionObserver.observe(hero);
    }

    if (!state.reducedMotion) animate();
    else {
      updateScene(0);
      if (state.composer) state.composer.render();
      else state.renderer.render(state.scene, state.camera);
    }
  } catch (error) {
    console.error('Varadaraja cinematic background failed:', error);
    dispose();
  }
}

window.VaradarajaCinematicBackground = { init, dispose };
init();
