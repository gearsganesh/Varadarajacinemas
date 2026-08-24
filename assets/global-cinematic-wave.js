import * as THREE from "three";

export function createGlobalCinematicWave() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030305, 0.055);

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 120
  );
  camera.position.set(0, 2.2, 15);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  renderer.domElement.id = "cinematic-wave-canvas";
  Object.assign(renderer.domElement.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "0",
    pointerEvents: "none"
  });
  document.body.prepend(renderer.domElement);

  // Wave density is intentionally reduced on mobile.
  const mobile = matchMedia("(max-width: 700px)").matches ||
                 matchMedia("(pointer: coarse)").matches;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const cols = mobile ? 42 : 72;
  const rows = mobile ? 30 : 46;
  const count = cols * rows;

  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const depth = new Float32Array(count);

  let p = 0;
  for (let z = 0; z < rows; z++) {
    const zz = (z / (rows - 1) - 0.5) * 20;
    for (let x = 0; x < cols; x++) {
      const xx = (x / (cols - 1) - 0.5) * 22;
      const i = z * cols + x;
      const j = i * 3;
      const yy = 0.35 * Math.sin(xx * 0.55) + 0.18 * Math.cos(zz * 0.75);
      positions[j] = base[j] = xx;
      positions[j + 1] = base[j + 1] = yy;
      positions[j + 2] = base[j + 2] = zz;
      phase[i] = Math.random() * Math.PI * 2;
      depth[i] = z / (rows - 1);
      p++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xd7a968,
    size: mobile ? 0.085 : 0.075,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });

  const wave = new THREE.Points(geometry, material);
  wave.rotation.x = -0.12;
  scene.add(wave);

  // Secondary star/dust field.
  const dustCount = mobile ? 260 : 700;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 28;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 14;
    dustPos[i * 3 + 2] = -8 + Math.random() * 25;
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dm = new THREE.PointsMaterial({
    color: 0x9c7a4b,
    size: mobile ? 0.035 : 0.045,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const dust = new THREE.Points(dg, dm);
  scene.add(dust);

  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(ambient);

  const warm = new THREE.PointLight(0xffb45d, 11, 35, 2);
  warm.position.set(-7, 5, 8);
  scene.add(warm);

  const gold = new THREE.PointLight(0xd99a50, 5, 30, 2);
  gold.position.set(7, -2, 3);
  scene.add(gold);

  // A very subtle theatre/projector glow.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 10),
    new THREE.MeshBasicMaterial({
      color: 0x5c3a18,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  glow.position.set(0, 1.0, -4.5);
  scene.add(glow);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollY = window.scrollY;
  let scrollVelocity = 0;
  let lastScroll = scrollY;
  let lastTime = performance.now();

  function onPointerMove(e) {
    if (mobile) return;
    pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = -(e.clientY / window.innerHeight - 0.5) * 2;
  }

  function onScroll() {
    const now = window.scrollY;
    scrollVelocity = Math.max(-40, Math.min(40, now - lastScroll));
    scrollY = now;
    lastScroll = now;
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });

  let raf = 0;
  let running = true;

  function animate(now) {
    if (!running) return;
    raf = requestAnimationFrame(animate);

    const dt = Math.min(0.04, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    const motion = reducedMotion ? 0.12 : 1;
    const t = now * 0.00045 * motion;
    const velocityInfluence = reducedMotion ? 0 : scrollVelocity * 0.003;

    pointer.x += (pointer.tx - pointer.x) * 0.035;
    pointer.y += (pointer.ty - pointer.y) * 0.035;

    const pos = geometry.attributes.position.array;

    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const i = z * cols + x;
        const j = i * 3;
        const xx = base[j];
        const zz = base[j + 2];

        const travelling = xx * 0.55 + t * 3.0 + zz * 0.13;
        const travelling2 = xx * 0.22 - t * 1.7 - zz * 0.19;

        let y =
          base[j + 1] +
          Math.sin(travelling) * 0.52 +
          Math.cos(travelling2) * 0.28 +
          Math.sin((xx + zz) * 0.17 + t * 2) * 0.14;

        // Pointer creates a gentle local disturbance.
        const dx = xx * 0.11 - pointer.x * 1.5;
        const dz = zz * 0.08 - pointer.y * 0.7;
        const d = Math.sqrt(dx * dx + dz * dz);
        y += Math.exp(-d * d * 1.2) * pointer.y * 0.45;

        // Scrolling changes the travelling speed/energy, then settles.
        y += Math.sin(zz * 0.35 + t * 8 + velocityInfluence * 5) *
             Math.min(0.25, Math.abs(velocityInfluence)) * motion;

        pos[j + 1] = y;
        pos[j] = xx + pointer.x * (0.08 + depth[i] * 0.06);
      }
    }

    geometry.attributes.position.needsUpdate = true;

    // Whole field parallax/depth.
    wave.position.x += ((pointer.x * 0.34) - wave.position.x) * 0.018;
    wave.position.y += ((pointer.y * 0.16) - wave.position.y) * 0.018;
    wave.rotation.z += ((pointer.x * 0.008) - wave.rotation.z) * 0.015;

    camera.position.x += ((pointer.x * 0.55) - camera.position.x) * 0.018;
    camera.position.y += ((2.2 + pointer.y * 0.28) - camera.position.y) * 0.018;

    // Scroll gives the background a slow cinematic travel.
    const targetZ = 15 - Math.min(2.0, scrollY * 0.0007);
    camera.position.z += (targetZ - camera.position.z) * 0.02;

    dust.rotation.y += 0.00012 * motion;
    dust.rotation.x = Math.sin(t * 0.6) * 0.025;
    glow.material.opacity = 0.04 + Math.sin(t * 3.0) * 0.006 * motion;

    scrollVelocity *= Math.pow(0.04, dt);
    renderer.render(scene, camera);
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.15 : 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener("resize", resize, { passive: true });
  resize();
  raf = requestAnimationFrame(animate);

  return {
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
      geometry.dispose();
      material.dispose();
      dg.dispose();
      dm.dispose();
      glow.geometry.dispose();
      glow.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
