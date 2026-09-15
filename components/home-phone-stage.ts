import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { phoneMotion, phoneScrollProgress, phoneStoryCopy, phoneStoryPins, phoneStoryScrollDistance, phoneStoryScrollPosition } from "../lib/home-phone-motion";
import { PHONE_DEVICE, phoneDeviceFrame } from "../lib/home-phone-device";

function roundedShape(width: number, height: number, radius: number) {
  const x = -width / 2, y = -height / 2;
  const arc = radius * .5522847498;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.bezierCurveTo(x + width - radius + arc, y, x + width, y + radius - arc, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.bezierCurveTo(x + width, y + height - radius + arc, x + width - radius + arc, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.bezierCurveTo(x + radius - arc, y + height, x, y + height - radius + arc, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.bezierCurveTo(x, y + radius - arc, x + radius - arc, y, x + radius, y);
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
  const copy = root.querySelector<HTMLElement>("[data-story-copy]")!;
  const copyScenes = Array.from(copy.querySelectorAll<HTMLElement>("[data-story-scene]")).map(element => ({
    element,
    parts: Array.from(element.querySelectorAll<HTMLElement>("[data-copy-part]")),
  }));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
  catch {
    root.dataset.renderer = "fallback";
    for (const [key, value] of Object.entries(phoneMotion(.555))) root.style.setProperty(`--${key}`, String(value));
    scrubber.value = "55.5";
    onChapter(1);
    return { ready: false, seek: () => {}, dispose: () => {} };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
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
  const metal = new THREE.MeshStandardMaterial({ color: 0xd2dce3, metalness: .92, roughness: .31 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x0b0d10 });
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedShape(PHONE_DEVICE.width - .024, PHONE_DEVICE.height - .024, .49), { depth: PHONE_DEVICE.depth - .024, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 5, curveSegments: 24, steps: 1 }), metal);
  body.position.z = -PHONE_DEVICE.depth / 2 + .012;
  body.castShadow = true;
  phone.add(body);
  const rim = new THREE.Mesh(new THREE.ShapeGeometry(roundedShape(PHONE_DEVICE.width - .045, PHONE_DEVICE.height - .045, .47), 32), dark);
  rim.position.z = .188;
  phone.add(rim);
  for (const [side, y, height] of [[-1, 1.98, .28], [-1, 1.28, .54], [-1, .53, .54], [1, 1.08, .82], [1, -1.35, .59]]) {
    const button = new THREE.Mesh(new THREE.BoxGeometry(.026, height, .105), metal);
    button.position.set(side * (PHONE_DEVICE.width / 2 + .008), y, -.008);
    phone.add(button);
  }
  const stripMaterial = new THREE.MeshStandardMaterial({ color: 0xa5b2be, roughness: .7 });
  for (const side of [-1, 1]) for (const y of [-2.63, 2.63]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(.012, .025, PHONE_DEVICE.depth - .05), stripMaterial);
    strip.position.set(side * (PHONE_DEVICE.width / 2), y, 0);
    phone.add(strip);
  }
  const screenObject = new CSS3DObject(screen);
  screenObject.scale.setScalar(PHONE_DEVICE.screenScale);
  screenObject.position.z = PHONE_DEVICE.screenZ;
  domPhone.add(screenObject);
  const focusObject = new CSS3DObject(focus);
  focusObject.scale.setScalar(PHONE_DEVICE.screenScale);
  domPhone.add(focusObject);
  const flightObject = new CSS3DObject(flight);
  domPhone.add(flightObject);
  const bubbleAnchor = new THREE.Vector3(0, 1.3, PHONE_DEVICE.screenZ + .001);
  const conditionAnchor = new THREE.Vector3(0, -.5, PHONE_DEVICE.screenZ + .001);
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 128; shadowCanvas.height = 64;
  const context = shadowCanvas.getContext("2d")!;
  context.scale(1, .5);
  const falloff = context.createRadialGradient(64, 64, 2, 64, 64, 64);
  falloff.addColorStop(0, "rgba(24,33,43,.15)");
  falloff.addColorStop(.35, "rgba(24,33,43,.07)");
  falloff.addColorStop(1, "rgba(24,33,43,0)");
  context.fillStyle = falloff; context.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.6, .72), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  scene.add(floor);
  root.dataset.renderer = "webgl";

  const preview = process.env.NODE_ENV === "development" && Number.isFinite(previewProgress) ? phoneMotion(previewProgress!).progress : undefined;
  let disposed = false, visible = false, manual = false;
  let raf = 0, progress = preview ?? (reduced.matches ? .555 : 0), targetProgress = progress;
  let scrollProgress = 0, chapter = -1, width = 0, height = 0;
  let copyEntry = 1, copyExit = 0;
  let scrollEnabled = false;
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
    const copyMotion = phoneStoryCopy(progress, manual || preview !== undefined ? 1 : copyEntry, manual || preview !== undefined ? 0 : copyExit, reduced.matches);
    copyScenes.forEach(({ element, parts }, index) => {
      const state = copyMotion.scenes[index];
      element.style.setProperty("--copy-visibility", state.visible ? "visible" : "hidden");
      parts.forEach((part, partIndex) => {
        part.style.setProperty("--copy-opacity", state.parts[partIndex].opacity.toFixed(5));
        part.style.setProperty("--copy-y", `${state.parts[partIndex].y.toFixed(3)}px`);
      });
    });
    if (copyMotion.chapter !== chapter) { chapter = copyMotion.chapter; onChapter(chapter); }
    const tilt = reduced.matches ? 0 : 1;
    phone.rotation.set((-.012 + shownY * .012) * tilt, ((mobile ? -.055 : -.1) + motion.brief * .025 + shownX * .018) * tilt, ((mobile ? -.025 : -.045) + motion.document * .012) * tilt);
    phone.position.set(centerX, centerY, 0);
    phone.scale.setScalar(1 + motion.document * .02);
    domPhone.position.copy(phone.position);
    domPhone.rotation.copy(phone.rotation);
    domPhone.scale.copy(phone.scale);
    // Both lifted layers remain children of the device, preserving its exact perspective.
    flightObject.position.copy(bubbleAnchor);
    flightObject.position.x -= motion.messageLift * (width < 900 ? .08 : .3);
    flightObject.position.z += motion.messageLift * .65;
    flightObject.scale.setScalar(PHONE_DEVICE.screenScale * (1 + motion.messageLift * (mobile ? .55 : width < 900 ? .25 : .45)));
    const flightOpacity = reduced.matches ? 0 : motion.messageDetach;
    flight.style.opacity = String(flightOpacity);
    flight.style.visibility = flightOpacity > .001 ? "visible" : "hidden";
    focusObject.position.copy(conditionAnchor);
    focusObject.position.x -= motion.focus * (width < 900 ? .05 : .2);
    focusObject.position.y += motion.insideScroll * 90 * PHONE_DEVICE.screenScale;
    focusObject.position.z += motion.focus * .65;
    const focusOpacity = reduced.matches ? 0 : motion.focusDetach;
    focus.style.opacity = String(focusOpacity);
    focus.style.visibility = focusOpacity > .001 ? "visible" : "hidden";
    const focusScaleBoost = mobile ? .35 : width < 900 ? .16 : .22;
    focusObject.scale.setScalar(PHONE_DEVICE.screenScale * (1 + motion.focus * focusScaleBoost));
    floor.position.set(phone.position.x, phone.position.y - (PHONE_DEVICE.height / 2 + .16) * phone.scale.x, -.3);
    scene.updateMatrixWorld();
    domScene.updateMatrixWorld();
    renderer.render(scene, camera);
    css.render(domScene, camera);
    if (process.env.NODE_ENV !== "production" && checkRaster) {
      const gl = renderer.getContext();
      const samples: number[][] = [];
      for (const local of [[0, 0, .188], [1.66, 0, .188], [0, PHONE_DEVICE.height / 2 - .02, .188]]) {
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
  const tick = () => {
    raf = 0;
    if (disposed || document.hidden || !visible) return;
    if (preview === undefined && !reduced.matches) progress = targetProgress;
    shownX += (pointerX - shownX) * .09;
    shownY += (pointerY - shownY) * .09;
    paint();
    if (Math.abs(shownX - pointerX) + Math.abs(shownY - pointerY) > .001) raf = requestAnimationFrame(tick);
  };
  const wake = () => { if (!disposed && !raf && visible && !document.hidden) raf = requestAnimationFrame(tick); };
  const measureScroll = () => {
    scrollProgress = phoneStoryScrollPosition({ top: root.getBoundingClientRect().top, trackHeight: root.offsetHeight, stageHeight: pin.offsetHeight, viewportHeight: innerHeight, pinned: scrollEnabled });
    const top = pin.getBoundingClientRect().top;
    copyEntry = scrollEnabled ? THREE.MathUtils.clamp((innerHeight * .92 - top - copy.offsetTop) / Math.max(120, innerHeight * .3), 0, 1) : 1;
    copyExit = scrollEnabled ? THREE.MathUtils.clamp((64 - top) / 160, 0, 1) : 0;
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
      anchor.set((x - PHONE_DEVICE.screenWidth / 2) * PHONE_DEVICE.screenScale, (PHONE_DEVICE.screenHeight / 2 - y) * PHONE_DEVICE.screenScale, PHONE_DEVICE.screenZ + .001);
      lifted.style.width = `${target.offsetWidth}px`;
    }
  };
  const resize = () => {
    const rect = mount.getBoundingClientRect();
    width = rect.width; height = rect.height; mobile = width < 600;
    const pinned = phoneStoryPins(innerWidth, innerHeight, reduced.matches);
    root.style.setProperty("--phone-scroll-distance", `${phoneStoryScrollDistance(innerWidth, innerHeight)}px`);
    root.dataset.motion = pinned ? "on" : "off";
    scrollEnabled = pinned;
    const frame = phoneDeviceFrame(width, height, copy.offsetTop + copy.offsetHeight);
    viewHeight = frame.viewHeight;
    camera.aspect = width / Math.max(1, height);
    camera.position.z = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.updateProjectionMatrix();
    centerY = (.5 - frame.centerY / height) * viewHeight;
    centerX = (frame.centerX / width - .5) * viewHeight * camera.aspect;
    renderer.setSize(width, height);
    css.setSize(width, height);
    checkRaster = true;
    measureScroll();
    if (preview === undefined && !reduced.matches && !manual) progress = targetProgress = phoneScrollProgress(scrollProgress);
    paint();
    measureMessage();
    paint();
    wake();
  };
  const scroll = () => {
    if (preview !== undefined || reduced.matches) return;
    const before = scrollProgress;
    const entryBefore = copyEntry, exitBefore = copyExit;
    measureScroll();
    if (manual && document.activeElement === scrubber) return;
    if (scrollProgress !== before || copyEntry !== entryBefore || copyExit !== exitBefore) {
      manual = false;
      targetProgress = phoneScrollProgress(scrollProgress);
      wake();
    }
  };
  const resumeScroll = () => { manual = false; };
  const pointer = (event: PointerEvent) => {
    if (mobile || reduced.matches || event.pointerType !== "mouse") return;
    const rect = pin.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / width - .5;
    pointerY = (event.clientY - rect.top) / height - .5;
    wake();
  };
  const leave = () => { pointerX = pointerY = 0; wake(); };
  const visibility = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else wake(); };
  const preference = () => { manual = false; if (reduced.matches && preview === undefined) progress = targetProgress = .555; resize(); };
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
  observer.observe(copy);
  window.addEventListener("scroll", scroll, { passive: true });
  window.addEventListener("wheel", resumeScroll, { passive: true });
  window.addEventListener("touchmove", resumeScroll, { passive: true });
  pin.addEventListener("pointermove", pointer, { passive: true });
  pin.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", visibility);
  reduced.addEventListener("change", preference);
  renderer.domElement.addEventListener("webglcontextlost", lost);
  renderer.domElement.addEventListener("webglcontextrestored", restored);
  resize();

  return {
    ready: preview === undefined,
    seek(value: number) {
      if (preview !== undefined) return;
      // Focus can queue a scroll event; establish its position before the manual selection.
      measureScroll();
      manual = true;
      progress = targetProgress = phoneMotion(value).progress;
      paint();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      intersection.disconnect(); observer.disconnect();
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("wheel", resumeScroll);
      window.removeEventListener("touchmove", resumeScroll);
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
