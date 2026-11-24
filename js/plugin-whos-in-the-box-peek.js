/**
 * jsPsychWhosInTheBoxPeek: child-friendly calibration and validation for SaccadeJS.
 *
 * Instead of dots, an animal pops up at each point, calls out, and sways gently in place while
 * SaccadeJS records. The animal turns and grows about the point itself, so the target position
 * does not move.
 *
 * mode "calibrate": calls the extension's calibratePoint() at each point and fits the calibration
 *   at the end, like saccade-calibrate.
 * mode "validate": records live gaze at each point and reports the same accuracy measures as
 *   saccade-validate (median_error_viewport, median_error_px, average_offset, percent_in_roi,
 *   raw_gaze, samples_per_sec), computed the same way.
 *
 * With gaze_source "mouse" no tracker is used: calibration just plays the animation, and
 * validation measures the pointer.
 */
var jsPsychWhosInTheBoxPeek = (function (jspsych) {
  "use strict";

  const P = jspsych.ParameterType;

  const CAL_POINTS = [
    [10, 10], [50, 10], [90, 10],
    [10, 50], [50, 50], [90, 50],
    [10, 90], [50, 90], [90, 90],
    [30, 30], [70, 30], [30, 70], [70, 70],
  ];
  const VAL_POINTS = [
    [15, 15], [50, 15], [85, 15],
    [15, 50], [50, 50], [85, 50],
    [15, 85], [50, 85], [85, 85],
  ];

  const info = {
    name: "whos-in-the-box-peek",
    version: "0.1.0",
    parameters: {
      mode: { type: P.SELECT, options: ["calibrate", "validate"], default: "calibrate" },
      /** [x, y] pairs in percent of the window. Defaults: 13 points to calibrate, 9 to validate. */
      points: { type: P.COMPLEX, default: null },
      /** Animals to show, in turn. Default: all of them, shuffled. */
      animals: { type: P.STRING, array: true, default: [] },
      randomize_order: { type: P.BOOL, default: true },
      /** Time from the animal appearing until recording starts (lets the eyes arrive). */
      settle_duration: { type: P.INT, default: 1200 },
      /** Recording time per point. Default 700 ms to calibrate, 1000 ms to validate. */
      capture_duration: { type: P.INT, default: null },
      /** Pause between animals. */
      gap_duration: { type: P.INT, default: 300 },
      /** Width of the animal in pixels. */
      size: { type: P.INT, default: 130 },
      /** Validation: samples within this many pixels of the point count as on target. */
      roi_radius: { type: P.INT, default: 200 },
      gaze_source: { type: P.SELECT, options: ["saccade", "mouse"], default: "saccade" },
      sound: { type: P.BOOL, default: true },
      show_gaze: { type: P.BOOL, default: false },
      /** Calibration: ridge penalty passed to fitCalibration (null lets SaccadeJS choose). */
      lambda: { type: P.FLOAT, default: null },
      /** Calibration: discard earlier calibration points first. */
      clear_previous: { type: P.BOOL, default: true },
      /** Shown while deferred-mode processing finishes. */
      processing_message: { type: P.HTML_STRING, default: "Just a moment…" },
    },
    data: {
      mode: { type: P.STRING },
      gaze_source: { type: P.STRING },
      animals_shown: { type: P.STRING, array: true },
      points_percent: { type: P.COMPLEX, array: true },
      points_px: { type: P.COMPLEX, array: true },
      viewport_width: { type: P.INT },
      viewport_height: { type: P.INT },
      frames_per_point: { type: P.INT, array: true },
      failed_points: { type: P.INT, array: true },
      n_points: { type: P.INT },
      lambda: { type: P.FLOAT },
      weighting: { type: P.STRING },
      fit: { type: P.STRING },
      raw_gaze: { type: P.COMPLEX, array: true },
      average_offset: { type: P.COMPLEX, array: true },
      percent_in_roi: { type: P.FLOAT, array: true },
      median_error_px: { type: P.FLOAT },
      median_error_viewport: { type: P.FLOAT },
      samples_per_sec: { type: P.FLOAT },
      processing_ms: { type: P.INT },
      error: { type: P.STRING },
      rt: { type: P.INT },
    },
  };

  const median = (values) => {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const centroid = (rows) => {
    if (!rows.length) return { x: null, y: null, r: null };
    const mx = rows.reduce((a, r) => a + r.dx, 0) / rows.length;
    const my = rows.reduce((a, r) => a + r.dy, 0) / rows.length;
    const r = median(rows.map((p) => Math.hypot(p.dx - mx, p.dy - my)));
    return { x: mx, y: my, r };
  };
  const sampleRate = (sets) => {
    const means = [];
    for (const rows of sets) {
      if (rows.length < 2) continue;
      let sum = 0;
      for (let j = 1; j < rows.length; j++) sum += rows[j].t - rows[j - 1].t;
      means.push(sum / (rows.length - 1));
    }
    if (!means.length) return null;
    const mean = means.reduce((a, b) => a + b, 0) / means.length;
    return mean > 0 ? 1000 / mean : null;
  };

  class WhosInTheBoxPeekPlugin {
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
      if (!useMouse && !ext) throw new Error("whos-in-the-box-peek needs the saccade extension registered in initJsPsych.");
      const calibrating = trial.mode === "calibrate";
      const captureMs = trial.capture_duration ?? (calibrating ? 700 : 1000);
      const deferred = !!(ext && ext.getMode && ext.getMode() === "deferred");
      const startTime = performance.now();

      display_element.innerHTML = `<div class="wib-sky" id="wib-sky"></div><div class="wib-dot" id="wib-dot"></div>`;
      const sky = display_element.querySelector("#wib-sky");
      const dot = display_element.querySelector("#wib-dot");

      const W = window.innerWidth;
      const H = window.innerHeight;
      const declared = trial.points || (calibrating ? CAL_POINTS : VAL_POINTS);
      const points = trial.randomize_order ? jsPsych.randomization.shuffle(declared) : declared.slice();
      const pool = trial.animals && trial.animals.length ? trial.animals : jsPsych.randomization.shuffle(art.ANIMAL_NAMES);

      // ---------- gaze for the dot and for mouse validation ----------
      let latest = null;
      let raf = null;
      let done = false;
      const onPointerMove = (e) => {
        latest = { x: e.clientX, y: e.clientY, t: performance.now() };
      };
      const onPointerLeave = () => {
        latest = null;
      };
      let unsubscribeDot = null;
      if (useMouse) {
        window.addEventListener("pointermove", onPointerMove);
        document.documentElement.addEventListener("pointerleave", onPointerLeave);
      } else if (trial.show_gaze && ext.onGazeUpdate) {
        unsubscribeDot = ext.onGazeUpdate((s) => {
          latest = { x: s.x, y: s.y, t: performance.now() };
        });
      }
      const showDot = useMouse || trial.show_gaze;
      const frame = () => {
        if (done) return;
        if (showDot) {
          const fresh = latest && (useMouse || performance.now() - latest.t < 300);
          dot.style.display = fresh ? "block" : "none";
          if (fresh) dot.style.transform = `translate(${latest.x}px, ${latest.y}px)`;
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);

      const sleep = (ms) => new Promise((resolve) => jsPsych.pluginAPI.setTimeout(resolve, ms));

      const spawn = (name, x, y) => {
        const el = document.createElement("div");
        el.className = "wib-peek wib-peek-in";
        const s = trial.size;
        Object.assign(el.style, { left: x - s / 2 + "px", top: y - s * 0.52 + "px", width: s + "px", height: s + "px" });
        el.innerHTML = art.ANIMALS[name] || art.ANIMALS.frog;
        sky.appendChild(el);
        return el;
      };
      const sparkle = (x, y) => {
        const cols = ["#FFD84A", "#F59DB0", "#7FD6A8", "#fff", "#9CC2FF"];
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 * i) / 8;
          const sp = document.createElement("span");
          sp.className = "wib-peek-spark";
          Object.assign(sp.style, { left: x + "px", top: y + "px" });
          sp.style.setProperty("--dx", Math.cos(a) * trial.size * 0.6 + "px");
          sp.style.setProperty("--dy", Math.sin(a) * trial.size * 0.6 + "px");
          sp.style.setProperty("--c", cols[i % cols.length]);
          sky.appendChild(sp);
          jsPsych.pluginAPI.setTimeout(() => sp.remove(), 700);
        }
      };

      // ---------- results ----------
      const shownAnimals = [];
      const pointsPx = [];
      const pointsPct = [];
      const framesPerPoint = [];
      const failedPoints = [];
      const rawGaze = [];
      const owed = [];
      let fitResult = null;
      let processingMs = null;
      let errorText = null;

      const collect = async (x, y) => {
        const toRow = (p) => ({
          x: Math.round(p.x),
          y: Math.round(p.y),
          dx: p.x - x,
          dy: p.y - y,
          t: Math.round(p.t - startTime),
        });
        if (useMouse) {
          const rows = [];
          const until = performance.now() + captureMs;
          await new Promise((resolve) => {
            const step = () => {
              if (done) return resolve();
              if (latest) rows.push(toRow({ x: latest.x, y: latest.y, t: performance.now() }));
              if (performance.now() >= until) resolve();
              else requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          });
          return rows;
        }
        if (deferred) {
          const stop = ext.collectGaze();
          await sleep(captureMs);
          owed.push(stop().then((samples) => samples.map(toRow)));
          return null;
        }
        const rows = [];
        const off = ext.onGazeUpdate((p) => rows.push(toRow(p)));
        await sleep(captureMs);
        off();
        return rows;
      };

      const run = async () => {
        if (ext) {
          ext.hidePredictions();
          ext.resume();
          if (calibrating && trial.clear_previous) ext.resetCalibration();
        }
        for (let i = 0; i < points.length; i++) {
          const pt = points[i];
          const x = (pt[0] / 100) * W;
          const y = (pt[1] / 100) * H;
          const name = pool[i % pool.length];
          pointsPct.push(pt);
          pointsPx.push([Math.round(x), Math.round(y)]);
          shownAnimals.push(name);

          const el = spawn(name, x, y);
          if (playSound) sound.peekIn(name);
          await sleep(400);
          el.classList.remove("wib-peek-in");
          el.classList.add("wib-peek-hold");
          await sleep(Math.max(0, trial.settle_duration - 400));
          if (playSound) sound.twinkle();

          if (calibrating) {
            if (ext) {
              try {
                framesPerPoint.push(await ext.calibratePoint(x, y, { captureMs }));
              } catch (e) {
                console.warn("whos-in-the-box-peek: calibration point failed", e);
                framesPerPoint.push(0);
                failedPoints.push(i);
              }
            } else {
              await sleep(captureMs);
              framesPerPoint.push(0);
            }
          } else {
            const rows = await collect(x, y);
            if (rows) rawGaze.push(rows);
          }

          el.classList.remove("wib-peek-hold");
          el.classList.add("wib-peek-out");
          if (playSound) sound.peekOut();
          sparkle(x, y);
          await sleep(250 + trial.gap_duration);
          el.remove();
        }

        if (deferred && (calibrating || owed.length)) {
          const t0 = performance.now();
          const total = Math.max(1, ext.getDeferredPending());
          const msg = document.createElement("div");
          msg.className = "wib-message";
          sky.appendChild(msg);
          const render = () => {
            msg.innerHTML = `<div>${trial.processing_message}<p>${Math.round(100 * Math.max(0, 1 - ext.getDeferredPending() / total))}%</p></div>`;
          };
          render();
          const timer = setInterval(render, 100);
          try {
            if (calibrating) await ext.finishCalibration();
            else rawGaze.push(...(await Promise.all(owed)));
          } finally {
            clearInterval(timer);
          }
          processingMs = Math.round(performance.now() - t0);
        }
        if (calibrating && ext) {
          fitResult = ext.fitCalibration(trial.lambda ?? undefined);
        }
      };

      const finish = () => {
        done = true;
        if (raf) cancelAnimationFrame(raf);
        if (unsubscribeDot) unsubscribeDot();
        window.removeEventListener("pointermove", onPointerMove);
        document.documentElement.removeEventListener("pointerleave", onPointerLeave);

        const data = {
          mode: trial.mode,
          gaze_source: trial.gaze_source,
          animals_shown: shownAnimals,
          points_percent: pointsPct,
          points_px: pointsPx,
          viewport_width: W,
          viewport_height: H,
          processing_ms: processingMs,
          error: errorText,
          rt: Math.round(performance.now() - startTime),
        };
        if (calibrating) {
          Object.assign(data, {
            frames_per_point: framesPerPoint,
            failed_points: failedPoints,
            n_points: pointsPx.length,
            lambda: fitResult ? fitResult.lambda : null,
            weighting: fitResult ? fitResult.weighting : null,
            fit: fitResult ? fitResult.fit : null,
          });
        } else {
          const offsets = rawGaze.map(centroid);
          const errorsPx = offsets.filter((o) => o.x !== null).map((o) => Math.hypot(o.x, o.y));
          const diagonal = Math.hypot(W, H);
          Object.assign(data, {
            raw_gaze: rawGaze,
            average_offset: offsets,
            percent_in_roi: rawGaze.map((rows) =>
              rows.length ? (100 * rows.filter((r) => Math.hypot(r.dx, r.dy) <= trial.roi_radius).length) / rows.length : 0,
            ),
            roi_radius: trial.roi_radius,
            median_error_px: median(errorsPx),
            median_error_viewport: errorsPx.length ? median(errorsPx.map((e) => e / diagonal)) : null,
            samples_per_sec: sampleRate(rawGaze),
          });
        }
        display_element.innerHTML = "";
        jsPsych.finishTrial(data);
      };

      run().then(finish, (e) => {
        console.error(e);
        errorText = String((e && e.message) || e);
        finish();
      });
    }
  }

  WhosInTheBoxPeekPlugin.info = info;
  return WhosInTheBoxPeekPlugin;
})(jsPsychModule);
