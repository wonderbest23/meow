import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { PHONE_STORY_DURATION_SECONDS, phoneMotion } from "../lib/home-phone-motion";

function roundedShape(width: number, height: number, radius: number) {
  const x = -width / 2, y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

export function createPhoneStage(root: HTMLElement, onChapter: (index: number) => void, previewProgress?: number) {
  const mount = root.querySelector<HTMLElement>("[data-phone-mount]")!;
  const pin = root.querySelector<HTMLElement>("[data-pin]")!;
  const screen = root.querySelector<HTMLElement>("[data-phone-screen]")!.cloneNode(true) as HTMLElement;
  const condition = screen.querySelector<HTMLElement>("[data-phone-focus-target]")!;
  const focus = condition.cloneNode(true) as HTMLElement;
  delete focus.dataset.phoneFocusTarget;
  focus.dataset.phoneFocus = "";
  const flight = root.querySelector<HTMLElement>("[data-phone-message]")!.cloneNode(true) as HTMLElement;
  const bubble = screen.querySelector<HTMLElement>('[data-coach-message="user"]')!;
  const scrubber = root.querySelector<HTMLInputElement>("[data-phone-progress]")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
  catch {
    root.dataset.renderer = "fallback";
    for (const [key, value] of Object.entries(phoneMotion(.555))) root.style.setProperty(`--${key}`, String(value));
    scrubber.value = "55.5";
    onChapter(1);
    return { ready: false, pause: () => true, seek: () => {}, dispose: () => {} };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.dataset.phoneCanvas = "true";
  renderer.domElement.setAttribute("aria-hidden", "true");
  const css = new CSS3DRenderer();
  css.domElement.style.pointerEvents = "none";
  mount.append(renderer.domElement, css.domElement);
  screen.style.pointerEvents = "none";
  focus.style.pointerEvents = "none";
  flight.style.pointerEvents = "none";

  const scene = new THREE.Scene();
  const domScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 1.2;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7e8a97, 1.5));
  const key = new THREE.DirectionalLight(0xfff8ef, 4);
  key.position.set(-4, 8, 7);
  scene.add(key);
  const edge = new THREE.DirectionalLight(0xc4ddff, 2.2);
  edge.position.set(7, 2, -1);
  scene.add(edge);
  const phone = new THREE.Group();
  const domPhone = new THREE.Group();
  scene.add(phone);
  domScene.add(domPhone);
  const metal = new THREE.MeshStandardMaterial({ color: 0xc8cbd0, metalness: 1, roughness: .24 });
  const dark = new THREE.MeshPhysicalMaterial({ color: 0x080d14, metalness: .25, roughness: .19, clearcoat: 1 });
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedShape(3.36, 7.16, .45), { depth: .27, bevelEnabled: true, bevelSize: .045, bevelThickness: .045, bevelSegments: 5, curveSegments: 16, steps: 1 }), metal);
  body.position.z = -.16;
  body.castShadow = true;
  phone.add(body);
  const rim = new THREE.Mesh(new THREE.ShapeGeometry(roundedShape(3.34, 7.14, .445), 32), dark);
  rim.position.z = .158;
  phone.add(rim);
  const seam = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedShape(3.38, 7.18, .46), { depth: .014, bevelEnabled: false, curveSegments: 24 }), new THREE.MeshStandardMaterial({ color: 0x555e68, metalness: .9, roughness: .3 }));
  seam.position.z = -.07;
  phone.add(seam);
  for (const [x, y, height] of [[-1.733, 1.85, .3], [-1.733, .93, .62], [-1.733, .05, .62], [1.733, 1.03, .95]]) {
    const button = new THREE.Mesh(new THREE.BoxGeometry(.035, height, .12), metal);
    button.position.set(x, y, -.015);
    phone.add(button);
  }
  const stripMaterial = new THREE.MeshStandardMaterial({ color: 0xb0b4b9, roughness: .65 });
  for (const x of [-1.717, 1.717]) for (const y of [-2.66, 2.66]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(.025, .032, .29), stripMaterial);
    strip.position.set(x, y, -.02);
    phone.add(strip);
  }
  const screenObject = new CSS3DObject(screen);
  screenObject.scale.setScalar(.00886);
  screenObject.position.z = .175;
  domPhone.add(screenObject);
  const focusObject = new CSS3DObject(focus);
  focusObject.scale.setScalar(.00886);
  domPhone.add(focusObject);
  const flightObject = new CSS3DObject(flight);
  domPhone.add(flightObject);
  const bubbleAnchor = new THREE.Vector3(0, 1.3, .18);
  const conditionAnchor = new THREE.Vector3(0, -.5, .18);
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 128; shadowCanvas.height = 64;
  const context = shadowCanvas.getContext("2d")!;
  context.scale(1, .5);
  const falloff = context.createRadialGradient(64, 64, 2, 64, 64, 64);
  falloff.addColorStop(0, "rgba(24,33,43,.24)");
  falloff.addColorStop(.35, "rgba(24,33,43,.12)");
  falloff.addColorStop(1, "rgba(24,33,43,0)");
  context.fillStyle = falloff; context.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(5.9, 1.1), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  scene.add(floor);
  root.dataset.renderer = "webgl";

  const preview = process.env.NODE_ENV === "development" && Number.isFinite(previewProgress) ? phoneMotion(previewProgress!).progress : undefined;
  let disposed = false, visible = false, paused = preview !== undefined || reduced.matches, auto = preview === undefined;
  let raf = 0, previous = 0, seconds = 0, progress = preview ?? (reduced.matches ? .555 : 0);
  let scrollProgress = 0, chapter = -1, width = 0, height = 0;
  let pointerX = 0, pointerY = 0, shownX = 0, shownY = 0;
  let mobile = false, viewHeight = 10, centerY = 0, centerX = 0, checkRaster = true;

  const paint = () => {
    const motion = phoneMotion(progress);
    if (reduced.matches) {
      motion.messageDetach = motion.messageLift = 0;
      motion.focusDetach = motion.focus = 0;
    }
    for (const [key, value] of Object.entries(motion)) root.style.setProperty(`--${key}`, value.toFixed(5));
    root.dataset.progress = progress.toFixed(5);
    scrubber.value = (progress * 100).toFixed(1);
    scrubber.setAttribute("aria-valuetext", `${Math.round(progress * 100)}%`);
    const next = progress < .45 ? 0 : progress < .875 ? 1 : 2;
    if (next !== chapter) { chapter = next; onChapter(next); }
    const tilt = reduced.matches ? 0 : 1;
    phone.rotation.set((-.035 + shownY * .025) * tilt, (-.28 + motion.brief * .06 + shownX * .035) * tilt, (-.15 + motion.document * .035) * tilt);
    phone.position.set(centerX, centerY, 0);
    phone.scale.setScalar(1 + motion.document * .02);
    domPhone.position.copy(phone.position);
    domPhone.rotation.copy(phone.rotation);
    domPhone.scale.copy(phone.scale);
    // Both lifted layers remain children of the device, preserving its exact perspective.
    flightObject.position.copy(bubbleAnchor);
    flightObject.position.x -= motion.messageLift * (mobile ? .45 : .7);
    flightObject.position.z += motion.messageLift * .9;
    flightObject.scale.setScalar(.00886 * (1 + motion.messageLift * (mobile ? .85 : .7)));
    const flightOpacity = reduced.matches ? 0 : motion.messageDetach;
    flight.style.opacity = String(flightOpacity);
    flight.style.visibility = flightOpacity > .001 ? "visible" : "hidden";
    focusObject.position.copy(conditionAnchor);
    focusObject.position.x -= motion.focus * (mobile ? .1 : .38);
    focusObject.position.y += motion.insideScroll * 90 * .00886;
    focusObject.position.z += motion.focus * .9;
    const focusOpacity = reduced.matches ? 0 : motion.focusDetach;
    focus.style.opacity = String(focusOpacity);
    focus.style.visibility = focusOpacity > .001 ? "visible" : "hidden";
    const focusScaleBoost = mobile ? THREE.MathUtils.clamp((width - 272) / 160, .3, .5) : .25;
    focusObject.scale.setScalar(.00886 * (1 + motion.focus * focusScaleBoost));
    floor.position.set(phone.position.x + .2, phone.position.y - 3.95 * phone.scale.x, -.3);
    scene.updateMatrixWorld();
    domScene.updateMatrixWorld();
    renderer.render(scene, camera);
    css.render(domScene, camera);
    if (process.env.NODE_ENV !== "production" && checkRaster) {
      const gl = renderer.getContext();
      const samples: number[][] = [];
      for (const local of [[0, 0, .16], [1.65, 0, .16], [0, 3.5, .16]]) {
        const point = phone.localToWorld(new THREE.Vector3(...local)).project(camera);
        const x = Math.max(0, Math.min(gl.drawingBufferWidth - 1, Math.round((point.x + 1) * .5 * gl.drawingBufferWidth)));
        const y = Math.max(0, Math.min(gl.drawingBufferHeight - 1, Math.round((point.y + 1) * .5 * gl.drawingBufferHeight)));
        const pixel = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        samples.push(Array.from(pixel));
      }
      renderer.domElement.dataset.rasterSamples = JSON.stringify(samples);
      checkRaster = false;
    }
    root.dataset.rendered = "true";
  };
  const tick = (now: number) => {
    raf = 0;
    if (disposed || document.hidden || !visible) return;
    const dt = Math.min(.05, previous ? (now - previous) / 1000 : .016);
    previous = now;
    if (!paused && !reduced.matches && auto) seconds += dt;
    const target = reduced.matches ? progress : auto ? Math.min(1, seconds / PHONE_STORY_DURATION_SECONDS) : scrollProgress;
    if (!paused) progress += (target - progress) * (1 - Math.exp(-dt / .09));
    if (Math.abs(target - progress) < .00003 && !paused) progress = target;
    shownX += (pointerX - shownX) * .09;
    shownY += (pointerY - shownY) * .09;
    paint();
    if (auto && progress >= 1 && !paused) paused = true;
    if ((!paused && (progress !== target || (auto && target < 1))) || Math.abs(shownX - pointerX) + Math.abs(shownY - pointerY) > .001) raf = requestAnimationFrame(tick);
  };
  const wake = () => { if (!disposed && !raf && visible && !document.hidden) { previous = 0; raf = requestAnimationFrame(tick); } };
  const measureScroll = () => {
    scrollProgress = Math.max(0, Math.min(1, (64 - root.getBoundingClientRect().top) / Math.max(1, root.offsetHeight - pin.offsetHeight)));
  };
  const measureMessage = () => {
    for (const [target, lifted, anchor] of [[bubble, flight, bubbleAnchor], [condition, focus, conditionAnchor]] as const) {
      let x = target.offsetWidth / 2;
      let y = target.offsetHeight / 2;
      let element: HTMLElement | null = target;
      while (element && element !== screen) {
        x += element.offsetLeft;
        y += element.offsetTop;
        element = element.offsetParent as HTMLElement | null;
      }
      anchor.set((x - 180) * .00886, (380 - y) * .00886, .176);
      lifted.style.width = `${target.offsetWidth}px`;
    }
  };
  const resize = () => {
    const rect = mount.getBoundingClientRect();
    width = rect.width; height = rect.height; mobile = width <= 700;
    root.dataset.motion = !reduced.matches && innerHeight >= 680 ? "on" : "off";
    const copy = root.querySelector<HTMLElement>("[data-story-copy]");
    const contentTop = mobile && copy ? copy.offsetTop + copy.offsetHeight + 16 : 181;
    const deviceHeight = Math.min(mobile ? height - contentTop - 54 : height * .84, mobile ? width * 1.63 : 660);
    viewHeight = 7.65 * height / Math.max(290, deviceHeight);
    camera.aspect = width / Math.max(1, height);
    camera.position.z = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.updateProjectionMatrix();
    const centerPixelY = mobile ? contentTop + deviceHeight / 2 : height * .47;
    centerY = (.5 - centerPixelY / height) * viewHeight;
    centerX = mobile ? 0 : .205 * viewHeight * camera.aspect;
    renderer.setSize(width, height);
    css.setSize(width, height);
    checkRaster = true;
    measureScroll();
    paint();
    measureMessage();
    paint();
    wake();
  };
  const scroll = () => {
    if (preview !== undefined || document.activeElement === scrubber) return;
    const before = scrollProgress;
    measureScroll();
    if (Math.abs(scrollProgress - before) > .0002) {
      auto = false;
      if (scrollProgress < .01 && before > .025) seconds = 0;
      if (paused) { progress = scrollProgress; paint(); }
      wake();
    }
  };
  const pointer = (event: PointerEvent) => {
    if (mobile || reduced.matches || event.pointerType !== "mouse") return;
    const rect = pin.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / width - .5;
    pointerY = (event.clientY - rect.top) / height - .5;
    wake();
  };
  const leave = () => { pointerX = pointerY = 0; wake(); };
  const visibility = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else wake(); };
  const preference = () => { paused = reduced.matches; if (paused) progress = .555; resize(); };
  const lost = (event: Event) => { event.preventDefault(); root.dataset.renderer = "fallback"; mount.style.visibility = "hidden"; cancelAnimationFrame(raf); raf = 0; };
  const restored = () => { root.dataset.renderer = "webgl"; mount.style.visibility = ""; resize(); wake(); };
  const intersection = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    if (visible) wake(); else { cancelAnimationFrame(raf); raf = 0; }
  }, { threshold: .25 });
  intersection.observe(pin);
  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  observer.observe(bubble);
  observer.observe(condition);
  const copy = root.querySelector<HTMLElement>("[data-story-copy]");
  if (copy) observer.observe(copy);
  window.addEventListener("scroll", scroll, { passive: true });
  pin.addEventListener("pointermove", pointer, { passive: true });
  pin.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", visibility);
  reduced.addEventListener("change", preference);
  renderer.domElement.addEventListener("webglcontextlost", lost);
  renderer.domElement.addEventListener("webglcontextrestored", restored);
  resize();

  return {
    ready: preview === undefined,
    pause(value: boolean) {
      if (reduced.matches && !value) return true;
      if (!value) { auto = true; seconds = progress * PHONE_STORY_DURATION_SECONDS; }
      paused = value;
      wake();
      return paused;
    },
    seek(value: number) {
      progress = phoneMotion(value).progress;
      seconds = progress * PHONE_STORY_DURATION_SECONDS;
      paused = true;
      auto = true;
      paint();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      intersection.disconnect(); observer.disconnect();
      window.removeEventListener("scroll", scroll);
      pin.removeEventListener("pointermove", pointer); pin.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", preference);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.domElement.removeEventListener("webglcontextrestored", restored);
      const materials = new Set<THREE.Material>();
      scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const list = Array.isArray(object.material) ? object.material : [object.material]; list.forEach(item => materials.add(item)); } });
      materials.forEach(material => material.dispose());
      shadowTexture.dispose(); environment.dispose(); renderer.dispose();
      screen.remove(); focus.remove(); flight.remove(); renderer.domElement.remove(); css.domElement.remove();
      delete root.dataset.renderer; delete root.dataset.rendered;
    },
  };
}
