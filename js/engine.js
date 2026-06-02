// engine.js — the storybook runtime: render loop, camera, bloom, input, and
// the chapter manager that drives the narration UI.
import { THREE, Tweens, makeStarfield, easeInOut, clamp, PAL } from "./helpers.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export class Engine {
  constructor(canvas, chapters) {
    this.canvas = canvas;
    this.chapters = chapters;
    this.index = -1;
    this.step = 0;
    this.current = null;       // built chapter instance {update,onStep,dispose}
    this.tweens = new Tweens();
    this.clock = new THREE.Clock();
    this.muted = false;
    this.seen = new Set();

    this._initRenderer();
    this._initScene();
    this._initInput();
    this._bindUI();

    window.addEventListener("resize", () => this._resize());
    this._resize();
  }

  /* ----- setup ----- */
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x05060f, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05060f, 0.0026);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);
    this.camera.position.set(0, 0, 26);
    this.camTarget = new THREE.Vector3(0, 0, 0);

    // lights for any solid meshes
    this.scene.add(new THREE.AmbientLight(0x4a5a8a, 0.9));
    const key = new THREE.PointLight(0xfff0d0, 1.2, 0, 1.4);
    key.position.set(20, 30, 30);
    this.scene.add(key);
    const rim = new THREE.PointLight(PAL.cyan, 0.8, 0, 1.6);
    rim.position.set(-30, -10, 10);
    this.scene.add(rim);

    // persistent starfield background
    this.starfield = makeStarfield(2000, 240, 11);
    this.scene.add(this.starfield);

    // per-chapter content lives in here; cleared on transition
    this.root = new THREE.Group();
    this.scene.add(this.root);

    // postprocessing: subtle bloom for the "glow"
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.62, 0.18);
    this.composer.addPass(this.bloom);
  }

  _initInput() {
    this.input = {
      pointer: new THREE.Vector2(0, 0),   // normalized device coords
      pointerPx: new THREE.Vector2(0, 0), // raw pixels
      down: false,
      justDown: false,
      justUp: false,
      keys: new Set(),
      raycaster: new THREE.Raycaster(),
      // orbit state
      drag: false,
    };

    // free-look orbit around camTarget
    this.orbit = { az: 0, el: 0, dist: 26, autoSpin: 0.0 };
    let lastX = 0, lastY = 0;

    const setPointer = (clientX, clientY) => {
      const r = this.canvas.getBoundingClientRect();
      this.input.pointerPx.set(clientX - r.left, clientY - r.top);
      this.input.pointer.set(
        ((clientX - r.left) / r.width) * 2 - 1,
        -((clientY - r.top) / r.height) * 2 + 1
      );
    };

    const onDown = (e) => {
      this._unlockAudio();
      const t = e.touches ? e.touches[0] : e;
      setPointer(t.clientX, t.clientY);
      this.input.down = true;
      this.input.justDown = true;
      this.input.drag = true;
      lastX = t.clientX; lastY = t.clientY;
    };
    const onMove = (e) => {
      const t = e.touches ? e.touches[0] : e;
      setPointer(t.clientX, t.clientY);
      if (this.input.drag && this.allowOrbit) {
        const dx = t.clientX - lastX, dy = t.clientY - lastY;
        lastX = t.clientX; lastY = t.clientY;
        this.orbit.az -= dx * 0.005;
        this.orbit.el = clamp(this.orbit.el + dy * 0.005, -1.2, 1.2);
        this._userMovedCam = true;
      }
    };
    const onUp = () => {
      if (this.input.down) this.input.justUp = true;
      this.input.down = false;
      this.input.drag = false;
    };

    this.canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    this.canvas.addEventListener("wheel", (e) => {
      if (!this.allowOrbit) return;
      e.preventDefault();
      this.orbit.dist = clamp(this.orbit.dist * (1 + Math.sign(e.deltaY) * 0.08), 6, 120);
      this._userMovedCam = true;
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      this._unlockAudio();
      this.input.keys.add(e.key);
      if (e.key === "ArrowRight" || e.key === " ") { this.next(); }
      if (e.key === "ArrowLeft") { this.prev(); }
    });
    window.addEventListener("keyup", (e) => this.input.keys.delete(e.key));
  }

  _bindUI() {
    this.ui = {
      root: document.getElementById("ui"),
      title: document.getElementById("narrTitle"),
      text: document.getElementById("narrText"),
      tag: document.getElementById("chapterTag"),
      hint: document.getElementById("hint"),
      panel: document.getElementById("panel"),
      prev: document.getElementById("prevBtn"),
      next: document.getElementById("nextBtn"),
      dots: document.getElementById("dots"),
      mute: document.getElementById("muteBtn"),
      loader: document.getElementById("loader"),
      monographBtn: document.getElementById("monographBtn"),
      closeMonographBtn: document.getElementById("closeMonographBtn"),
      monographSidebar: document.getElementById("monographSidebar"),
      monographContent: document.getElementById("monographContent"),
      goalContainer: document.getElementById("goalContainer"),
      goalLabel: document.getElementById("goalLabel"),
      goalStatus: document.getElementById("goalStatus"),
      goalBar: document.getElementById("goalBar"),
    };
    this.ui.prev.addEventListener("click", () => { this._unlockAudio(); this.prev(); });
    this.ui.next.addEventListener("click", () => { this._unlockAudio(); this.next(); });
    this.ui.mute.addEventListener("click", () => {
      this.muted = !this.muted;
      this.ui.mute.textContent = this.muted ? "🔈" : "🔊";
      if (this.audio) this.audio.muted = this.muted;
    });

    this.ui.monographBtn.addEventListener("click", () => this.toggleMonograph());
    this.ui.closeMonographBtn.addEventListener("click", () => this.closeMonograph());

    // chapter dots
    this.chapters.forEach((ch, i) => {
      const d = document.createElement("div");
      d.className = "dot";
      d.title = ch.title;
      d.addEventListener("click", () => this.goto(i));
      this.ui.dots.appendChild(d);
    });
  }

  toggleMonograph() {
    this.ui.monographSidebar.classList.toggle("closed");
    this.blip(600, 0.05, "sine", 0.03);
  }
  closeMonograph() {
    this.ui.monographSidebar.classList.add("closed");
    this.blip(500, 0.05, "sine", 0.03);
  }

  /* ----- audio (tiny WebAudio blips, no assets needed) -----
     Browsers block audio until the first user gesture, so we don't even
     create the AudioContext until then — keeps the console clean. */
  _unlockAudio() {
    if (this._audioUnlocked) return;
    this._audioUnlocked = true;
    try {
      this.audio = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audio.state === "suspended") this.audio.resume();
    } catch { this.audio = null; }
  }
  _ensureAudio() { /* audio is created lazily on first gesture via _unlockAudio */ }
  blip(freq = 660, dur = 0.12, type = "sine", gain = 0.06) {
    if (this.muted) return;
    this._ensureAudio();
    if (!this.audio) return;
    if (this.audio.state === "suspended") this.audio.resume();
    const t = this.audio.currentTime;
    const o = this.audio.createOscillator();
    const g = this.audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.audio.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  // a satisfying "pop" — pitch glides down quickly
  pop(base = 520) {
    if (this.muted) return;
    this._ensureAudio();
    if (!this.audio) return;
    if (this.audio.state === "suspended") this.audio.resume();
    const t = this.audio.currentTime;
    const o = this.audio.createOscillator();
    const g = this.audio.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(base * 1.7, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.6, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.audio.destination);
    o.start(t); o.stop(t + 0.24);
  }

  /* ----- chapter context handed to each chapter ----- */
  _ctx() {
    const self = this;
    return {
      THREE,
      scene: this.root,
      camera: this.camera,
      renderer: this.renderer,
      input: this.input,
      tweens: this.tweens,
      engine: this,
      blip: (...a) => self.blip(...a),
      pop: (...a) => self.pop(...a),
      // raycast helper against a list of objects, returns first hit
      hit(objs, recursive = false) {
        self.input.raycaster.setFromCamera(self.input.pointer, self.camera);
        const r = self.input.raycaster.intersectObjects(objs, recursive);
        return r.length ? r[0] : null;
      },
      // chapters call this to reveal an action hint
      setHint: (txt) => self.setHint(txt),
      // chapters call this to enable the Next button + nudge it
      ready: () => self.markReady(),
      // point on the focal plane (z=camTarget.z) under the pointer
      planePoint(z = 0) {
        self.input.raycaster.setFromCamera(self.input.pointer, self.camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
        const out = new THREE.Vector3();
        self.input.raycaster.ray.intersectPlane(plane, out);
        return out;
      },
      updateGoal(val, maxVal, label) {
        self.updateGoal(val, maxVal, label);
      },
      completeGoal() {
        self.completeGoal();
      }
    };
  }

  /* ----- navigation ----- */
  start() {
    if (this._started) return;
    this._started = true;
    this.ui.loader.classList.add("gone");
    this.ui.root.classList.remove("hidden");
    setTimeout(() => this.ui.loader.remove(), 900);
    this.goto(0);
    this._loop();
  }

  goto(i) {
    if (i < 0 || i >= this.chapters.length) return;
    // Close monograph sidebar on transition
    this.closeMonograph();
    // tear down previous
    if (this.current && this.current.dispose) this.current.dispose();
    this.tweens.clear();
    while (this.root.children.length) {
      const c = this.root.children.pop();
      c.traverse?.((o) => { o.geometry?.dispose?.(); if (o.material) disposeMat(o.material); });
    }

    this.index = i;
    this.step = 0;
    this.seen.add(i);
    const ch = this.chapters[i];

    // Reset goal state
    this.goalComplete = false;
    this.goalVal = 0;
    if (ch.goalTitle) {
      this.initGoal(ch.goalTitle, ch.goalMax || 100);
    } else {
      this.ui.goalContainer.classList.add("hidden");
    }

    // Update Monograph Study Sidebar Content
    this._updateMonographContent();

    // camera framing for this chapter
    this.allowOrbit = ch.orbit !== false;
    this._userMovedCam = false;
    if (ch.camera) {
      const c = ch.camera;
      // express as orbit around target
      this.camTarget.set(...(c.target || [0, 0, 0]));
      const p = new THREE.Vector3(...(c.pos || [0, 0, 26]));
      const off = p.clone().sub(this.camTarget);
      this.orbit.dist = off.length();
      this.orbit.az = Math.atan2(off.x, off.z);
      this.orbit.el = Math.asin(clamp(off.y / this.orbit.dist, -1, 1));
      this.orbit.autoSpin = c.spin || 0;
    }

    // build content
    this.ctx = this._ctx();
    this.current = ch.build ? ch.build(this.ctx) : null;

    // narration UI
    this._renderNarration(true);
    this._renderDots();
    this.setHint("");
    this._updateGoalVisibility();
    this.blip(520, 0.1, "sine", 0.04);
  }

  next() {
    const ch = this.chapters[this.index];
    const n = ch.narration ? ch.narration.length : 1;
    if (this.step < n - 1) {
      this.step++;
      this._renderNarration(false);
      this.current?.onStep?.(this.step);
      this.blip(700, 0.08, "sine", 0.035);
      
      this._updateGoalVisibility();
    } else if (this.index < this.chapters.length - 1) {
      if (this.goalComplete || !ch.goalTitle) {
        this.goto(this.index + 1);
      } else {
        this.markReady(false);
      }
    } else {
      this.blip(880, 0.2, "sine", 0.05);
    }
  }

  prev() {
    if (this.step > 0) {
      this.step--;
      this._renderNarration(false);
      this.current?.onStep?.(this.step);
      this.markReady(true);
      this._updateGoalVisibility();
    } else if (this.index > 0) {
      this.goto(this.index - 1);
    }
  }

  /* ----- UI rendering ----- */
  _renderNarration(swap) {
    const ch = this.chapters[this.index];
    const steps = ch.narration || [""];
    const body = steps[Math.min(this.step, steps.length - 1)];
    const apply = () => {
      this.ui.title.textContent = ch.title;
      this.ui.tag.textContent = ch.tag || `Chapter ${this.index + 1}`;
      this._typeNarrText(body);
      this.ui.panel.classList.remove("swap");
      this.ui.prev.disabled = this.index === 0 && this.step === 0;
    };
    if (swap) {
      this.ui.panel.classList.add("swap");
      setTimeout(apply, 220);
    } else {
      apply();
    }
  }

  _typeNarrText(htmlText) {
    if (this._typingInterval) {
      clearInterval(this._typingInterval);
      this._typingInterval = null;
    }
    this.ui.text.innerHTML = "";
    let i = 0;
    const len = htmlText.length;
    const type = () => {
      if (i >= len) {
        this.ui.text.innerHTML = htmlText;
        clearInterval(this._typingInterval);
        this._typingInterval = null;
        return;
      }
      if (htmlText[i] === '<') {
        const closeIdx = htmlText.indexOf('>', i);
        if (closeIdx !== -1) {
          i = closeIdx + 1;
        } else {
          i++;
        }
      } else {
        i++;
      }
      this.ui.text.innerHTML = htmlText.substring(0, i);
      if (i % 3 === 0) {
        this.blip(1100, 0.004, "sine", 0.005);
      }
    };
    this._typingInterval = setInterval(type, 12);
  }

  _renderDots() {
    [...this.ui.dots.children].forEach((d, i) => {
      d.classList.toggle("active", i === this.index);
      d.classList.toggle("seen", i !== this.index && this.seen.has(i));
    });
  }

  setHint(txt) {
    this.ui.hint.textContent = txt || "";
    this.ui.hint.classList.toggle("show", !!txt);
  }

  markReady(ready = true) {
    const ch = this.chapters[this.index];
    const n = ch.narration ? ch.narration.length : 1;
    let actuallyReady = ready;
    if (this.step === n - 1 && ch.goalTitle && !this.goalComplete) {
      actuallyReady = false;
    }
    this.ui.next.disabled = !actuallyReady;
    this.ui.next.classList.toggle("pulse", actuallyReady);
  }

  /* ----- Interactive Goal Tracking ----- */
  initGoal(label, maxVal = 100) {
    this.goalLabel = label;
    this.goalMax = maxVal;
    this.goalVal = 0;
    this.goalComplete = false;
    this.ui.goalContainer.classList.remove("hidden", "complete");
    this.ui.goalLabel.textContent = `Goal: ${label}`;
    this.ui.goalStatus.textContent = `0 / ${maxVal}`;
    this.ui.goalBar.style.width = "0%";
  }

  updateGoal(val, maxVal = null, label = null) {
    if (this.goalComplete) return;
    if (maxVal !== null) this.goalMax = maxVal;
    if (label !== null) this.ui.goalLabel.textContent = `Goal: ${label}`;
    this.goalVal = Math.min(this.goalMax, Math.max(0, val));
    this.ui.goalStatus.textContent = `${this.goalVal} / ${this.goalMax}`;
    const pct = this.goalMax > 0 ? (this.goalVal / this.goalMax) * 100 : 0;
    this.ui.goalBar.style.width = `${pct}%`;
    if (this.goalVal >= this.goalMax && this.goalMax > 0) {
      this.completeGoal();
    }
  }

  completeGoal() {
    if (this.goalComplete) return;
    this.goalComplete = true;
    this.ui.goalContainer.classList.add("complete");
    this.ui.goalStatus.textContent = "Complete! ✨";
    this.ui.goalBar.style.width = "100%";

    // Success rising chime
    setTimeout(() => this.blip(523, 0.08, "sine", 0.05), 0);
    setTimeout(() => this.blip(659, 0.08, "sine", 0.05), 50);
    setTimeout(() => this.blip(784, 0.08, "sine", 0.05), 100);
    setTimeout(() => this.blip(1046, 0.16, "sine", 0.05), 150);

    // Call goal complete hook on the chapter
    this.current?.onGoalComplete?.();

    this.markReady(true);
  }

  _updateGoalVisibility() {
    const ch = this.chapters[this.index];
    const n = ch.narration ? ch.narration.length : 1;
    if (this.step === n - 1 && ch.goalTitle) {
      this.ui.goalContainer.classList.remove("hidden");
      this.markReady(this.goalComplete);
    } else {
      this.ui.goalContainer.classList.add("hidden");
      this.markReady(true);
    }
  }

  _updateMonographContent() {
    const ch = this.chapters[this.index];
    if (ch.monographHtml) {
      this.ui.monographContent.innerHTML = ch.monographHtml;
      this.ui.monographBtn.classList.remove("hidden");
    } else {
      this.ui.monographContent.innerHTML = "<p>No monograph details available for this chapter.</p>";
      this.ui.monographBtn.classList.add("hidden");
    }
  }

  /* ----- loop ----- */
  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _updateCamera(dt) {
    if (this.orbit.autoSpin && !this._userMovedCam) this.orbit.az += this.orbit.autoSpin * dt;
    const d = this.orbit.dist, az = this.orbit.az, el = this.orbit.el;
    const x = d * Math.cos(el) * Math.sin(az);
    const y = d * Math.sin(el);
    const z = d * Math.cos(el) * Math.cos(az);
    // ease camera toward computed orbit position (smooth transitions between chapters)
    const want = new THREE.Vector3(x, y, z).add(this.camTarget);
    this.camera.position.lerp(want, 1 - Math.pow(0.0001, dt));
    this.camera.lookAt(this.camTarget);
  }

  _loop() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.tweens.update(dt);
    this._updateCamera(dt);
    if (this.starfield) this.starfield.rotation.y += 0.004 * dt;
    this.current?.update?.(dt, t, this.ctx);

    this.composer.render();

    // reset per-frame input edges
    this.input.justDown = false;
    this.input.justUp = false;
    requestAnimationFrame(() => this._loop());
  }
}

function disposeMat(m) {
  if (Array.isArray(m)) m.forEach(disposeMat);
  else { m.map?.dispose?.(); m.dispose?.(); }
}
