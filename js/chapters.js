// chapters.js — the eight interactive "worlds". Each chapter is faithful to a
// real idea in the book, retold for a curious ~10-year-old, with a 3D toy to play.
import {
  THREE, PAL, lerp, clamp, smoothstep, easeOut, easeInOut,
  mulberry32, makePoints, makeTextSprite, makeSpark, glowTexture,
} from "./helpers.js";

/* ============================================================= *
 *  small shared toys
 * ============================================================= */

// A short-lived particle burst (used for pops & celebrations).
class Burst {
  constructor(scene, pos, { count = 80, color = PAL.spark, speed = 14, size = 0.5, life = 0.9 } = {}) {
    const p = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.3 + Math.random());
      this.vel[i * 3] = s * Math.sin(ph) * Math.cos(th);
      this.vel[i * 3 + 1] = s * Math.sin(ph) * Math.sin(th);
      this.vel[i * 3 + 2] = s * Math.cos(ph) * 0.4;
    }
    this.pts = makePoints(p, { size, color, opacity: 1 });
    scene.add(this.pts);
    this.t = 0; this.life = life; this.scene = scene; this.dead = false;
  }
  update(dt) {
    this.t += dt;
    const k = this.t / this.life;
    if (k >= 1) { this.kill(); return; }
    const a = this.pts.geometry.attributes.position.array;
    for (let i = 0; i < a.length; i++) a[i] += this.vel[i] * dt * (1 - k);
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.pts.material.opacity = 1 - k;
    this.pts.material.size = lerp(0.5, 0.05, k);
  }
  kill() {
    if (this.dead) return; this.dead = true;
    this.scene.remove(this.pts);
    this.pts.geometry.dispose(); this.pts.material.dispose();
  }
}

// sample points from the filled pixels of a glyph (letter / emoji-ish char)
function glyphPoints(ch, count, scale = 0.05) {
  const S = 200;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 150px 'Baloo 2', sans-serif";
  ctx.fillText(ch, S / 2, S / 2 + 6);
  const img = ctx.getImageData(0, 0, S, S).data;
  const filled = [];
  for (let y = 0; y < S; y += 2)
    for (let x = 0; x < S; x += 2)
      if (img[(y * S + x) * 4 + 3] > 100) filled.push([x, y]);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [x, y] = filled.length ? filled[(Math.random() * filled.length) | 0] : [S / 2, S / 2];
    out[i * 3] = (x - S / 2) * scale;
    out[i * 3 + 1] = -(y - S / 2) * scale;
    out[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
  }
  return out;
}

const ringMat = (color, op = 0.9) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide });

/* ============================================================= *
 *  CH 1 — The World Before Things  (trajectories > objects)
 * ============================================================= */
const ch1 = {
  title: "It's not about things. It's about where you can go.",
  tag: "Chapter 1 · The Big Idea",
  camera: { pos: [0, 3, 30], target: [0, 0, 0], spin: 0.05 },
  goalTitle: "Send Spark on 3 new paths by tapping",
  goalMax: 3,
  monographHtml: `
    <div class="mono-sec">
      <h4>Chapter 1: The World Before Objects</h4>
      <p>We argue that accessibility landscapes are the more fundamental substrate, and that objects emerge as stable projections of constraint geometry.</p>
      
      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 1.1: Trajectory</div>
        Let <i>Q</i> be a configuration space with metric <i>g</i>. A trajectory is a smooth map
        <div class="mono-eq">γ : [0, T] ➔ Q</div>
        satisfying the admissibility condition:
        <div class="mono-eq">γ(t) ∈ Adm(C(t)) for all t ∈ [0, T]</div>
        where <i>C(t)</i> is the active constraint set at time <i>t</i>.
      </div>

      <div class="mono-box theorem">
        <div class="mono-box-title theo">Theorem 1.1: Map–Territory Projection Theorem</div>
        Let <i>T</i> be a territory and let <i>M</i> be a map. Any faithful map-making procedure is a continuous projection
        <div class="mono-eq">π : T ➔ M</div>
        with non-trivial fibers <span class="mono-inline-eq">π⁻¹(m) ≠ {*}</span> for generic <i>m ∈ M</i>. Information not recovered from <i>π</i> alone lives in the fiber.
      </div>
    </div>
  `,
  narration: [
    "Most books tell you what things <b>are</b>. This one is about something sneakier: where you can <b>go</b> from where you are right now.",
    "See all these little lights? Think of each one as a <i>place you could be</i> — a thought, a number, a move in a game.",
    "A <b>path</b> through them tells you more than any single dot. The <i>journey</i> is the real story. Watch my spark travel!",
    "Tap anywhere to send the spark on a brand-new path. Every path is a different way to <b>reach</b> the same starry sky. Ready? Hit <b>next</b>.",
  ],
  build(ctx) {
    const { scene } = ctx;
    const rnd = mulberry32(3);
    const N = 1400;
    const pos = new Float32Array(N * 3);
    const nodes = [];
    for (let i = 0; i < N; i++) {
      const r = 4 + rnd() * 12;
      const th = Math.acos(2 * rnd() - 1), ph = rnd() * Math.PI * 2;
      const v = new THREE.Vector3(
        r * Math.sin(th) * Math.cos(ph),
        r * Math.sin(th) * Math.sin(ph) * 0.6,
        r * Math.cos(th)
      );
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      if (i % 11 === 0) nodes.push(v);
    }
    const cloud = makePoints(pos, { size: 0.45, color: PAL.cyan, opacity: 0.8 });
    scene.add(cloud);

    const spark = makeSpark(PAL.spark, 2.6);
    scene.add(spark);

    const trailGeo = new THREE.BufferGeometry();
    const trailMax = 120;
    const trailPos = new Float32Array(trailMax * 3);
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
      color: PAL.spark, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending,
    }));
    trail.frustumCulled = false;
    scene.add(trail);

    let curve = null, ct = 0, trailCount = 0;
    let pathCount = 0;
    const newPath = (target) => {
      const a = spark.position.clone();
      const mid1 = a.clone().lerp(target, 0.33).add(new THREE.Vector3((rnd() - 0.5) * 14, (rnd() - 0.5) * 14, (rnd() - 0.5) * 14));
      const mid2 = a.clone().lerp(target, 0.66).add(new THREE.Vector3((rnd() - 0.5) * 12, (rnd() - 0.5) * 12, (rnd() - 0.5) * 12));
      curve = new THREE.CatmullRomCurve3([a, mid1, mid2, target]);
      ct = 0;
      ctx.blip(620, 0.12, "sine", 0.05);
    };
    spark.position.copy(nodes[0]);
    newPath(nodes[(rnd() * nodes.length) | 0]);

    return {
      onStep() {},
      update(dt) {
        // travel along current path
        if (curve) {
          ct = Math.min(1, ct + dt * 0.35);
          curve.getPoint(ct, spark.position);
          if (ct >= 1) newPath(nodes[(rnd() * nodes.length) | 0]);
        }
        // grow a fading trail
        if (trailCount < trailMax) trailCount++;
        for (let i = trailCount - 1; i > 0; i--) {
          trailPos[i * 3] = trailPos[(i - 1) * 3];
          trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1];
          trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2];
        }
        trailPos[0] = spark.position.x; trailPos[1] = spark.position.y; trailPos[2] = spark.position.z;
        trailGeo.setDrawRange(0, trailCount);
        trailGeo.attributes.position.needsUpdate = true;
        spark.material.opacity = 0.8 + 0.2 * Math.sin(performance.now() * 0.006);

        // click -> new destination toward pointer
        if (ctx.input.justDown) {
          const p = ctx.planePoint(0);
          newPath(p.clampLength(0, 16));
          pathCount++;
          ctx.updateGoal(pathCount);
        }
      },
      dispose() {},
    };
  },
};

/* ============================================================= *
 *  CH 2 — Bubbles & Boundaries (containment is the first idea)
 * ============================================================= */
const ch2 = {
  title: "Inside, outside, and the line between",
  tag: "Chapter 2 · Boundaries",
  camera: { pos: [0, 0, 24], target: [0, 0, 0], spin: 0.12 },
  goalTitle: "Inspect all 3 nested boundary levels",
  goalMax: 3,
  monographHtml: `
    <div class="mono-sec">
      <h4>Chapter 2: Regions, Boundaries, and Collapse</h4>
      <p>Before symbols, before operators, before logic — there is the boundary. The inside and the outside. The contained and the containing.</p>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 2.1: Containment Relation</div>
        Let <i>X</i> be a topological space. A containment relation on <i>X</i> is a binary relation <span class="mono-inline-eq">⊂</span> satisfying:
        <ol style="margin-left: 1.2rem; margin-top: 0.4rem;">
          <li>Transitivity: if A ⊂ B and B ⊂ C then A ⊂ C</li>
          <li>Antisymmetry: if A ⊂ B and B ⊂ A then A = B</li>
          <li>Non-triviality: there exist A, B with A ⊊ B</li>
        </ol>
      </div>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 2.2: Nesting Sequence</div>
        A nesting sequence of depth <i>n</i> is a chain:
        <div class="mono-eq">A₁ ⊊ A₂ ⊊ ... ⊊ Aₙ</div>
        The depth of an element <span class="mono-inline-eq">x ∈ A₁</span> within <i>Aₙ</i> is <i>n</i>.
      </div>

      <div class="mono-box theorem">
        <div class="mono-box-title theo">Theorem 2.1: Collapse Reduces Depth</div>
        Any collapse map <i>𝒦</i> satisfies:
        <div class="mono-eq">depth(𝒦(σ)) &lt; depth(σ)</div>
        for any non-trivial nesting sequence <i>σ</i> of depth ≥ 1.
      </div>
    </div>
  `,
  narration: [
    "Before counting, before letters, babies learn one giant idea: <b>inside</b> and <b>outside</b>. This block is in the box. That one is not.",
    "A <b>boundary</b> is a sneaky thing — it makes <i>two</i> things at once: the inside AND the outside. One line, two worlds.",
    "You can put bubbles <b>inside</b> bubbles inside bubbles. How deep a thing sits is called its <b>depth</b>. Click a bubble to light it up!",
    "Hold onto this: <i>everything</i> next — math, letters, even the universe — is built from bubbles inside bubbles. Onward!",
  ],
  build(ctx) {
    const { scene } = ctx;
    const colors = [PAL.violet, PAL.cyan, PAL.spark];
    const radii = [9, 5.5, 2.6];
    const bubbles = [];
    radii.forEach((r, i) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 48, 32),
        new THREE.MeshPhongMaterial({
          color: colors[i], transparent: true, opacity: 0.12,
          shininess: 90, side: THREE.DoubleSide, depthWrite: false,
        })
      );
      const wire = new THREE.Mesh(
        new THREE.SphereGeometry(r, 24, 16),
        new THREE.MeshBasicMaterial({ color: colors[i], wireframe: true, transparent: true, opacity: 0.18 })
      );
      mesh.add(wire);
      scene.add(mesh);
      const label = makeTextSprite(`depth ${i}`, { color: "#dfe8ff", size: 40 });
      label.position.set(0, r + 0.7, 0);
      label.scale.multiplyScalar(1.4);
      mesh.add(label);
      bubbles.push({ mesh, wire, base: 0.12, r });
    });

    // a sprinkle of points living in the innermost bubble
    const N = 300, p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = Math.cbrt(Math.random()) * 2.3;
      const th = Math.acos(2 * Math.random() - 1), ph = Math.random() * Math.PI * 2;
      p[i * 3] = r * Math.sin(th) * Math.cos(ph);
      p[i * 3 + 1] = r * Math.sin(th) * Math.sin(ph);
      p[i * 3 + 2] = r * Math.cos(th);
    }
    scene.add(makePoints(p, { size: 0.3, color: PAL.spark, opacity: 0.9 }));

    let lit = -1;
    const visitedDepths = new Set();
    return {
      update(dt, t) {
        bubbles.forEach((b, i) => {
          const target = i === lit ? 0.34 : b.base;
          b.mesh.material.opacity += (target - b.mesh.material.opacity) * 0.1;
          b.wire.material.opacity = 0.12 + (i === lit ? 0.25 : 0) + 0.05 * Math.sin(t * 2 + i);
        });
        if (ctx.input.justDown) {
          ctx.input.raycaster.setFromCamera(ctx.input.pointer, ctx.camera);
          const hits = ctx.input.raycaster.intersectObjects(bubbles.map((b) => b.mesh), false);
          if (hits.length > 0) {
            let best = -1;
            bubbles.forEach((b, i) => {
              const hasHit = hits.some((h) => h.object === b.mesh);
              if (hasHit) best = i;
            });
            lit = best;
            ctx.pop(380 + best * 120);
            if (best !== -1) {
              visitedDepths.add(best);
              ctx.updateGoal(visitedDepths.size);
            }
          }
        }
      },
      dispose() {},
    };
  },
};

/* ============================================================= *
 *  CH 3 — Spherepop!  (arithmetic = popping the innermost bubble)
 * ============================================================= */
const ch3 = {
  title: "Spherepop: doing math by popping bubbles",
  tag: "Chapter 3 · The Pop Game",
  camera: { pos: [0, 0, 26], target: [0, 0, 0], spin: 0 },
  orbit: false,
  goalTitle: "Pop bubbles to solve the equation",
  goalMax: 3,
  monographHtml: `
    <div class="mono-sec">
      <h4>Chapter 3: Spherepop as Visual Computation</h4>
      <p>Standard mathematical notation is a historical accident. The parenthesis represents containment without being containment. Spherepop takes spatial enclosure seriously.</p>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 3.1: Spherepop Diagram</div>
        A Spherepop diagram is a planar embedding of a rooted ordered tree into ℝ² such that:
        <ul style="margin-left: 1.2rem; margin-top: 0.4rem;">
          <li>each node <i>v</i> corresponds to a closed disk <i>D_v</i></li>
          <li>if <i>u</i> is parent of <i>v</i>, then <i>D_v ⊂ D°_u</i> (interior)</li>
          <li>sibling disks are pairwise disjoint</li>
          <li>labels are written inside the disk but outside all children</li>
        </ul>
      </div>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 3.2: The Pop Operator</div>
        A bubble <i>B</i> is poppable if it contains no child bubbles. The <b>pop</b> of <i>B</i> replaces <i>B</i> with the result of applying its operator to its atomic arguments.
      </div>

      <div class="mono-box theorem">
        <div class="mono-box-title theo">Theorem 3.1: Spherepop Completeness</div>
        Every finite Spherepop diagram with no refusing bubbles and no unbound variables collapses to a single atomic bubble in finitely many pops.
      </div>
    </div>
  `,
  narration: [
    "Here's a math puzzle drawn as bubbles: <b>6 + (2 × (5 − 1))</b>. No need to remember rules — just look at what's inside what.",
    "The rule is simple and fair: <b>always pop the innermost bubble first</b>. The glowing one is ready. Tap it to pop it!",
    "Each pop turns a little bubble into a single number — that's called <i>collapse</i>. Keep popping the glowing bubbles…",
    "…until only ONE number is left. That's your answer! Pop everything to win. 🫧",
  ],
  build(ctx) {
    const { scene } = ctx;
    // expression tree: 6 + (2 × (5 − 1))
    const E = (op, a, b) => ({ op, k: [a, b] });
    const L = (v) => ({ v });
    let root = E("+", L(6), E("×", L(2), E("−", L(5), L(1))));

    const group = new THREE.Group();
    scene.add(group);
    const bursts = [];
    let solved = false;

    // ---- layout: pack children left-to-right, parent circle encloses them
    function layout(n) {
      if (n.v !== undefined) { n.r = 1.5; n.w = 2 * n.r; return; }
      n.k.forEach(layout);
      const gap = 1.4;
      const totalW = n.k.reduce((s, c) => s + c.w, 0) + gap * (n.k.length - 1);
      let x = -totalW / 2;
      let maxReach = 0;
      n.k.forEach((c) => {
        c.ox = x + c.w / 2; // offset relative to this node center
        x += c.w + gap;
        maxReach = Math.max(maxReach, Math.abs(c.ox) + c.r);
      });
      n.r = maxReach + 1.6;
      n.w = 2 * n.r;
    }
    function place(n, X, Y) {
      n.x = X; n.y = Y;
      if (n.k) n.k.forEach((c) => place(c, X + c.ox, Y));
    }

    const opColor = { "+": PAL.green, "×": PAL.spark2, "−": PAL.cyan };
    const meshes = []; // {node, disc, ring, label}

    function buildMesh(n) {
      const color = n.v !== undefined ? PAL.spark : opColor[n.op];
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(n.r, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, side: THREE.DoubleSide })
      );
      disc.position.set(n.x, n.y, n.v !== undefined ? 0.2 : 0);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(n.r - 0.12, n.r, 64),
        ringMat(color, 0.7)
      );
      ring.position.copy(disc.position);
      group.add(disc); group.add(ring);

      let label;
      if (n.v !== undefined) {
        label = makeTextSprite(String(n.v), { color: "#fff", size: 96, glow: "rgba(255,214,107,0.8)" });
        label.scale.multiplyScalar(1.6);
        label.position.set(n.x, n.y, 0.6);
      } else {
        const sym = { "+": "+", "×": "×", "−": "−" }[n.op];
        label = makeTextSprite(sym, { color: "#fff", size: 80 });
        label.scale.multiplyScalar(1.5);
        label.position.set(n.x, n.y + n.r - 0.9, 0.6); // operator sits near top of its bubble
      }
      group.add(label);
      const rec = { node: n, disc, ring, label, color };
      meshes.push(rec);
      n._mesh = rec;
      if (n.k) n.k.forEach(buildMesh);
    }

    function poppable(n) { return n.op && n.k.every((c) => c.v !== undefined); }
    function allPoppable(n, acc = []) {
      if (n.op) { if (poppable(n)) acc.push(n); n.k.forEach((c) => allPoppable(c, acc)); }
      return acc;
    }

    let popCount = 0;
    function rebuild() {
      meshes.length = 0;
      while (group.children.length) {
        const c = group.children.pop();
        c.geometry?.dispose?.(); c.material?.map?.dispose?.(); c.material?.dispose?.();
      }
      layout(root);
      place(root, 0, 0);
      // fit camera-ish: scale group so root fits
      const s = clamp(11 / root.r, 0.4, 2.2);
      group.scale.setScalar(s);
      buildMesh(root);
    }
    rebuild();

    function pop(n) {
      const val = { "+": (a, b) => a + b, "×": (a, b) => a * b, "−": (a, b) => a - b }[n.op](
        n.k[0].v, n.k[1].v
      );
      const wp = new THREE.Vector3(n.x, n.y, 0).multiplyScalar(group.scale.x);
      bursts.push(new Burst(scene, wp, { color: n._mesh.color, count: 70, speed: 10, size: 0.45 }));
      ctx.pop(420 + Math.random() * 120);
      // mutate node into a leaf
      delete n.op; delete n.k; n.v = val;
      rebuild();
      popCount++;
      ctx.updateGoal(popCount);
      // pop-in animation on the new number
      const rec = n._mesh;
      [rec.disc, rec.ring, rec.label].forEach((m) => {
        const target = m.scale.clone();
        m.scale.multiplyScalar(0.1);
        ctx.tweens.to(m.scale, { x: target.x, y: target.y, z: target.z }, 0.4, { ease: easeOut });
      });
      if (root.v !== undefined) {
        solved = true;
        ctx.setHint("");
        const wp2 = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < 5; i++)
          bursts.push(new Burst(scene, wp2, { color: [PAL.spark, PAL.spark2, PAL.cyan, PAL.green][i % 4], count: 90, speed: 18 - i, size: 0.5, life: 1.3 }));
        ctx.blip(880, 0.25, "sine", 0.06);
        ctx.ready();
        ctx.setHint(`The answer is ${root.v}! You solved it by popping. Hit next ▶`);
      }
    }

    let hintShown = false;
    return {
      onStep(i) {
        if (i >= 1 && !solved && !hintShown) { ctx.setHint("Tap the glowing bubble to pop it!"); hintShown = true; }
      },
      update(dt, t) {
        for (let i = bursts.length - 1; i >= 0; i--) { bursts[i].update(dt); if (bursts[i].dead) bursts.splice(i, 1); }
        // highlight the poppable (innermost-ready) bubbles
        const ready = solved ? [] : allPoppable(root);
        meshes.forEach((m) => {
          const isReady = ready.includes(m.node);
          const pulse = isReady ? 0.55 + 0.35 * Math.sin(t * 5) : (m.node.op ? 0.35 : 0.7);
          m.ring.material.opacity += (pulse - m.ring.material.opacity) * 0.2;
          const fill = isReady ? 0.22 : 0.07;
          m.disc.material.opacity += (fill - m.disc.material.opacity) * 0.2;
        });

        if (ctx.input.justDown && !solved) {
          const opMeshes = meshes.filter(m => m.node.op !== undefined);
          const discs = opMeshes.map((m) => m.disc);
          ctx.input.raycaster.setFromCamera(ctx.input.pointer, ctx.camera);
          const hits = ctx.input.raycaster.intersectObjects(discs, false);
          if (hits.length > 0) {
            // Find all matching mesh records
            const hitRecords = hits.map(h => opMeshes.find(m => m.disc === h.object)).filter(Boolean);
            // Sort by node radius ascending (smallest radius first, i.e., innermost)
            hitRecords.sort((a, b) => a.node.r - b.node.r);
            const rec = hitRecords[0];
            if (rec && poppable(rec.node)) pop(rec.node);
            else {
              // wrong one — gentle nudge
              ctx.blip(200, 0.1, "square", 0.04);
              ctx.setHint("Pop the GLOWING one first — innermost bubble wins!");
              if (rec) {
                const m = rec.ring;
                const x0 = m.position.x;
                ctx.tweens.num(0, 1, 0.3, (k) => { m.position.x = x0 + Math.sin(k * 30) * 0.3 * (1 - k); });
              }
            }
          }
        }
      },
      dispose() { bursts.forEach((b) => b.kill()); },
    };
  },
};

/* ============================================================= *
 *  CH 4 — Gesture before Symbol (your squiggle becomes a letter)
 * ============================================================= */
const ch4 = {
  title: "Every letter started as a wiggle",
  tag: "Chapter 4 · Gesture → Symbol",
  camera: { pos: [0, 0, 22], target: [0, 0, 0], spin: 0 },
  orbit: false,
  goalTitle: "Draw a wiggle on the screen",
  goalMax: 25,
  monographHtml: `
    <div class="mono-sec">
      <h4>Chapter 4: Canonicalization and Equivalence</h4>
      <p>Sameness is not as simple as it appears. Two different wiggles or trajectories represent the same object after canonicalization.</p>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 4.1: Semantic Equivalence</div>
        Two syntax expressions or motor trajectories <i>e₁, e₂</i> are semantically equivalent, written <span class="mono-inline-eq">e₁ ≡ e₂</span>, if:
        <div class="mono-eq">val(e₁) = val(e₂)</div>
      </div>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 4.4: Canonical Form</div>
        A canonicalization function for an equivalence relation <i>~</i> on <i>X</i> is a function <i>c : X ➔ X</i> satisfying:
        <ol style="margin-left: 1.2rem; margin-top: 0.4rem;">
          <li>Idempotence: c(c(x)) = c(x)</li>
          <li>Equivalence-preservation: x ~ y ⟺ c(x) = c(y)</li>
        </ol>
      </div>

      <div class="mono-box theorem">
        <div class="mono-box-title theo">Theorem 4.1: Canonical Forms Classify</div>
        If <i>c : X ➔ X</i> is a canonicalization function, the quotient set of equivalence classes is in bijection with the canonical forms:
        <div class="mono-eq">X/~ ≅ c(X)</div>
      </div>
    </div>
  `,
  narration: [
    "Long before letters, people <b>moved</b> — they waved, pointed, and drew shapes in the air. The <i>movement</i> carried the meaning.",
    "Try it! <b>Press and drag</b> on the screen to draw a glowing trail. Make any wiggle you like.",
    "Now watch the magic: your wiggle can <b>freeze</b> into a real symbol. Hit <b>next</b> to turn your trail into a letter.",
    "That's how writing was born — wiggles that got <i>frozen</i> into shapes everyone agreed to share. Your scribble just became an <b>A</b>!",
  ],
  build(ctx) {
    const { scene } = ctx;
    const N = 1500;
    const live = new Float32Array(N * 3);
    // start as a faint resting cloud
    for (let i = 0; i < N; i++) {
      live[i * 3] = (Math.random() - 0.5) * 16;
      live[i * 3 + 1] = (Math.random() - 0.5) * 10;
      live[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    }
    const cloud = makePoints(live, { size: 0.32, color: PAL.cyan, opacity: 0.85 });
    scene.add(cloud);
    const attr = cloud.geometry.attributes.position;

    const spark = makeSpark(PAL.spark2, 2.2);
    spark.visible = false;
    scene.add(spark);

    const stroke = []; // recorded path points
    let tempStroke = null;
    let drawnCount = 0;
    let morphTarget = null, morphing = 0;

    const resampleToStroke = () => {
      // place the live points evenly along the recorded stroke
      if (stroke.length < 2) return;
      for (let i = 0; i < N; i++) {
        const f = (i / (N - 1)) * (stroke.length - 1);
        const a = stroke[Math.floor(f)], b = stroke[Math.ceil(f)];
        const k = f - Math.floor(f);
        attr.array[i * 3] = lerp(a.x, b.x, k) + (Math.random() - 0.5) * 0.25;
        attr.array[i * 3 + 1] = lerp(a.y, b.y, k) + (Math.random() - 0.5) * 0.25;
        attr.array[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      }
      attr.needsUpdate = true;
    };

    function classifyStroke() {
      if (stroke.length < 5) return "A";
      const start = stroke[0];
      const end = stroke[stroke.length - 1];
      const distStartEnd = start.distanceTo(end);
      let totalLen = 0;
      for (let i = 1; i < stroke.length; i++) {
        totalLen += stroke[i].distanceTo(stroke[i - 1]);
      }
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      stroke.forEach((p) => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });
      const w = Math.max(0.1, maxX - minX);
      const h = Math.max(0.1, maxY - minY);
      const maxDim = Math.max(w, h);
      if (distStartEnd < maxDim * 0.4 || distStartEnd / totalLen < 0.25) {
        return distStartEnd / totalLen > 0.15 ? "C" : "O";
      }
      if (h / w > 2.2) return "I";
      if (w / h > 2.2) return "S";
      const pool = ["A", "S", "M", "V", "Z", "U", "P", "G", "X", "Y"];
      const index = Math.floor(totalLen * 3) % pool.length;
      return pool[index];
    }

    return {
      onStep(i) {
        if (i === 1) {
          ctx.setHint("Press & drag on the screen to draw!");
          morphTarget = null;
        }
        if (i === 2) {
          morphTarget = null;
          // if they didn't draw, give them a default swoosh
          if (stroke.length < 4) {
            for (let a = 0; a <= 40; a++) {
              const t = a / 40;
              stroke.push(new THREE.Vector3(Math.cos(t * 7) * 5 * (1 - t), (t - 0.5) * 9, 0));
            }
            resampleToStroke();
            ctx.updateGoal(25); // mark goal completed for default swoosh
          }
          ctx.setHint("Now hit next ▶ to freeze it into a letter!");
        }
        if (i === 3) {
          const letter = classifyStroke();
          ch4.narration[3] = `That's how writing was born — wiggles that got frozen into shapes everyone agreed to share. Your scribble just became a <b>${letter}</b>! ✍️`;
          ctx.engine._renderNarration(false);
          morphTarget = glyphPoints(letter, N, 0.06);
          morphing = 0.0001;
          ctx.setHint("");
          ctx.blip(720, 0.2, "sine", 0.05);
        }
      },
      update(dt) {
        spark.material.opacity = 0.8 + 0.2 * Math.sin(performance.now() * 0.01);
        // drawing
        if (ctx.input.down && morphTarget === null) {
          const p = ctx.planePoint(0);
          p.z = 0;
          if (ctx.input.justDown) {
            tempStroke = [p.clone()];
          } else {
            const last = tempStroke ? tempStroke[tempStroke.length - 1] : (stroke.length ? stroke[stroke.length - 1] : null);
            if (last && last.distanceTo(p) > 0.25) {
              if (tempStroke) {
                stroke.length = 0;
                stroke.push(tempStroke[0]);
                tempStroke = null;
                drawnCount = 0;
                ctx.updateGoal(0);
                for (let i = 0; i < N; i++) {
                  attr.array[i * 3] = (Math.random() - 0.5) * 16;
                  attr.array[i * 3 + 1] = (Math.random() - 0.5) * 10;
                  attr.array[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
                }
                attr.needsUpdate = true;
              }
              stroke.push(p.clone());
              ctx.updateGoal(stroke.length);
              spark.visible = true; spark.position.copy(p);
              // paint a few live points onto the new spot
              for (let j = 0; j < 8 && drawnCount < N; j++, drawnCount++) {
                attr.array[drawnCount * 3] = p.x + (Math.random() - 0.5) * 0.5;
                attr.array[drawnCount * 3 + 1] = p.y + (Math.random() - 0.5) * 0.5;
                attr.array[drawnCount * 3 + 2] = (Math.random() - 0.5) * 0.3;
              }
              attr.needsUpdate = true;
              if (stroke.length % 3 === 0) ctx.blip(500 + stroke.length * 4, 0.04, "sine", 0.02);
            }
          }
        }
        // morphing into the glyph
        if (morphTarget) {
          morphing = Math.min(1, morphing + dt * 0.9);
          const e = easeInOut(morphing);
          for (let i = 0; i < N; i++) {
            attr.array[i * 3] = lerp(attr.array[i * 3], morphTarget[i * 3], 0.12 * e + 0.02);
            attr.array[i * 3 + 1] = lerp(attr.array[i * 3 + 1], morphTarget[i * 3 + 1], 0.12 * e + 0.02);
            attr.array[i * 3 + 2] = lerp(attr.array[i * 3 + 2], morphTarget[i * 3 + 2], 0.12 * e + 0.02);
          }
          attr.needsUpdate = true;
          cloud.material.color.lerp(new THREE.Color(PAL.spark), 0.02);
        }
      },
      dispose() {},
    };
  },
};

/* ============================================================= *
 *  CH 5 — Accessibility Landscape (where can a ball reach?)
 * ============================================================= */
const ch5 = {
  title: "Rolling into the places you can reach",
  tag: "Chapter 5 · Landscapes",
  camera: { pos: [0, 16, 22], target: [0, -1, 0], spin: 0.06 },
  goalTitle: "Roll the ball to the green target valley",
  goalMax: 1,
  monographHtml: `
    <div class="mono-sec">
      <h4>Chapter 14: Accessibility Landscapes</h4>
      <p>A possibilities landscape represents future reachability under active constraints. Valleys represent stable states; peaks represent flexibility hubs.</p>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 14.1: Admissible Future Set</div>
        The admissible future set from state <i>x</i> over horizon <i>H</i> is:
        <div class="mono-eq">𝒜_H(x) = {y ∈ X : ∃ admissible path γ : x ↝ y, |γ| ≤ H}</div>
        where path admissibility requires <span class="mono-inline-eq">κ(γ(t)) = 0</span>.
      </div>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 14.2: Accessibility Landscape</div>
        The landscape is a scalar field representing log volume of admissible futures:
        <div class="mono-eq">S_H(x) = log Vol(𝒜_H(x))</div>
      </div>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 14.6: Landscape Features</div>
        <ul style="margin-left: 1.2rem; margin-top: 0.4rem;">
          <li><b>Well</b>: local minimum of <i>S_H</i> (flexibility trap).</li>
          <li><b>Peak</b>: local maximum of <i>S_H</i> (flexibility hub).</li>
          <li><b>Ridge</b>: corridor of high-accessibility states.</li>
        </ul>
      </div>
    </div>
  `,
  narration: [
    "Imagine the world as <b>hills and valleys</b>. Where you end up isn't random — you roll <i>downhill</i> into a comfy valley. Those valleys are the places you can <b>reach</b>.",
    "This is a huge idea in the book: a <b>valley</b> is a state you can settle into. Use the <b>arrow keys</b> (or drag) to nudge the glowing ball around.",
    "Add a <b>rule</b> (a <i>constraint</i>) and a new wall pops up — now some places are blocked off. Hit <b>next</b> to drop a wall and watch.",
    "Same ball, fewer places to go. That's what rules do: they <b>shrink</b> where you can reach. Real life is just a fancier version of this hill. 🏔️",
  ],
  build(ctx) {
    const { scene } = ctx;
    const SIZE = 26, SEG = 80;
    // height field: a couple of wells + ripples; constraints add gaussian bumps
    const wells = [
      { x: -6, z: -3, d: -6, s: 5 },
      { x: 6, z: 4, d: -7, s: 6 },
      { x: 0, z: 8, d: -4, s: 4 },
    ];
    const walls = [];
    const H = (x, z) => {
      let h = 0;
      for (const w of wells) h += w.d * Math.exp(-((x - w.x) ** 2 + (z - w.z) ** 2) / (2 * w.s * w.s));
      for (const w of walls) h += w.h * Math.exp(-((x - w.x) ** 2 + (z - w.z) ** 2) / (2 * w.s * w.s));
      h += 0.6 * Math.sin(x * 0.5) * Math.cos(z * 0.5);
      return h;
    };
    const grad = (x, z) => {
      const e = 0.15;
      return new THREE.Vector2((H(x + e, z) - H(x - e, z)) / (2 * e), (H(x, z + e) - H(x, z - e)) / (2 * e));
    };

    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const colAttr = new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3);
    geo.setAttribute("color", colAttr);
    const surfMat = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true, transparent: true, opacity: 0.6 });
    const surf = new THREE.Mesh(geo, surfMat);
    scene.add(surf);

    // glowing "reachable" point cloud sitting in the valleys
    const PN = 2600;
    const gp = new Float32Array(PN * 3);
    const gpHome = [];
    for (let i = 0; i < PN; i++) {
      const x = (Math.random() - 0.5) * SIZE, z = (Math.random() - 0.5) * SIZE;
      gpHome.push([x, z]);
      gp[i * 3] = x; gp[i * 3 + 1] = 0; gp[i * 3 + 2] = z;
    }
    const valleyCloud = makePoints(gp, { size: 0.28, color: PAL.cyan, opacity: 0.0 });
    scene.add(valleyCloud);

    // green glowing target ring at (6, 4) (deepest valley well)
    const targetX = 6, targetZ = 4;
    const targetRing = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 1.6, 32),
      new THREE.MeshBasicMaterial({ color: PAL.green, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
    );
    targetRing.rotateX(-Math.PI / 2);
    targetRing.position.set(targetX, H(targetX, targetZ) + 0.15, targetZ);
    scene.add(targetRing);

    const targetGlow = makeSpark(PAL.green, 2.5);
    targetGlow.position.set(targetX, H(targetX, targetZ) + 0.4, targetZ);
    scene.add(targetGlow);

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 24, 16),
      new THREE.MeshPhongMaterial({ color: PAL.spark, emissive: 0x5a3d00, shininess: 80 })
    );
    scene.add(ball);
    const ballGlow = makeSpark(PAL.spark, 3.2);
    scene.add(ballGlow);
    let bx = 0, bz = -8, vx = 0, vz = 0;

    function paintColors() {
      const pos = geo.attributes.position.array;
      const lo = -8, hi = 4;
      const cLow = new THREE.Color(PAL.violet), cMid = new THREE.Color(PAL.cyan), cHi = new THREE.Color(PAL.spark2);
      for (let i = 0; i < geo.attributes.position.count; i++) {
        const x = pos[i * 3], z = pos[i * 3 + 2];
        const h = H(x, z);
        pos[i * 3 + 1] = h;
        const t = clamp((h - lo) / (hi - lo), 0, 1);
        const c = t < 0.5 ? cLow.clone().lerp(cMid, t * 2) : cMid.clone().lerp(cHi, (t - 0.5) * 2);
        colAttr.array[i * 3] = c.r; colAttr.array[i * 3 + 1] = c.g; colAttr.array[i * 3 + 2] = c.b;
      }
      geo.attributes.position.needsUpdate = true;
      colAttr.needsUpdate = true;
      geo.computeVertexNormals();
    }
    paintColors();

    let wallsAdded = 0;
    function addWall() {
      walls.push({ x: -1, z: 1, h: 9, s: 2.4 });
      walls.push({ x: 3, z: -4, h: 8, s: 2.2 });
      wallsAdded++;
      paintColors();
      // reposition target ring height since H changes
      targetRing.position.y = H(targetX, targetZ) + 0.15;
      targetGlow.position.y = H(targetX, targetZ) + 0.4;
      ctx.pop(300);
      for (const w of walls) ctx.blip(220, 0.12, "square", 0.03);
    }

    return {
      onStep(i) {
        if (i === 1) ctx.setHint("Arrow keys / drag to roll the ball");
        if (i === 2) ctx.setHint("Hit next ▶ to drop a wall!");
        if (i === 3 && wallsAdded === 0) { addWall(); ctx.setHint(""); }
      },
      update(dt, t) {
        // settle the valley cloud onto the surface, glowing brighter in low spots
        const gpa = valleyCloud.geometry.attributes.position.array;
        valleyCloud.material.opacity = lerp(valleyCloud.material.opacity, 0.5, 0.05);
        for (let i = 0; i < PN; i++) {
          const [x, z] = gpHome[i];
          gpa[i * 3 + 1] = H(x, z) + 0.15;
        }
        valleyCloud.geometry.attributes.position.needsUpdate = true;

        targetGlow.material.opacity = 0.5 + 0.3 * Math.sin(t * 5);

        // input forces
        const k = ctx.input.keys;
        const F = 26;
        if (k.has("ArrowLeft") || k.has("a")) vx -= F * dt;
        if (k.has("ArrowRight") || k.has("d")) vx += F * dt;
        if (k.has("ArrowUp") || k.has("w")) vz -= F * dt;
        if (k.has("ArrowDown") || k.has("s")) vz += F * dt;
        // drag to push toward pointer (on the ground plane)
        if (ctx.input.down) {
          // pull the ball toward wherever the pointer is on the terrain
          const hit = ctx.hit([surf], false);
          if (hit) { vx += (hit.point.x - bx) * dt * 8; vz += (hit.point.z - bz) * dt * 8; }
        }
        // roll downhill
        const g = grad(bx, bz);
        vx += -g.x * 40 * dt;
        vz += -g.y * 40 * dt;
        vx *= 0.92; vz *= 0.92;
        bx = clamp(bx + vx * dt, -SIZE / 2 + 1, SIZE / 2 - 1);
        bz = clamp(bz + vz * dt, -SIZE / 2 + 1, SIZE / 2 - 1);
        const by = H(bx, bz) + 0.7;
        ball.position.set(bx, by, bz);
        ballGlow.position.set(bx, by, bz);
        ballGlow.material.opacity = 0.7 + 0.3 * Math.sin(t * 4);

        const dist = Math.hypot(bx - targetX, bz - targetZ);
        if (dist < 1.3) {
          ctx.updateGoal(1, 1);
        } else {
          ctx.updateGoal(0, 1);
        }
      },
      dispose() {
        scene.remove(targetRing);
        targetRing.geometry.dispose();
        targetRing.material.dispose();
        scene.remove(targetGlow);
        targetGlow.material.dispose();
      },
    };
  },
};

/* ============================================================= *
 *  CH 6 — RSVP Fields (Φ potential, v flow, S entropy)
 * ============================================================= */
const ch6 = {
  title: "The flowing field that builds everything",
  tag: "Chapter 6 · RSVP Fields",
  camera: { pos: [0, 0, 30], target: [0, 0, 0], spin: 0.05 },
  orbit: false,
  goalTitle: "Stir the ocean to charge the fields",
  goalMax: 100,
  monographHtml: `
    <div class="mono-sec">
      <h4>Chapter 18: RSVP Fields</h4>
      <p>The universe is modeled as a plenum of coupled density, flow, and accessibility fields. Flow relaxes toward regions of higher options.</p>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 18.1: Core Fields (Φ, v, S)</div>
        <ul style="margin-left: 1.2rem; margin-top: 0.4rem;">
          <li>Density field <span class="mono-inline-eq">Φ</span>: local concentration of organized structure.</li>
          <li>Flow field <span class="mono-inline-eq">v</span>: directed transport of density.</li>
          <li>Accessibility entropy <span class="mono-inline-eq">S</span>: log volume of local future options.</li>
        </ul>
      </div>

      <div class="mono-box theorem">
        <div class="mono-box-title theo">RSVP Field Equations</div>
        The dynamics are governed by coupled PDEs:
        <div class="mono-eq">
          ∂Φ/∂t = -∇·(Φv) + λ∇·(Φ∇S) + Q_Φ <br>
          ∂v/∂t + (v·∇)v = -∇P + ν∇²v + γ∇S <br>
          ∂S/∂t = D_S∇²S + R(Φ, v, S)
        </div>
        The term <span class="mono-inline-eq">γ∇S</span> drives flow toward higher accessibility (RSVP gravity).
      </div>
    </div>
  `,
  narration: [
    "The book's secret engine is called <b>RSVP</b>. Picture an ocean made of three things working together…",
    "A <b>height</b> map (where things want to flow), an <b>arrow</b> map (which way they flow), and a <b>sparkle</b> map (how wild and free things are). Watch them swirl!",
    "Tap anywhere to <b>stir</b> the field — you're adding energy, making it sparkle and swirl more.",
    "Calm fields settle into neat patterns. Wild fields explode with sparkle. The whole universe, the book says, is one big field like this. 🌊",
  ],
  build(ctx) {
    const { scene } = ctx;
    const N = 6000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const home = [];
    const R = 16;
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 2 * R, y = (Math.random() - 0.5) * 2 * R;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = (Math.random() - 0.5) * 2;
      home.push([x, y]);
    }
    const field = makePoints(pos, { size: 0.4, colors: col, opacity: 0.85 });
    scene.add(field);
    const attr = field.geometry.attributes.position;
    const stirs = []; // {x,y,t}
    let entropy = 0.5;
    let lastDragStir = 0;

    const cLow = new THREE.Color(PAL.violet);
    const cMid = new THREE.Color(PAL.cyan);
    const cHi = new THREE.Color(PAL.spark);

    return {
      onStep(i) {
        if (i === 2) ctx.setHint("Stir / drag the field to charge!");
        if (i === 3) ctx.setHint("");
      },
      update(dt, t) {
        if (ctx.input.justDown) {
          const p = ctx.planePoint(0);
          stirs.push({ x: p.x, y: p.y, t: 0 });
          entropy = Math.min(1.45, entropy + 0.35);
          ctx.blip(440 + Math.random() * 200, 0.15, "sine", 0.04);
        } else if (ctx.input.down) {
          entropy = Math.min(1.45, entropy + dt * 0.85);
          const now = performance.now();
          if (now - lastDragStir > 120) {
            const p = ctx.planePoint(0);
            stirs.push({ x: p.x, y: p.y, t: 0 });
            lastDragStir = now;
            ctx.blip(350 + Math.random() * 150, 0.08, "sine", 0.02);
          }
        }
        for (const s of stirs) s.t += dt;
        while (stirs.length && stirs[0].t > 3) stirs.shift();
        entropy = lerp(entropy, 0.5, dt * 0.35);

        const energy = Math.min(100, Math.max(0, Math.round(((entropy - 0.5) / 0.7) * 100)));
        ctx.updateGoal(energy, 100);

        const a = attr.array;
        for (let i = 0; i < N; i++) {
          let x = a[i * 3], y = a[i * 3 + 1];
          // base flow: gradient of a moving potential Φ -> swirl
          const phi = Math.sin(x * 0.25 + t * 0.4) + Math.cos(y * 0.25 - t * 0.3);
          let vx = Math.cos(y * 0.3 + t * 0.5) * 1.2;
          let vy = -Math.sin(x * 0.3 - t * 0.4) * 1.2;
          // stirs push outward like ripples
          for (const s of stirs) {
            const dx = x - s.x, dy = y - s.y;
            const d = Math.hypot(dx, dy) + 0.001;
            const ring = Math.exp(-((d - s.t * 6) ** 2) / 6) * 8 / d;
            vx += dx / d * ring; vy += dy / d * ring;
          }
          // entropy = random sparkle motion
          vx += (Math.random() - 0.5) * entropy * 3;
          vy += (Math.random() - 0.5) * entropy * 3;
          x += vx * dt; y += vy * dt;
          // gentle pull home so it never blows up
          const [hx, hy] = home[i];
          x += (hx - x) * 0.012; y += (hy - y) * 0.012;
          a[i * 3] = x; a[i * 3 + 1] = y;
          a[i * 3 + 2] = Math.sin(phi + t) * 1.5;
          // color by potential
          const tt = clamp((phi + 2) / 4, 0, 1);
          const c = tt < 0.5 ? cLow.clone().lerp(cMid, tt * 2) : cMid.clone().lerp(cHi, (tt - 0.5) * 2);
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        attr.needsUpdate = true;
        field.geometry.attributes.color.needsUpdate = true;
        field.material.size = lerp(field.material.size, 0.4 + entropy * 0.25, 0.1);
      },
      dispose() {},
    };
  },
};

/* ============================================================= *
 *  CH 7 — The Universe Settling Down (cosmic relaxation)
 * ============================================================= */
const ch7 = {
  title: "How a whole universe calms down",
  tag: "Chapter 7 · Cosmology",
  camera: { pos: [0, 6, 60], target: [0, 0, 0], spin: 0.08 },
  goalTitle: "Shake the universe (click) twice",
  goalMax: 100,
  monographHtml: `
    <div class="mono-sec">
      <h4>Part V: Cosmology &amp; Relaxation</h4>
      <p>Large-scale cosmic structures form as a coupled field relaxes from high-tension unstable equilibria.</p>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 18.3: Lamphron and Lamphrodyne</div>
        <ul style="margin-left: 1.2rem; margin-top: 0.4rem;">
          <li><b>Lamphron (λ+)</b>: local maximum of <i>S</i>. Accessibility source; density flows outward.</li>
          <li><b>Lamphrodyne (λ-)</b>: local minimum of <i>S</i>. Accessibility sink; density converges and condenses. Galaxies are lamphrodyne wells.</li>
        </ul>
      </div>

      <div class="mono-box theorem">
        <div class="mono-box-title theo">Technical Note: Friedmann Saddle Point</div>
        The early universe sits near an unstable saddle point at coordinates <span class="mono-inline-eq">(S_m, v_m) = (4/3, 2/3)</span> in RSVP parameter space.
        <br><br>
        The closure depth is exactly <b>d = 2</b>:
        <ul style="margin-left: 1.2rem; margin-top: 0.4rem;">
          <li><b>Level 1 (λ₁ = -1)</b>: Simple self-similar inflation.</li>
          <li><b>Level 2 (λ₂ = -1/3)</b>: Symmetry breaking mode. Cracks perfect uniformity and seeds the cosmic web.</li>
        </ul>
      </div>
    </div>
  `,
  narration: [
    "Zoom WAY out. The book says the early universe was hot, messy, and crowded — bursting with possibilities.",
    "Then it does the same thing your bubbles did: it <b>settles</b>. Bits drift together, the mess relaxes, and <i>structure</i> appears.",
    "Tap to give it a little <b>shake</b> — then watch it find its calm shape again, just like the field and the rolling ball.",
    "Galaxies, threads, and giant empty voids — all of it is the universe <b>collapsing</b> into the lowest-energy, comfiest pattern it can reach. ✨",
  ],
  build(ctx) {
    const { scene } = ctx;
    const N = 9000;
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const R = 34;
    for (let i = 0; i < N; i++) {
      const r = R * Math.cbrt(Math.random());
      const th = Math.acos(2 * Math.random() - 1), ph = Math.random() * Math.PI * 2;
      pos[i * 3] = r * Math.sin(th) * Math.cos(ph);
      pos[i * 3 + 1] = r * Math.sin(th) * Math.sin(ph) * 0.7;
      pos[i * 3 + 2] = r * Math.cos(th);
    }
    // cosmic-web seed attractors
    const rnd = mulberry32(42);
    const seeds = [];
    for (let i = 0; i < 26; i++) {
      seeds.push(new THREE.Vector3((rnd() - 0.5) * 2 * R, (rnd() - 0.5) * 1.4 * R, (rnd() - 0.5) * 2 * R));
    }
    const web = makePoints(pos, { size: 0.5, colors: col, opacity: 0.85 });
    scene.add(web);
    const attr = web.geometry.attributes.position;

    const cHot = new THREE.Color(PAL.spark2);
    const cCool = new THREE.Color(PAL.cyan);
    let temp = 1.0;
    let shakeCount = 0;

    return {
      onStep(i) {
        if (i === 2) ctx.setHint("Tap to shake the universe!");
        if (i === 3) ctx.setHint("");
      },
      update(dt, t) {
        if (ctx.input.justDown) {
          temp = Math.min(1.0, temp + 0.6);
          ctx.blip(160, 0.3, "sawtooth", 0.04);
          shakeCount++;
        }
        temp = lerp(temp, 0.04, dt * 0.7);

        // Update goal progress based on shakes and settling temp
        if (shakeCount < 2) {
          ctx.updateGoal(shakeCount * 30, 100, "Shake the universe (click) twice");
        } else {
          let progress = 60;
          if (temp <= 0.09) {
            progress = 100;
          } else {
            const t = clamp((1.0 - temp) / 0.91, 0, 1);
            progress = 60 + Math.floor(t * 39);
          }
          ctx.updateGoal(progress, 100, "Wait for the cosmic web to settle");
        }

        const a = attr.array;
        for (let i = 0; i < N; i++) {
          const px = a[i * 3], py = a[i * 3 + 1], pz = a[i * 3 + 2];
          // find nearest seed (cheap: check a rotating subset for speed)
          let best = null, bd = 1e9;
          for (let s = 0; s < seeds.length; s++) {
            const dx = seeds[s].x - px, dy = seeds[s].y - py, dz = seeds[s].z - pz;
            const d = dx * dx + dy * dy + dz * dz;
            if (d < bd) { bd = d; best = seeds[s]; }
          }
          // accelerate toward nearest seed (gravity-ish), plus heat jitter
          const pull = 1.4;
          vel[i * 3] += (best.x - px) * pull * dt + (Math.random() - 0.5) * temp * 14 * dt;
          vel[i * 3 + 1] += (best.y - py) * pull * dt + (Math.random() - 0.5) * temp * 14 * dt;
          vel[i * 3 + 2] += (best.z - pz) * pull * dt + (Math.random() - 0.5) * temp * 14 * dt;
          vel[i * 3] *= 0.9; vel[i * 3 + 1] *= 0.9; vel[i * 3 + 2] *= 0.9;
          a[i * 3] += vel[i * 3] * dt; a[i * 3 + 1] += vel[i * 3 + 1] * dt; a[i * 3 + 2] += vel[i * 3 + 2] * dt;
          // color: hot when fast, cool when settled
          const sp = clamp((Math.abs(vel[i * 3]) + Math.abs(vel[i * 3 + 1]) + Math.abs(vel[i * 3 + 2])) * 0.15, 0, 1);
          const c = cCool.clone().lerp(cHot, sp);
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        attr.needsUpdate = true;
        web.geometry.attributes.color.needsUpdate = true;
        web.rotation.y += 0.02 * dt;
      },
      dispose() {},
    };
  },
};

/* ============================================================= *
 *  CH 8 — Finale (five views, one idea)
 * ============================================================= */
const ch8 = {
  title: "Five windows, one big idea",
  tag: "Chapter 8 · You Made It!",
  camera: { pos: [0, 0, 28], target: [0, 0, 0], spin: 0.18 },
  goalTitle: "Inspect all 5 semantic projections",
  goalMax: 5,
  monographHtml: `
    <div class="mono-sec">
      <h4>Preface: The Monograph Thesis</h4>
      <p>Arithmetic, gesture, language, cognition, computation, and cosmology are different projections of the same underlying possibility-reachability geometry.</p>

      <div class="mono-box theorem">
        <div class="mono-box-title theo">Five Projections of One Theory</div>
        The five core frameworks developed across this monograph converge on the same organizing principle:
        <ol style="margin-left: 1.2rem; margin-top: 0.6rem; line-height: 1.7;">
          <li><b>Spherepop</b> (collapse of nested containment)</li>
          <li><b>Gesture</b> (meaning carried in continuous trajectories)</li>
          <li><b>Admissibility</b> (bounds defined by constraints)</li>
          <li><b>RSVP Fields</b> (flow gradients of accessibility)</li>
          <li><b>Semantic Infrastructure</b> (composition of structures)</li>
        </ol>
      </div>
    </div>
  `,
  narration: [
    "You explored five windows: <b>popping</b> bubbles, <b>wiggles</b> into letters, <b>rolling</b> into valleys, the <b>flowing</b> field, and the calming <b>universe</b>.",
    "Here's the secret: they're all the <i>same</i> idea wearing different costumes. Tap each glowing orb to remember what it taught you.",
    "The one idea? Everything is about <b>what you can reach from here</b> — and how things <b>settle</b> into the comfiest shape they can find.",
    "That's <b>Semantic Infrastructure</b>. You just learned a whole book by playing. Go look at the world — it's all bubbles, paths, and valleys now. 🌟",
  ],
  build(ctx) {
    const { scene } = ctx;
    const center = makeSpark(PAL.spark, 4.5);
    scene.add(center);

    const items = [
      { name: "Collapse", note: "popping the innermost bubble", color: PAL.spark2 },
      { name: "Gesture", note: "a wiggle becomes a symbol", color: PAL.cyan },
      { name: "Constraint", note: "rules shrink where you can go", color: PAL.green },
      { name: "Accessibility", note: "rolling into reachable valleys", color: PAL.violet },
      { name: "Composition", note: "small ideas build big ones", color: PAL.spark },
    ];
    const orbs = [];
    const lineGeo = new THREE.BufferGeometry();
    const linePos = new Float32Array(items.length * 2 * 3);
    lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
      color: PAL.cyan, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending,
    }));
    scene.add(lines);

    items.forEach((it, i) => {
      const ang = (i / items.length) * Math.PI * 2;
      const g = new THREE.Group();
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(1.3, 32, 24),
        new THREE.MeshPhongMaterial({ color: it.color, emissive: new THREE.Color(it.color).multiplyScalar(0.25), shininess: 90, transparent: true, opacity: 0.9 })
      );
      g.add(orb);
      const glow = makeSpark(it.color, 4);
      g.add(glow);
      const label = makeTextSprite(it.name, { color: "#fff", size: 48, glow: "rgba(255,255,255,0.5)" });
      label.position.set(0, 2.2, 0);
      label.scale.multiplyScalar(1.3);
      g.add(label);
      scene.add(g);
      orbs.push({ g, orb, ang, it, label });
    });

    let chosen = -1;
    const bursts = [];
    // opening celebration
    for (let i = 0; i < 4; i++)
      bursts.push(new Burst(scene, new THREE.Vector3(0, 0, 0), { color: [PAL.spark, PAL.spark2, PAL.cyan, PAL.violet][i], count: 100, speed: 16, life: 1.4 }));

    const clickedOrbs = new Set();
    return {
      onStep(i) {
        if (i === 1) ctx.setHint("Tap the glowing orbs!");
        if (i >= 2) ctx.setHint("");
        ctx.ready();
      },
      update(dt, t) {
        for (let i = bursts.length - 1; i >= 0; i--) { bursts[i].update(dt); if (bursts[i].dead) bursts.splice(i, 1); }
        center.material.opacity = 0.8 + 0.2 * Math.sin(t * 3);
        const Rr = 9;
        orbs.forEach((o, i) => {
          const a = o.ang + t * 0.25;
          const x = Math.cos(a) * Rr, y = Math.sin(a) * Rr * 0.6, z = Math.sin(a * 1.3) * 3;
          o.g.position.set(x, y, z);
          const s = i === chosen ? 1.5 : 1;
          o.orb.scale.lerp(new THREE.Vector3(s, s, s), 0.1);
          linePos[i * 6 + 0] = 0; linePos[i * 6 + 1] = 0; linePos[i * 6 + 2] = 0;
          linePos[i * 6 + 3] = x; linePos[i * 6 + 4] = y; linePos[i * 6 + 5] = z;
        });
        lineGeo.attributes.position.needsUpdate = true;

        if (ctx.input.justDown) {
          const hit = ctx.hit(orbs.map((o) => o.orb), false);
          if (hit) {
            const idx = orbs.findIndex((o) => o.orb === hit.object);
            chosen = idx;
            const it = orbs[idx].it;
            ctx.setHint(`${it.name}: ${it.note}`);
            ctx.pop(500 + idx * 80);
            bursts.push(new Burst(scene, orbs[idx].g.position.clone(), { color: it.color, count: 60, speed: 9 }));
            
            clickedOrbs.add(idx);
            ctx.updateGoal(clickedOrbs.size);
          }
        }
      },
      dispose() { bursts.forEach((b) => b.kill()); },
    };
  },
};
const ch9 = {
  title: "When three true stories can't all be true at once",
  goalTitle: "Attempt to glue the stories together",
  goalMax: 1,
  monographHtml: `
    <div class="mono-sec">
      <h4>Chapter 17: Sheaf Theory and Semantic Coherence</h4>
      <p>Knowledge integration corresponds to finding global sections of a knowledge sheaf over a base space of contexts.</p>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 17.2: Knowledge Sheaf</div>
        A <b>knowledge sheaf</b> is a sheaf <i>F</i> over a base space <i>B</i> of contexts, where <i>F(U)</i> is the set of knowledge structures consistent with context <i>U</i>.
      </div>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 17.3: The Gluing Condition</div>
        A sheaf gluing condition establishes that locally consistent sections on a cover <i>{Uᵢ}</i> of <i>U</i> determine a unique global section <i>s ∈ F(U)</i>.
      </div>

      <div class="mono-box theorem">
        <div class="mono-box-title theo">Theorem 17.1: Cohomological Obstruction</div>
        Contradictions and inconsistencies are failures of gluing, characterized by non-trivial Čech cohomology groups:
        <div class="mono-eq">H¹(B, F) ≠ 0</div>
        An AI model hallucination represents a local section that is locally coherent but globally obstructed.
      </div>
    </div>
  `,
  tag: "Chapter 9 · Sheaf Theory",
  camera: { pos: [0, 0, 28], target: [0, 0, 0], spin: 0.06 },
  narration: [
    "Imagine three people each know <b>one part</b> of a story. Each part sounds totally fine on its own…",
    "But when you try to stick them together, something <b>doesn't add up</b>. Tap each card to read it.",
    "Try to <b>glue</b> the cards together by tapping the center spark — some pairs fit, some <b>crash</b>!",
    "This is how AI <b>hallucinations</b> happen: three sentences each look ok, but they can't all be true. A smart system finds the crash <i>before</i> telling you the story. ✨",
  ],
  build(ctx) {
    const { scene } = ctx;
    const bursts = [];

    // Three story fragments — two compatible, one contradicts the others
    const cards = [
      { text: "Born in\n1980", color: PAL.cyan,   pos: [-9,  4, 0], compatible: [1], incompatible: [2] },
      { text: "Age 25\nat first\nmedal",  color: PAL.green,  pos: [ 9,  4, 0], compatible: [0], incompatible: [2] },
      { text: "Won gold\nat 1992\nOlympics", color: PAL.spark2, pos: [ 0, -6, 0], compatible: [], incompatible: [0,1] },
    ];

    const cardMeshes = [];
    cards.forEach((cd, i) => {
      const g = new THREE.Group();
      g.position.set(...cd.pos);

      // backing disc
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(3.4, 48),
        new THREE.MeshBasicMaterial({ color: cd.color, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
      );
      g.add(disc);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(3.3, 3.55, 64),
        new THREE.MeshBasicMaterial({ color: cd.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      );
      g.add(ring);

      // multi-line label via stacked sprites
      const lines = cd.text.split('\n');
      lines.forEach((ln, li) => {
        const spr = makeTextSprite(ln, { color: '#fff', size: 52, glow: `rgba(255,255,255,0.4)` });
        spr.scale.multiplyScalar(1.1);
        spr.position.set(0, 0.9 - li * 1.1, 0.3);
        g.add(spr);
      });

      scene.add(g);
      cardMeshes.push({ g, disc, ring, cd, lit: false, state: 'idle' }); // state: idle|lit|ok|bad
    });

    // connecting lines between cards
    const lineGeo = new THREE.BufferGeometry();
    const lp = new Float32Array(cards.length * 2 * 3);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
      color: PAL.cyan, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending,
    }));
    scene.add(lines);

    // center glue spark
    const centerSpark = makeSpark(PAL.spark, 3.8);
    centerSpark.visible = false;
    scene.add(centerSpark);
    const centerRing = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 2.1, 64),
      new THREE.MeshBasicMaterial({ color: PAL.spark, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    scene.add(centerRing);

    let glueAttempted = false;
    let glueFlash = 0;

    return {
      onStep(i) {
        if (i === 1) ctx.setHint('Tap each card to read it');
        if (i === 2) {
          centerSpark.visible = true;
          centerRing.material.opacity = 0.5;
          ctx.setHint('Tap the center spark to try to glue the stories!');
        }
        if (i === 3) ctx.setHint('');
      },
      update(dt, t) {
        for (let i = bursts.length - 1; i >= 0; i--) { bursts[i].update(dt); if (bursts[i].dead) bursts.splice(i, 1); }

        // pulse center spark
        if (centerSpark.visible) {
          centerSpark.material.opacity = 0.7 + 0.3 * Math.sin(t * 4);
          centerRing.material.opacity = 0.35 + 0.2 * Math.sin(t * 3 + 1);
          centerRing.rotation.z += dt * 0.8;
        }

        // animate card rings
        cardMeshes.forEach((cm, i) => {
          const pulse = 0.4 + 0.25 * Math.sin(t * 2.5 + i * 1.2);
          cm.ring.material.opacity = cm.lit ? 0.85 : pulse;
          cm.disc.material.opacity = cm.lit ? 0.22 : 0.08;
          if (cm.state === 'bad') {
            cm.ring.material.color.setHex(0xff3344);
          } else if (cm.state === 'ok') {
            cm.ring.material.color.setHex(0x7dffb0);
          } else {
            cm.ring.material.color.setHex(cm.cd.color);
          }
        });

        // update connecting line positions
        cards.forEach((cd, i) => {
          lp[i * 6]     = cd.pos[0]; lp[i * 6 + 1] = cd.pos[1]; lp[i * 6 + 2] = cd.pos[2];
          lp[i * 6 + 3] = 0;         lp[i * 6 + 4] = 0;         lp[i * 6 + 5] = 0;
        });
        lineGeo.attributes.position.needsUpdate = true;

        if (ctx.input.justDown) {
          // check center spark
          ctx.input.raycaster.setFromCamera(ctx.input.pointer, ctx.camera);
          const cDist = ctx.input.raycaster.ray.distanceToPoint(centerSpark.position);
          if (centerSpark.visible && cDist < 3.0) {
            glueAttempted = true;
            ctx.pop(400);
            ctx.completeGoal();
            // mark states
            cardMeshes.forEach((cm) => {
              if (cm.cd.incompatible.length > 0) {
                cm.state = 'bad';
                bursts.push(new Burst(scene, cm.g.position.clone(), { color: 0xff3344, count: 60, speed: 10, life: 0.9 }));
                ctx.blip(200, 0.2, 'sawtooth', 0.05);
              } else {
                cm.state = 'ok';
              }
            });
            ctx.setHint('Card 3 clashes with cards 1 & 2 — the stories can\'t all be true!');
            ctx.ready();
            return;
          }

          // check individual cards
          const hits = ctx.hit(cardMeshes.map(cm => cm.disc), false);
          if (hits) {
            const cm = cardMeshes.find(c => c.disc === hits.object);
            if (cm) {
              cm.lit = !cm.lit;
              ctx.pop(450 + cardMeshes.indexOf(cm) * 60);
            }
          }
        }
      },
      dispose() { bursts.forEach(b => b.kill()); },
    };
  },
};

/* ============================================================= *
 *  CH 10 — Boolean Landscape / Hypercube
 *  (logic as geometry, Ch.29)
 * ============================================================= */
const ch10 = {
  title: "Logic is just walking a glowing cube",
  goalTitle: "Toggle 3 corners ON/OFF",
  goalMax: 3,
  monographHtml: `
    <div class="mono-sec">
      <h4>Chapter 29: Boolean Lattices and Logic Geometry</h4>
      <p>Logic connectives are not isolated algebraic symbols; they correspond to coordinates and subdivisions of a truth-value hypercube.</p>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 29.1: Surjective Hypercube</div>
        Let <i>Qₙ = {0, 1}ⁿ</i>. A surjective hypercube is a pair <i>(Qₙ, π)</i> where <i>π : Qₙ ➔ Y</i> is surjective.
      </div>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 29.2: Hypercube Splitting</div>
        A splitting function is <i>σ : Qₙ ➔ {0, 1}</i>, partitioning the hypercube into:
        <div class="mono-eq">Q⁺ₙ = σ⁻¹(1) &nbsp; and &nbsp; Q⁻ₙ = σ⁻¹(0)</div>
      </div>

      <div class="mono-box theorem">
        <div class="mono-box-title theo">Logic-as-Geometry Principle</div>
        Every finite Boolean algebra admits a geometric realization as a hypercube lattice. Operators like AND, OR, NAND, and XOR are vertices of a hypercube ordered by truth content.
      </div>
    </div>
  `,
  tag: "Chapter 10 · Logic Cube",
  camera: { pos: [0, 4, 28], target: [0, 0, 0], spin: 0.14 },
  narration: [
    "Logic sounds scary, but it's secretly just a <b>cube</b>. Each corner is a combo of three switches: A, B, and C — each either <b>ON</b> (1) or <b>OFF</b> (0).",
    "Tap any glowing corner to <b>toggle</b> it. The lit corners are the ones where your switches are ON.",
    "Now try <b>AND</b>: both A <i>and</i> B must be on. Hit next and see which corners survive. Then try <b>OR</b>: at least one is on.",
    "Every logic rule is just a different way of <b>lighting up</b> some corners and leaving others dark. All of logic lives in this cube. 🎲",
  ],
  build(ctx) {
    const { scene } = ctx;
    const toggledCorners = new Set();

    // 3-bit hypercube: 8 corners
    const corners = [];
    const state = new Uint8Array(8); // which corners are ON

    // vertex positions of a cube
    const verts = [];
    for (let i = 0; i < 8; i++) {
      verts.push(new THREE.Vector3(
        (i & 1) ? 5 : -5,
        (i & 2) ? 5 : -5,
        (i & 4) ? 5 : -5
      ));
    }

    // edges: pairs of vertices differing by exactly 1 bit
    const edgePairs = [];
    for (let a = 0; a < 8; a++)
      for (let b = a + 1; b < 8; b++)
        if (((a ^ b) & (a ^ b) - 1) === 0 && (a ^ b) !== 0 && (a ^ b & (a^b-1)) === 0) // popcount == 1
          edgePairs.push([a, b]);

    // draw edges
    const edgePos = new Float32Array(edgePairs.length * 2 * 3);
    edgePairs.forEach(([a, b], i) => {
      edgePos[i*6]   = verts[a].x; edgePos[i*6+1] = verts[a].y; edgePos[i*6+2] = verts[a].z;
      edgePos[i*6+3] = verts[b].x; edgePos[i*6+4] = verts[b].y; edgePos[i*6+5] = verts[b].z;
    });
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
    const edgeMat = new THREE.LineBasicMaterial({ color: PAL.violet, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending });
    scene.add(new THREE.LineSegments(edgeGeo, edgeMat));

    // corner spheres + labels
    const labels = ['000','001','010','011','100','101','110','111'];
    verts.forEach((v, i) => {
      const g = new THREE.Group();
      g.position.copy(v);

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 24, 16),
        new THREE.MeshPhongMaterial({ color: PAL.violet, emissive: 0x110022, shininess: 80, transparent: true, opacity: 0.7 })
      );
      g.add(sphere);
      const glow = makeSpark(PAL.violet, 3.0);
      glow.material.opacity = 0.0;
      g.add(glow);
      const lbl = makeTextSprite(labels[i], { color: '#aaa8ff', size: 36 });
      lbl.position.set(0, 1.4, 0);
      lbl.scale.multiplyScalar(1.0);
      g.add(lbl);

      scene.add(g);
      corners.push({ g, sphere, glow, idx: i });
    });

    const bursts = [];
    let mode = 'free'; // free | and | or

    const applyMode = () => {
      corners.forEach((c, i) => {
        const A = (i & 1) !== 0, B = (i & 2) !== 0, C = (i & 4) !== 0;
        let on = state[i] !== 0;
        if (mode === 'and') on = A && B;
        if (mode === 'or')  on = A || B;
        state[i] = on ? 1 : 0;
      });
    };

    return {
      onStep(step) {
        if (step === 1) ctx.setHint('Tap the cube corners to toggle them ON/OFF');
        if (step === 2) {
          mode = 'and'; applyMode();
          ctx.setHint('AND: only corners where A=1 AND B=1 glow');
          ctx.blip(660, 0.1, 'sine', 0.04);
          ctx.updateGoal(3, 3);
        }
        if (step === 3) {
          mode = 'or'; applyMode();
          ctx.setHint('OR: corners where A=1 OR B=1 glow');
          ctx.blip(780, 0.1, 'sine', 0.04);
          ctx.updateGoal(3, 3);
        }
        ctx.ready();
      },
      update(dt, t) {
        for (let i = bursts.length - 1; i >= 0; i--) { bursts[i].update(dt); if (bursts[i].dead) bursts.splice(i, 1); }

        corners.forEach((c, i) => {
          const on = state[i] !== 0;
          const targetOp = on ? 0.95 : 0.35;
          c.sphere.material.opacity += (targetOp - c.sphere.material.opacity) * 0.12;
          const col = on ? new THREE.Color(PAL.spark) : new THREE.Color(PAL.violet);
          c.sphere.material.color.lerp(col, 0.1);
          c.sphere.material.emissive.lerp(on ? new THREE.Color(PAL.spark).multiplyScalar(0.3) : new THREE.Color(0x110022), 0.1);
          c.glow.material.opacity += ((on ? 0.6 : 0) - c.glow.material.opacity) * 0.1;
          c.glow.material.color.lerp(col, 0.1);
          const sc = on ? 1.25 : 1.0;
          c.sphere.scale.lerp(new THREE.Vector3(sc,sc,sc), 0.1);
        });

        if (ctx.input.justDown && mode === 'free') {
          const spheres = corners.map(c => c.sphere);
          const hit = ctx.hit(spheres, false);
          if (hit) {
            const ci = corners.findIndex(c => c.sphere === hit.object);
            state[ci] ^= 1;
            ctx.pop(480 + ci * 40);
            toggledCorners.add(ci);
            ctx.updateGoal(toggledCorners.size, 3);
            if (state[ci]) bursts.push(new Burst(scene, corners[ci].g.position.clone(), { color: PAL.spark, count: 40, speed: 7, life: 0.7 }));
          }
        }
      },
      dispose() { bursts.forEach(b => b.kill()); },
    };
  },
};

/* ============================================================= *
 *  CH 11 — CLIO: Constraint Pruning
 *  (constraint-leveraged inference, Ch.15)
 * ============================================================= */
const ch11 = {
  title: "Rules make hard problems easy",
  goalTitle: "Apply 3 constraints to search space",
  goalMax: 3,
  monographHtml: `
    <div class="mono-sec">
      <h4>Chapter 15: Constraint-Leveraged Inference Optimization</h4>
      <p>Constraints accelerate computation rather than impeding it. CLIO leverages constraint structure to make inference tractable over large state spaces.</p>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 15.2: Sparse Projection</div>
        CLIO implements constraint-leveraged inference by projecting queries into a sparse space:
        <div class="mono-eq">π_sparse : X ➔ X_sparse</div>
        where coordinates ruled out by constraints are set to zero, leaving a sparse set of active options.
      </div>

      <div class="mono-box theorem">
        <div class="mono-box-title theo">Theorem 15.1: CLIO Complexity Bound</div>
        Let <i>X</i> be a state space and let <i>ε</i> be the sparsity ratio of physically admissible states. The search complexity reduces from <i>O(|X|)</i> to:
        <div class="mono-eq">O(ε |X|)</div>
        For real-world domains like protein folding or natural language, <i>ε</i> is vanishingly small, enabling rapid solution search.
      </div>
    </div>
  `,
  tag: "Chapter 11 · CLIO",
  camera: { pos: [0, 0, 32], target: [0, 0, 0], spin: 0.05 },
  narration: [
    "Imagine trying to find one <b>right answer</b> hidden in a cloud of thousands. Searching them all would take forever…",
    "But add a <b>rule</b> — a constraint — and huge chunks of the cloud <i>vanish</i>. Tap the glowing buttons to add rules!",
    "Each rule wipes out more wrong answers until only the <b>possible</b> ones are left. This is what computers actually do to solve hard puzzles.",
    "The book calls this <b>CLIO</b>: Constraint-Leveraged Inference. Rules don't slow you down — they make you <i>zoom</i>. ⚡",
  ],
  build(ctx) {
    const { scene } = ctx;
    const N = 3200;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const alive = new Uint8Array(N).fill(1);
    const homeX = new Float32Array(N);
    const homeY = new Float32Array(N);
    const velX  = new Float32Array(N);
    const velY  = new Float32Array(N);
    const rnd = mulberry32(77);
    const R = 14;

    for (let i = 0; i < N; i++) {
      const r = R * Math.sqrt(rnd()), ang = rnd() * Math.PI * 2;
      homeX[i] = r * Math.cos(ang);
      homeY[i] = r * Math.sin(ang);
      pos[i*3] = homeX[i]; pos[i*3+1] = homeY[i]; pos[i*3+2] = (rnd()-0.5)*2;
      col[i*3] = 0.38; col[i*3+1] = 0.55; col[i*3+2] = 1.0;
    }

    const cloud = makePoints(pos, { size: 0.35, colors: col, opacity: 0.85 });
    scene.add(cloud);
    const attr  = cloud.geometry.attributes.position;
    const colAttr = cloud.geometry.attributes.color;

    // Constraint definitions — each kills points outside a region
    const constraints = [
      { label: 'Rule A\nLeft half only', color: PAL.cyan,   test: (x,y) => x < 0 },
      { label: 'Rule B\nTop half only',  color: PAL.green,  test: (x,y) => y > 0 },
      { label: 'Rule C\nInner circle',   color: PAL.spark2, test: (x,y) => x*x+y*y < 36 },
      { label: 'Rule D\nOuter ring',     color: PAL.spark,  test: (x,y) => x*x+y*y > 16 },
    ];
    let rulesApplied = 0;

    // Floating rule buttons as in-world sprites
    const btnMeshes = [];
    constraints.forEach((c, i) => {
      const ang = (i / constraints.length) * Math.PI * 2;
      const br = 18;
      const g = new THREE.Group();
      g.position.set(br * Math.cos(ang), br * Math.sin(ang), 0);

      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(2.8, 48),
        new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
      );
      g.add(disc);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.7, 3.0, 64),
        new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
      );
      g.add(ring);
      const lines = c.label.split('\n');
      lines.forEach((ln, li) => {
        const spr = makeTextSprite(ln, { color: '#fff', size: 40, glow: 'rgba(255,255,255,0.3)' });
        spr.scale.multiplyScalar(0.9);
        spr.position.set(0, 0.4 - li * 0.9, 0.2);
        g.add(spr);
      });

      scene.add(g);
      btnMeshes.push({ g, disc, ring, c, used: false });
    });

    // answer glow at origin
    const answer = makeSpark(PAL.spark, 5.0);
    answer.material.opacity = 0.0;
    scene.add(answer);

    const bursts = [];

    const applyConstraint = (ci) => {
      const c = constraints[ci];
      let killed = 0;
      for (let i = 0; i < N; i++) {
        if (!alive[i]) continue;
        if (!c.test(homeX[i], homeY[i])) {
          alive[i] = 0;
          killed++;
          velX[i] = (Math.random()-0.5) * 20;
          velY[i] = (Math.random()-0.5) * 20;
        }
      }
      rulesApplied++;
      ctx.updateGoal(rulesApplied, 3);
      const aliveCount = alive.reduce((s,v)=>s+v,0);
      if (aliveCount < 80) {
        answer.material.opacity = 1.0;
        ctx.setHint(`Only ${aliveCount} possibilities remain — the answer is almost found!`);
        ctx.ready();
        for (let i = 0; i < 3; i++)
          bursts.push(new Burst(scene, new THREE.Vector3(0,0,0), { color: [PAL.spark, PAL.cyan, PAL.green][i], count: 80, speed: 14, life: 1.2 }));
      }
      return killed;
    };

    return {
      onStep(step) {
        if (step === 1) ctx.setHint('Tap the glowing rule buttons to add constraints!');
        if (step === 2) ctx.setHint('Keep tapping — watch the cloud shrink!');
        if (step === 3) ctx.setHint('');
        if (step >= 1) ctx.ready();
      },
      update(dt, t) {
        for (let i = bursts.length - 1; i >= 0; i--) { bursts[i].update(dt); if (bursts[i].dead) bursts.splice(i, 1); }

        answer.material.opacity = lerp(answer.material.opacity, answer.material.opacity > 0.5 ? 0.6 + 0.4*Math.sin(t*4) : 0, 0.05);

        const a = attr.array;
        const ca = colAttr.array;
        const cAlive = new THREE.Color(PAL.cyan);
        const cDead  = new THREE.Color(0x110022);

        for (let i = 0; i < N; i++) {
          if (alive[i]) {
            a[i*3]   = lerp(a[i*3],   homeX[i], 0.04);
            a[i*3+1] = lerp(a[i*3+1], homeY[i], 0.04);
            ca[i*3] = cAlive.r; ca[i*3+1] = cAlive.g; ca[i*3+2] = cAlive.b;
          } else {
            velX[i] *= 0.88; velY[i] *= 0.88;
            a[i*3]   += velX[i] * dt;
            a[i*3+1] += velY[i] * dt;
            ca[i*3] = lerp(ca[i*3], cDead.r, 0.06);
            ca[i*3+1] = lerp(ca[i*3+1], cDead.g, 0.06);
            ca[i*3+2] = lerp(ca[i*3+2], cDead.b, 0.06);
          }
        }
        attr.needsUpdate = true;
        colAttr.needsUpdate = true;

        // pulse unused buttons
        btnMeshes.forEach((bm, i) => {
          const pulse = bm.used ? 0.2 : 0.5 + 0.3 * Math.sin(t*3 + i*1.1);
          bm.ring.material.opacity = pulse;
          bm.disc.material.opacity = bm.used ? 0.05 : 0.15;
        });

        if (ctx.input.justDown) {
          const discs = btnMeshes.map(b => b.disc);
          const hit = ctx.hit(discs, false);
          if (hit) {
            const bm = btnMeshes.find(b => b.disc === hit.object);
            if (bm && !bm.used) {
              bm.used = true;
              const ci = btnMeshes.indexOf(bm);
              const killed = applyConstraint(ci);
              ctx.pop(380 + ci * 50);
              bursts.push(new Burst(scene, bm.g.position.clone(), { color: bm.c.color, count: 50, speed: 8, life: 0.8 }));
              ctx.blip(300 + killed * 0.5, 0.15, 'square', 0.04);
            }
          }
        }
      },
      dispose() { bursts.forEach(b => b.kill()); },
    };
  },
};

/* ============================================================= *
 *  CH 12 — Yarncrawler / Semantic Infrastructure
 *  (living repair agents, Ch.28; semantic modules, Ch.26)
 * ============================================================= */
const ch12 = {
  title: "Tiny robots that keep the whole web alive",
  goalTitle: "Break a connection to trigger a repair",
  goalMax: 1,
  monographHtml: `
    <div class="mono-sec">
      <h4>Chapter 28: Yarncrawler Systems and Adaptive Maintenance</h4>
      <p>distributed, decentralized repair agents keep knowledge networks alive by continuously traverses connections to repair semantic degradation.</p>

      <div class="mono-box definition">
        <div class="mono-box-title def">Definition 28.1: Yarncrawler System</div>
        A Yarncrawler system is a pair <i>(R, I)</i> where <i>I</i> represents the infrastructure (modeled as a graph) and <i>R</i> is a set of autonomous repair agents:
        <div class="mono-eq">r ∈ R : sensor ➔ actor ➔ carrier</div>
        that coordinate via stigmergy (indirect communication through environmental modifications).
      </div>

      <div class="mono-box theorem">
        <div class="mono-box-title theo">The Yarncrawler Principle</div>
        Any complex system maintaining coherence in a dynamic environment requires distributed repair agents that:
        <ul style="margin-left: 1.2rem; margin-top: 0.4rem; line-height: 1.6;">
          <li>Are embedded in the system itself.</li>
          <li>Act on local information.</li>
          <li>Coordinate stigmergically through infrastructure modification.</li>
          <li>Optimize for accessibility entropy rather than local performance.</li>
        </ul>
      </div>
    </div>
  `,
  tag: "Chapter 12 · Yarncrawler",
  camera: { pos: [0, 18, 28], target: [0, 0, 0], spin: 0.04 },
  narration: [
    "Picture a city made of <b>ideas</b>. Roads connect them. But roads break! Someone has to keep them fixed…",
    "These are <b>Yarncrawlers</b> — tiny repair agents that move through the network, fixing broken connections as they go.",
    "<b>Tap</b> on the network to break a link! Watch the crawlers find it and repair it. The network stays alive because of them.",
    "This is how knowledge systems work: not one big brain, but thousands of little fixers keeping everything connected. 🕸️",
  ],
  build(ctx) {
    const { scene } = ctx;
    const rnd = mulberry32(55);

    // City node layout
    const NODE_COUNT = 18;
    const nodes = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const ang = (i / NODE_COUNT) * Math.PI * 2 + rnd() * 0.4;
      const r = 6 + rnd() * 7;
      nodes.push(new THREE.Vector3(r * Math.cos(ang), (rnd()-0.5) * 4, r * Math.sin(ang)));
    }
    // Add some inner nodes
    for (let i = 0; i < 5; i++) {
      nodes.push(new THREE.Vector3((rnd()-0.5)*6, (rnd()-0.5)*3, (rnd()-0.5)*6));
    }

    // Edges: connect nearby nodes
    const edges = []; // {a, b, broken, health, lineMesh}
    const maxDist = 8;
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a+1; b < nodes.length; b++) {
        if (nodes[a].distanceTo(nodes[b]) < maxDist) {
          edges.push({ a, b, broken: false, health: 1.0 });
        }
      }
    }

    // Build edge meshes
    edges.forEach(e => {
      const geo = new THREE.BufferGeometry().setFromPoints([nodes[e.a], nodes[e.b]]);
      const mat = new THREE.LineBasicMaterial({ color: PAL.cyan, transparent: true, opacity: 0.6 });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      e.lineMesh = line;
    });

    // Node spheres
    const nodeMeshes = nodes.map((pos, i) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 16, 12),
        new THREE.MeshPhongMaterial({ color: PAL.violet, emissive: 0x220044, shininess: 60 })
      );
      m.position.copy(pos);
      scene.add(m);
      return m;
    });

    // Yarncrawlers
    const CRAWLERS = 4;
    const crawlers = [];
    for (let i = 0; i < CRAWLERS; i++) {
      const spark = makeSpark(PAL.spark, 2.0);
      const startEdge = edges[i % edges.length];
      spark.position.copy(nodes[startEdge.a]);
      scene.add(spark);
      crawlers.push({
        spark,
        edgeIdx: i % edges.length,
        t: Math.random(),
        speed: 0.4 + Math.random() * 0.3,
        target: null,
        repairing: false,
        repairTimer: 0,
        fromA: true,
      });
    }

    // Pick broken edge nearest to hit point
    const breakEdge = (worldPos) => {
      let best = -1, bd = 1e9;
      edges.forEach((e, i) => {
        if (e.broken) return;
        const mid = nodes[e.a].clone().add(nodes[e.b]).multiplyScalar(0.5);
        const d = mid.distanceTo(worldPos);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0 && bd < 10) {
        edges[best].broken = true;
        edges[best].health = 0.0;
        ctx.blip(220, 0.25, 'sawtooth', 0.05);
        bursts.push(new Burst(scene, nodes[edges[best].a].clone().add(nodes[edges[best].b]).multiplyScalar(0.5),
          { color: 0xff3344, count: 40, speed: 8, life: 0.8 }));
      }
    };

    const bursts = [];
    let repairCount = 0;

    return {
      onStep(step) {
        if (step === 1) ctx.setHint('The crawlers are patrolling…');
        if (step === 2) ctx.setHint('Tap on the network to break a connection!');
        if (step === 3) ctx.setHint('');
        ctx.ready();
      },
      update(dt, t) {
        for (let i = bursts.length - 1; i >= 0; i--) { bursts[i].update(dt); if (bursts[i].dead) bursts.splice(i, 1); }

        // Update edge visuals
        edges.forEach(e => {
          e.health = lerp(e.health, e.broken ? 0 : 1, 0.04);
          const c = e.broken ? 0xff3344 : PAL.cyan;
          e.lineMesh.material.color.setHex(c);
          e.lineMesh.material.opacity = 0.2 + e.health * 0.5;
        });

        // Update crawlers
        crawlers.forEach(cr => {
          if (cr.repairing) {
            cr.repairTimer -= dt;
            cr.spark.material.opacity = 0.6 + 0.4 * Math.sin(t * 20);
            if (cr.repairTimer <= 0) {
              edges[cr.edgeIdx].broken = false;
              cr.repairing = false;
              repairCount++;
              ctx.pop(520);
              ctx.updateGoal(repairCount, 1);
              bursts.push(new Burst(scene, cr.spark.position.clone(), { color: PAL.green, count: 50, speed: 9, life: 0.9 }));
              if (repairCount === 1) ctx.setHint('Fixed! The crawlers keep the network alive.');
            }
            return;
          }

          // Move along current edge
          const e = edges[cr.edgeIdx];
          cr.t += cr.speed * dt * (e.broken ? 1.5 : 1.0); // rush to broken edges
          if (cr.t >= 1) {
            const curNode = cr.fromA ? e.b : e.a; // arrived at curNode
            cr.t = 0;
            // At end of edge — pick next edge, prefer broken ones
            const connected = edges
              .map((ed, i) => ({ ed, i }))
              .filter(({ ed }) => ed.a === curNode || ed.b === curNode);

            // prioritize broken edges
            const broken = connected.filter(({ ed }) => ed.broken);
            let nextIdx;
            if (broken.length > 0) {
              nextIdx = broken[0].i;
              cr.repairing = true;
              cr.repairTimer = 1.2;
            } else {
              const next = connected[(Math.random() * connected.length) | 0];
              nextIdx = next.i;
            }
            cr.edgeIdx = nextIdx;
            cr.fromA = (edges[nextIdx].a === curNode);
          }

          const ne = edges[cr.edgeIdx];
          const pStart = cr.fromA ? nodes[ne.a] : nodes[ne.b];
          const pEnd = cr.fromA ? nodes[ne.b] : nodes[ne.a];
          cr.spark.position.lerpVectors(pStart, pEnd, cr.t);
          cr.spark.material.opacity = 0.7 + 0.3 * Math.sin(t * 5 + cr.edgeIdx);
        });

        // Node pulse
        nodeMeshes.forEach((m, i) => {
          m.material.emissive.setHex(0x220044);
          const scale = 1.0 + 0.08 * Math.sin(t * 2.5 + i * 0.7);
          m.scale.setScalar(scale);
        });

        if (ctx.input.justDown) {
          const pt = ctx.planePoint(-1);
          breakEdge(pt);
        }
      },
      dispose() { bursts.forEach(b => b.kill()); },
    };
  },
};

// ---- Export all 12 chapters ----

// ---- Export all 12 chapters ----
export const CHAPTERS = [ch1, ch2, ch3, ch4, ch5, ch6, ch7, ch8, ch9, ch10, ch11, ch12];
