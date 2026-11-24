/**
 * jsPsychWhosInTheBox: one reveal of the "Who's in the Box?" game.
 *
 * A grid of identical gift boxes is shown. After `pre_cue_duration`, the target box starts to
 * wiggle (the cue). For `lockout` ms (plus a random jitter) nothing can open, whatever the gaze is
 * doing; samples in the analysis window inside the lockout are therefore unbiased by the gaze
 * contingency. After the lockout the box is armed: it opens when gaze has dwelt in its zone for
 * `dwell` ms, or on its own at `fallback_timeout`. The animal pops out, the box closes, and the
 * trial ends. There are no failure states for the child.
 *
 * Gaze comes from the SaccadeJS jsPsych extension (`gaze_source: "saccade"`) or from the mouse
 * pointer (`gaze_source: "mouse"`), which is useful for piloting the flow without a camera.
 *
 * Requires window.WIB.art and window.WIB.sound (js/wib-art.js, js/wib-sound.js).
 */
var jsPsychWhosInTheBox = (function (jspsych) {
  "use strict";

  const P = jspsych.ParameterType;

  const info = {
    name: "whos-in-the-box",
    version: "0.1.0",
    parameters: {
      /** Rows and columns of boxes. On a portrait screen the two are swapped. */
      rows: { type: P.INT, default: 2 },
      cols: { type: P.INT, default: 3 },
      /** Gap between boxes, as a fraction of the box size. */
      gap: { type: P.FLOAT, default: 0.34 },
      /** Largest box size in pixels. Boxes shrink to fit smaller windows. */
      max_box_size: { type: P.INT, default: 190 },
      /** Index of the box that wiggles and opens (row-major). */
      target_index: { type: P.INT, default: 0 },
      /** Which animal hides in the target box. One of WIB.art.ANIMAL_NAMES. */
      animal: { type: P.STRING, default: "frog" },
      /** Time with all boxes still, before the wiggle starts. */
      pre_cue_duration: { type: P.INT, default: 600 },
      /** Minimum time from wiggle onset before the box can open. */
      lockout: { type: P.INT, default: 1000 },
      /** Up to this many ms are added to `lockout` at random, so the earliest opening is unpredictable. */
      lockout_jitter: { type: P.INT, default: 300 },
      /** Start of the analysis window, ms after wiggle onset. */
      window_start: { type: P.INT, default: 400 },
      /** End of the analysis window, ms after wiggle onset. `null` uses `lockout`. */
      window_end: { type: P.INT, default: null },
      /** Gaze must stay in the target zone this long (ms) to open the box. */
      dwell: { type: P.INT, default: 400 },
      /** The target zone extends this fraction of a box size beyond each edge of the box. */
      zone_margin: { type: P.FLOAT, default: 0.1 },
      /** The box opens on its own this many ms after wiggle onset. */
      fallback_timeout: { type: P.INT, default: 4500 },
      /** How long the animal stays out. */
      reveal_duration: { type: P.INT, default: 2000 },
      /** How long the box takes to close before the trial ends. */
      close_duration: { type: P.INT, default: 450 },
      /** `"saccade"`: gaze from the SaccadeJS extension. `"mouse"`: the pointer stands in for gaze. */
      gaze_source: { type: P.SELECT, options: ["saccade", "mouse"], default: "saccade" },
      /** A gaze sample older than this (ms since it arrived) counts as no gaze. SaccadeJS sends none while the face is lost. */
      stale_after: { type: P.INT, default: 300 },
      sound: { type: P.BOOL, default: true },
      /** Rattle in time with the wiggle. */
      cue_sound: { type: P.BOOL, default: true },
      /** Rising tone while dwell builds. */
      hover_sound: { type: P.BOOL, default: true },
      /** Boxes pop in with a short animation (use on the first trial of a layout). */
      entrance: { type: P.BOOL, default: false },
      /** Text shown at the top of the screen, or null for none. */
      hint: { type: P.HTML_STRING, default: null },
      /** Animals found on earlier trials, shown in the tray at the bottom. */
      progress_found: { type: P.STRING, array: true, default: [] },
      /** Number of slots in the tray. 0 hides the tray. */
      progress_total: { type: P.INT, default: 0 },
      /** Show a dot at the current gaze estimate (for piloting). Always shown with the mouse. */
      show_gaze: { type: P.BOOL, default: false },
      /** Outline the target zone (for piloting). */
      show_zone: { type: P.BOOL, default: false },
    },
    data: {
      rows_shown: { type: P.INT },
      cols_shown: { type: P.INT },
      target_index: { type: P.INT },
      target_row: { type: P.INT },
      target_col: { type: P.INT },
      animal: { type: P.STRING },
      viewport_width: { type: P.INT },
      viewport_height: { type: P.INT },
      box_size: { type: P.FLOAT },
      target_x: { type: P.FLOAT },
      target_y: { type: P.FLOAT },
      box_centers: { type: P.COMPLEX, array: true },
      zone_half_width: { type: P.FLOAT },
      lockout_actual: { type: P.INT },
      window_start: { type: P.INT },
      window_end: { type: P.INT },
      dwell: { type: P.INT },
      zone_margin: { type: P.FLOAT },
      fallback_timeout_actual: { type: P.INT },
      trigger: { type: P.STRING },
      fallback_cause: { type: P.STRING },
      time_to_open: { type: P.INT },
      armed_gaze_coverage: { type: P.FLOAT },
      armed_in_zone_prop: { type: P.FLOAT },
      window_n: { type: P.INT },
      window_err_px: { type: P.FLOAT },
      window_err_box: { type: P.FLOAT },
      window_in_zone_prop: { type: P.FLOAT },
      window_nearest_box: { type: P.INT },
      window_on_target: { type: P.BOOL },
      live_gaze: { type: P.COMPLEX, array: true },
      cue_onset_time: { type: P.FLOAT },
      open_time: { type: P.FLOAT },
      gaze_source: { type: P.STRING },
      live_gaze_available: { type: P.BOOL },
      resized: { type: P.BOOL },
      rt: { type: P.INT },
    },
  };

  const median = (a) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const round = (v, d = 0) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

  class WhosInTheBoxPlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      const jsPsych = this.jsPsych;
      const art = window.WIB.art;
      const sound = window.WIB.sound;
      const playSound = trial.sound && sound;
      const useMouse = trial.gaze_source === "mouse";
      const ext = useMouse ? null : jsPsych.extensions.saccade;
      const liveAvailable =
        useMouse || !!(ext && ext.isInitialized && ext.isInitialized() && (!ext.getMode || ext.getMode() === "live"));
      if (!useMouse && !ext) {
        console.warn("whos-in-the-box: the saccade extension is not registered; boxes will open by fallback.");
      } else if (!useMouse && !liveAvailable) {
        console.warn("whos-in-the-box: no live gaze (tracker not started or in deferred mode); boxes will open by fallback.");
      }
      if (ext && ext.resume) ext.resume();

      const animalSvg = art.ANIMALS[trial.animal] || art.ANIMALS.frog;
      const showDot = useMouse || trial.show_gaze;
      const trayH = trial.progress_total > 0 ? 72 : 0;
      const n = trial.rows * trial.cols;

      // ---------- build the display ----------
      let html = `<div class="wib-sky${trial.entrance ? " wib-entrance" : ""}" id="wib-sky"><div class="wib-mat"></div>`;
      if (trial.hint) html += `<div class="wib-hint">${trial.hint}</div>`;
      for (let i = 0; i < n; i++) {
        const isTarget = i === trial.target_index;
        html += `<div class="wib-box" id="${isTarget ? "wib-target" : "wib-box-" + i}" data-index="${i}" style="--d:${i * 28}ms">${art.box(isTarget ? animalSvg : "")}</div>`;
      }
      if (trial.show_zone) html += `<div class="wib-zone" id="wib-zone"></div>`;
      html += `</div>`;
      if (trayH) {
        html += `<div class="wib-tray" aria-hidden="true">`;
        for (let i = 0; i < trial.progress_total; i++) {
          const found = trial.progress_found[i];
          html += found && art.ANIMALS[found]
            ? `<div class="wib-slot wib-filled">${art.ANIMALS[found]}</div>`
            : `<div class="wib-slot"></div>`;
        }
        html += `</div>`;
      }
      html += `<div class="wib-dot" id="wib-dot"></div>`;
      display_element.innerHTML = html;

      const sky = display_element.querySelector("#wib-sky");
      const mat = sky.querySelector(".wib-mat");
      const boxes = [...sky.querySelectorAll(".wib-box")];
      const target = boxes[trial.target_index];
      const dot = display_element.querySelector("#wib-dot");
      const zoneEl = display_element.querySelector("#wib-zone");

      // ---------- geometry (viewport pixels, same space as SaccadeJS gaze) ----------
      const geo = { s: 100, rows: trial.rows, cols: trial.cols, centers: [], W: 0, H: 0 };
      let resized = false;
      const layout = () => {
        const W = window.innerWidth;
        const H = window.innerHeight;
        let rows = trial.rows;
        let cols = trial.cols;
        const availW = W - 56;
        const availH = H - trayH - 56;
        if (availH > availW * 1.15 && cols > rows) [rows, cols] = [cols, rows];
        const g = trial.gap;
        const s = Math.max(
          30,
          Math.floor(Math.min(availW / (cols + (cols - 1) * g), availH / (rows + (rows - 1) * g), trial.max_box_size)),
        );
        const gap = s * g;
        const gw = cols * s + (cols - 1) * gap;
        const gh = rows * s + (rows - 1) * gap;
        const ox = (W - gw) / 2;
        const oy = (H - trayH - gh) / 2;
        geo.s = s;
        geo.rows = rows;
        geo.cols = cols;
        geo.W = W;
        geo.H = H;
        geo.centers = boxes.map((el, i) => {
          const x = ox + (i % cols) * (s + gap);
          const y = oy + Math.floor(i / cols) * (s + gap);
          Object.assign(el.style, { left: x + "px", top: y + "px", width: s + "px", height: s + "px", fontSize: s + "px" });
          return [x + s / 2, y + s / 2];
        });
        const pad = s * 0.32;
        Object.assign(mat.style, {
          left: ox - pad + "px",
          top: oy - pad + "px",
          width: gw + pad * 2 + "px",
          height: gh + pad * 2 + "px",
        });
        geo.half = s / 2 + trial.zone_margin * s;
        if (zoneEl) {
          const [cx, cy] = geo.centers[trial.target_index];
          Object.assign(zoneEl.style, {
            left: cx - geo.half + "px",
            top: cy - geo.half + "px",
            width: geo.half * 2 + "px",
            height: geo.half * 2 + "px",
          });
        }
      };
      layout();
      const onResize = () => {
        resized = true;
        layout();
      };
      window.addEventListener("resize", onResize);

      const inZone = (g) => {
        if (!g) return false;
        const [cx, cy] = geo.centers[trial.target_index];
        return Math.abs(g.x - cx) <= geo.half && Math.abs(g.y - cy) <= geo.half;
      };

      // ---------- gaze input ----------
      let latest = null; // { x, y, t, recv }
      const live = []; // { x, y, t } with t in ms from wiggle onset
      let cueOnset = null;
      let unsubscribe = null;
      const onPointerMove = (e) => {
        const now = performance.now();
        latest = { x: e.clientX, y: e.clientY, t: now, recv: now };
      };
      const onPointerLeave = () => {
        latest = null;
      };
      if (useMouse) {
        window.addEventListener("pointermove", onPointerMove);
        document.documentElement.addEventListener("pointerleave", onPointerLeave);
        window.addEventListener("blur", onPointerLeave);
      } else if (ext && ext.onGazeUpdate) {
        unsubscribe = ext.onGazeUpdate((s) => {
          latest = { x: s.x, y: s.y, t: s.t, recv: performance.now() };
          if (cueOnset !== null) live.push({ x: Math.round(s.x), y: Math.round(s.y), t: Math.round(s.t - cueOnset) });
        });
      }
      const currentGaze = (now) => {
        if (!latest) return null;
        if (!useMouse && now - latest.recv > trial.stale_after) return null;
        return latest;
      };

      // ---------- state ----------
      const lockoutActual = trial.lockout + Math.random() * trial.lockout_jitter;
      const windowEnd = Math.min(trial.window_end ?? trial.lockout, lockoutActual);
      const effTimeout = Math.max(trial.fallback_timeout, lockoutActual + trial.dwell + 500);
      const trialStart = performance.now();
      let phase = "pre";
      let last = null;
      let raf = null;
      let nextRattle = 0;
      let dwellAcc = 0;
      let armedTime = 0;
      let coveredTime = 0;
      let zoneTime = 0;
      let openAt = null;
      let closeAt = null;
      let trigger = null;
      let finished = false;

      const burst = (el) => {
        const inner = el.querySelector(".wib-inner");
        const cols = ["#FFD84A", "#F59DB0", "#7FD6A8", "#fff", "#9CC2FF"];
        for (let i = 0; i < 9; i++) {
          const a = (Math.PI * 2 * i) / 9 + Math.random() * 0.4;
          const d = 60 + Math.random() * 50;
          const sp = document.createElement("span");
          sp.className = "wib-spark";
          sp.style.setProperty("--dx", (Math.cos(a) * d * geo.s) / 100 + "px");
          sp.style.setProperty("--dy", (Math.sin(a) * d * geo.s) / 100 - 20 + "px");
          sp.style.setProperty("--c", cols[i % cols.length]);
          inner.appendChild(sp);
        }
      };

      const open = (type, now) => {
        phase = "reveal";
        openAt = now;
        trigger = type;
        target.classList.remove("wib-cue");
        target.style.setProperty("--p", 0);
        target.classList.add("wib-open");
        if (playSound) {
          sound.stopHover();
          sound.open(trial.animal);
        }
        burst(target);
        const slot = display_element.querySelectorAll(".wib-slot")[trial.progress_found.length];
        if (slot) {
          slot.classList.add("wib-filled", "wib-new");
          slot.innerHTML = animalSvg;
        }
        const hint = sky.querySelector(".wib-hint");
        if (hint) hint.style.visibility = "hidden";
      };

      const tick = (now) => {
        if (finished) return;
        const dt = last === null ? 0 : Math.min(now - last, 100);
        last = now;
        const g = currentGaze(performance.now());

        if (phase === "pre") {
          if (now - trialStart >= trial.pre_cue_duration) {
            target.classList.add("wib-cue");
            cueOnset = now;
            nextRattle = now;
            phase = "cue";
          }
        } else if (phase === "cue") {
          const t = now - cueOnset;
          if (useMouse && g) live.push({ x: Math.round(g.x), y: Math.round(g.y), t: Math.round(t) });
          if (playSound && trial.cue_sound && now >= nextRattle) {
            sound.rattle();
            nextRattle += 1100;
          }
          if (t >= lockoutActual) {
            armedTime += dt;
            if (g) coveredTime += dt;
            if (inZone(g)) {
              zoneTime += dt;
              dwellAcc += dt;
            } else {
              dwellAcc = Math.max(0, dwellAcc - dt * 1.5);
            }
            const p = Math.min(1, dwellAcc / trial.dwell);
            target.style.setProperty("--p", p.toFixed(3));
            if (playSound && trial.hover_sound) sound.hover(p);
            if (dwellAcc >= trial.dwell) open("gaze", now);
            else if (t >= effTimeout) open("fallback", now);
          }
        } else if (phase === "reveal") {
          if (useMouse && g) live.push({ x: Math.round(g.x), y: Math.round(g.y), t: Math.round(now - cueOnset) });
          if (now - openAt >= trial.reveal_duration) {
            phase = "closing";
            closeAt = now;
            target.classList.remove("wib-open");
            if (playSound) sound.close();
          }
        } else if (phase === "closing") {
          if (now - closeAt >= trial.close_duration) {
            end();
            return;
          }
        }

        if (showDot) {
          if (g) {
            dot.style.display = "block";
            dot.style.transform = `translate(${g.x}px, ${g.y}px)`;
            dot.classList.toggle("wib-on", phase === "cue" && inZone(g));
          } else {
            dot.style.display = "none";
          }
        }
        raf = requestAnimationFrame(tick);
      };

      const end = () => {
        finished = true;
        if (raf) cancelAnimationFrame(raf);
        if (unsubscribe) unsubscribe();
        window.removeEventListener("resize", onResize);
        window.removeEventListener("pointermove", onPointerMove);
        document.documentElement.removeEventListener("pointerleave", onPointerLeave);
        window.removeEventListener("blur", onPointerLeave);
        if (playSound) sound.stopHover();

        // Analysis window: samples between window_start and window_end after wiggle onset,
        // all before anything gaze-contingent could happen.
        const [tx, ty] = geo.centers[trial.target_index];
        const win = live.filter((s) => s.t >= trial.window_start && s.t <= windowEnd);
        const dists = win.map((s) => Math.hypot(s.x - tx, s.y - ty));
        const errPx = median(dists);
        let nearest = null;
        if (win.length) {
          const mx = median(win.map((s) => s.x));
          const my = median(win.map((s) => s.y));
          let best = Infinity;
          geo.centers.forEach(([cx, cy], i) => {
            const d = Math.hypot(mx - cx, my - cy);
            if (d < best) {
              best = d;
              nearest = i;
            }
          });
        }
        const coverage = armedTime > 0 ? coveredTime / armedTime : null;

        jsPsych.finishTrial({
          rows_shown: geo.rows,
          cols_shown: geo.cols,
          target_index: trial.target_index,
          target_row: Math.floor(trial.target_index / geo.cols),
          target_col: trial.target_index % geo.cols,
          animal: trial.animal,
          viewport_width: geo.W,
          viewport_height: geo.H,
          box_size: geo.s,
          target_x: round(tx, 1),
          target_y: round(ty, 1),
          box_centers: geo.centers.map(([x, y]) => [round(x, 1), round(y, 1)]),
          zone_half_width: round(geo.half, 1),
          lockout_actual: Math.round(lockoutActual),
          window_start: trial.window_start,
          window_end: Math.round(windowEnd),
          dwell: trial.dwell,
          zone_margin: trial.zone_margin,
          fallback_timeout_actual: Math.round(effTimeout),
          trigger,
          fallback_cause: trigger === "fallback" ? (coverage !== null && coverage >= 0.5 ? "gaze_off_target" : "no_gaze") : null,
          time_to_open: Math.round(openAt - cueOnset),
          armed_gaze_coverage: round(coverage, 3),
          armed_in_zone_prop: armedTime > 0 ? round(zoneTime / armedTime, 3) : null,
          window_n: win.length,
          window_err_px: round(errPx, 1),
          window_err_box: errPx === null ? null : round(errPx / geo.s, 3),
          window_in_zone_prop: win.length ? round(win.filter(inZone).length / win.length, 3) : null,
          window_nearest_box: nearest,
          window_on_target: nearest === null ? null : nearest === trial.target_index,
          live_gaze: live,
          cue_onset_time: round(cueOnset, 1),
          open_time: round(openAt, 1),
          gaze_source: trial.gaze_source,
          live_gaze_available: liveAvailable,
          resized,
          rt: Math.round(openAt - cueOnset),
        });
      };

      raf = requestAnimationFrame(tick);
    }
  }

  WhosInTheBoxPlugin.info = info;
  return WhosInTheBoxPlugin;
})(jsPsychModule);
