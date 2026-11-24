/* Who's in the Box? A gaze-contingent looking game for children, built on jsPsych and SaccadeJS.
 *
 * Options come from the URL, for example  index.html?pid=P01&preset=quick&debug=1
 * See README.md for the full list.
 */
(function () {
  "use strict";

  const TASK_VERSION = "0.1.0";

  // ---------- options from the URL ----------
  const q = new URLSearchParams(window.location.search);
  const flag = (key, fallback) => (q.has(key) ? !["0", "false", "no", "off"].includes(q.get(key).toLowerCase()) : fallback);
  const num = (key, fallback) => {
    const v = parseFloat(q.get(key));
    return Number.isFinite(v) ? v : fallback;
  };
  const CONFIG = {
    mouse: flag("mouse", false),
    debug: flag("debug", false),
    timesync: flag("timesync", true),
    calibrate: flag("calibrate", true),
    fullscreen: flag("fullscreen", true),
    sound: flag("sound", true),
    cueSound: flag("cuesound", true),
    hoverSound: flag("hoversound", true),
    preset: q.get("preset") || "full",
    maxError: num("maxerr", 0.15),
    lockout: num("lockout", 1000),
    jitter: num("jitter", 300),
    dwell: num("dwell", 400),
    timeout: num("timeout", 4500),
    zone: num("zone", 0.1),
    pid: q.get("pid") || null,
  };
  const GAZE = CONFIG.mouse ? "mouse" : "saccade";

  // ---------- layouts and session plans ----------
  const LAYOUTS = {
    big: { rows: 2, cols: 3, gap: 0.34, max_box_size: 190 },
    med: { rows: 3, cols: 4, gap: 0.26, max_box_size: 150 },
    small: { rows: 4, cols: 5, gap: 0.2, max_box_size: 120 },
  };
  // Easy wins first, the resolution test in the middle, and an easy closer that doubles as a
  // drift check.
  const PRESETS = {
    full: [["big", 4], ["med", 8], ["small", 8], ["big", 3]],
    quick: [["big", 2], ["med", 3], ["small", 3]],
    big: [["big", 6]],
    med: [["med", 8]],
    small: [["small", 10]],
  };
  if (!PRESETS[CONFIG.preset]) CONFIG.preset = "full";

  const jsPsych = initJsPsych({
    extensions: CONFIG.mouse ? [] : [{ type: jsPsychExtensionSaccade, params: { mode: "live" } }],
  });
  const R = jsPsych.randomization;
  const PID = CONFIG.pid || R.randomID(8);
  window.WIB.sound.setEnabled(CONFIG.sound);

  jsPsych.data.addProperties({
    participant_id: PID,
    task_version: TASK_VERSION,
    gaze_source: GAZE,
    preset: CONFIG.preset,
    url_params: window.location.search,
  });

  // Draw from a shuffled bag and refill when empty, never repeating the previous item.
  function bagDrawer(items) {
    let bag = [];
    let prev = null;
    return () => {
      if (!bag.length) {
        bag = R.shuffle(items);
        if (bag.length > 1 && bag[0] === prev) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
      prev = bag.shift();
      return prev;
    };
  }

  function makePlan(preset) {
    const nextAnimal = bagDrawer(window.WIB.art.ANIMAL_NAMES);
    const cellDrawers = {};
    const plan = [];
    PRESETS[preset].forEach(([layout, count], block) => {
      const L = LAYOUTS[layout];
      if (!cellDrawers[layout]) cellDrawers[layout] = bagDrawer([...Array(L.rows * L.cols).keys()]);
      for (let i = 0; i < count; i++) {
        plan.push({ block, layout, trial_in_block: i, target_index: cellDrawers[layout](), animal: nextAnimal() });
      }
    });
    return plan;
  }
  const plan = makePlan(CONFIG.preset);
  const found = [];

  // ---------- helpers for screens ----------
  const art = window.WIB.art;
  const friends = (names) => `<div class="wib-friends">${names.map((n) => art.ANIMALS[n]).join("")}</div>`;
  const goButton = (choice) => `<button class="jspsych-btn wib-btn-go">${choice}</button>`;
  const card = (inner) => `<div class="wib-card-wrap"><div class="wib-card">${inner}</div></div>`;
  const median = (a) => {
    const v = a.filter((x) => x !== null && Number.isFinite(x)).sort((x, y) => x - y);
    if (!v.length) return null;
    const m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  const lastOf = (phase) => jsPsych.data.get().filter({ wib_phase: phase }).last(1).values()[0];
  const lastValidation = () => {
    const rows = jsPsych.data.get().filterCustom((d) => d.wib_phase === "validation_1" || d.wib_phase === "validation_2").values();
    return rows[rows.length - 1];
  };
  const pct = (v) => (v === null || v === undefined ? "n/a" : (100 * v).toFixed(1) + "% of screen diagonal");

  const timeline = [];

  // ---------- 1. Welcome, for the grown-up ----------
  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: `<div class="wib-page">
      <p class="wib-kicker">For the grown-up</p>
      <h1>Who's in the Box?</h1>
      <p>A short looking game for children, about 5 minutes long. The webcam follows where your child looks on the screen, and a box opens when your child looks at it.</p>
      ${CONFIG.mouse ? `<p class="wib-note"><strong>Mouse mode.</strong> The pointer stands in for gaze and the camera is not used.</p>` : ""}
      <h2>Before you start</h2>
      <ul>
        <li>Use a laptop or desktop computer with a webcam, in Chrome or Edge.</li>
        <li>Seat your child facing the screen, about an arm's length away, with their face near the middle of the camera's view.</li>
        <li>Light should fall on your child's face. Avoid a bright window behind them.</li>
        <li>Turn the sound on. The game uses sounds to hold your child's attention.</li>
        <li>Sit beside or behind your child, out of the camera's view if you can. You press the buttons; your child only needs to look.</li>
      </ul>
      <h2>What is recorded</h2>
      <p>The camera image is processed on this computer and is not saved or uploaded. The game records where on the screen your child was looking, many times a second, with timing. At the end you can download this data.</p>
    </div>`,
    choices: ["Get started"],
    button_html: goButton,
    data: { wib_phase: "welcome" },
  });

  if (CONFIG.fullscreen) {
    timeline.push({
      type: jsPsychFullscreen,
      fullscreen_mode: true,
      message: `<div class="wib-page"><h2>Full screen</h2><p>The game fills the whole screen so nothing else distracts your child. It returns to normal at the end.</p></div>`,
      button_label: "Go full screen",
      data: { wib_phase: "fullscreen" },
    });
  }

  // ---------- 2. Camera and timing setup ----------
  if (!CONFIG.mouse) {
    timeline.push({
      type: jsPsychSaccadePreview,
      instructions: `<p class="wib-kicker">Camera check</p>
        <h2>Line up your child's face</h2>
        <p>Allow the camera when your browser asks. Then move the computer or your child until both eyes show clearly in the strip below the picture.</p>
        <p>Press <strong>Ready</strong> when the face is found. The video stays on this computer.</p>`,
      button_text: "Ready",
      face_timeout: 60000,
      show_diagnostics: CONFIG.debug,
      data: { wib_phase: "preview" },
    });
    if (CONFIG.timesync) {
      timeline.push({
        type: jsPsychSaccadeTimeSync,
        instructions: `<div class="wib-page">
          <p class="wib-kicker">Timing check, 15 seconds</p>
          <h2>The screen will switch between black and white</h2>
          <p>This measures the delay between the screen and the camera, so the timing of your child's looks is accurate. The screen changes about once a second, not rapidly.</p>
          <p>Your child just needs to stay facing the screen. You could say: "The screen is going to blink like a light switch!"</p>
        </div>`,
        button_text: "Start",
        data: { wib_phase: "timesync" },
      });
    }
  }

  // ---------- 3. Calibration with animals ----------
  const peekBase = { type: jsPsychWhosInTheBoxPeek, gaze_source: GAZE, sound: CONFIG.sound, show_gaze: CONFIG.debug };
  if (CONFIG.calibrate) {
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: card(`${friends(["bunny", "frog", "owl"])}<h1>Peekaboo!</h1><p>Some animal friends want to say hi. Watch where they pop up!</p>`),
      choices: ["Let's go!"],
      button_html: goButton,
      data: { wib_phase: "calibration_intro" },
    });
    timeline.push({ ...peekBase, mode: "calibrate", data: { wib_phase: "calibration_1" } });
    timeline.push({ ...peekBase, mode: "validate", data: { wib_phase: "validation_1" } });
    if (!CONFIG.mouse) {
      // One more try if the check went badly. Choose the threshold from pilot data (maxerr=...).
      timeline.push({
        timeline: [
          {
            type: jsPsychHtmlButtonResponse,
            stimulus: card(`${friends(["dog", "cat"])}<h1>One more time!</h1><p>Let's say hi to the animals again.</p>`),
            choices: ["Let's go!"],
            button_html: goButton,
            data: { wib_phase: "recalibration_intro" },
          },
          { ...peekBase, mode: "calibrate", data: { wib_phase: "calibration_2" } },
          { ...peekBase, mode: "validate", data: { wib_phase: "validation_2" } },
        ],
        conditional_function: () => {
          const v = lastValidation();
          return !v || v.median_error_viewport === null || v.median_error_viewport > CONFIG.maxError;
        },
      });
    }
  }

  // ---------- 4. The game ----------
  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: card(`${friends(["tiger", "duck", "dino"])}<h1>Who's hiding in the boxes?</h1><p>One box will wiggle. Look at it and see who pops out!</p>`),
    choices: ["Let's play!"],
    button_html: goButton,
    on_finish: () => window.WIB.sound.start(),
    data: { wib_phase: "game_intro" },
  });

  plan.forEach((p, i) => {
    timeline.push({
      type: jsPsychWhosInTheBox,
      ...LAYOUTS[p.layout],
      target_index: p.target_index,
      animal: p.animal,
      lockout: CONFIG.lockout,
      lockout_jitter: CONFIG.jitter,
      dwell: CONFIG.dwell,
      fallback_timeout: CONFIG.timeout,
      zone_margin: CONFIG.zone,
      gaze_source: GAZE,
      sound: CONFIG.sound,
      cue_sound: CONFIG.cueSound,
      hover_sound: CONFIG.hoverSound,
      entrance: p.trial_in_block === 0,
      hint: i < 2 ? "Look at the box that wiggles!" : null,
      progress_found: () => found.slice(),
      progress_total: plan.length,
      show_gaze: CONFIG.debug,
      show_zone: CONFIG.debug,
      extensions: CONFIG.mouse ? [] : [{ type: jsPsychExtensionSaccade, params: { targets: ["#wib-target"] } }],
      data: { wib_phase: "game", game_trial: i, block: p.block, block_layout: p.layout, trial_in_block: p.trial_in_block },
      on_finish: (data) => {
        found.push(data.animal);
        // Put the plugin's event times on the same clock as saccade_data's t.
        const ts = data.saccade_timing && data.saccade_timing.trial_start;
        if (Number.isFinite(ts)) {
          data.cue_onset = Math.round(data.cue_onset_time - ts);
          data.open_onset = Math.round(data.open_time - ts);
        }
      },
    });
  });

  // ---------- 5. Drift check at the end ----------
  if (CONFIG.calibrate) {
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: card(`${friends(["pig", "mouse", "shark"])}<h1>Bye-bye, friends!</h1><p>Watch them pop up one last time.</p>`),
      choices: [],
      trial_duration: 2500,
      data: { wib_phase: "drift_intro" },
    });
    timeline.push({
      ...peekBase,
      mode: "validate",
      points: [[50, 50], [20, 20], [80, 20], [20, 80], [80, 80]],
      data: { wib_phase: "validation_end" },
    });
  }

  if (CONFIG.fullscreen) {
    timeline.push({ type: jsPsychFullscreen, fullscreen_mode: false, delay_after: 0, data: { wib_phase: "fullscreen_exit" } });
  }

  // ---------- 6. The end ----------
  const summaryHtml = () => {
    const game = jsPsych.data.get().filter({ wib_phase: "game" }).values();
    const byGaze = game.filter((d) => d.trigger === "gaze");
    const v1 = lastOf("validation_1");
    const v2 = lastOf("validation_2");
    const ve = lastOf("validation_end");
    const fallbackNoGaze = game.filter((d) => d.fallback_cause === "no_gaze").length;
    const fallbackOff = game.filter((d) => d.fallback_cause === "gaze_off_target").length;
    const winErr = median(game.map((d) => d.window_err_box));
    const onTarget = game.filter((d) => d.window_on_target === true).length;
    const scored = game.filter((d) => d.window_on_target !== null).length;
    const rows = [
      ["Participant", PID],
      ["Gaze source", GAZE],
      ["Opened by looking", `${byGaze.length} of ${game.length}`],
      ["Opened by fallback", `${fallbackNoGaze} with no gaze, ${fallbackOff} with gaze elsewhere`],
      ["Median time to open by looking", byGaze.length ? `${Math.round(median(byGaze.map((d) => d.time_to_open)))} ms` : "n/a"],
      ["Analysis window on the right box", scored ? `${onTarget} of ${scored}` : "n/a"],
      ["Median window error", winErr === null ? "n/a" : `${winErr.toFixed(2)} box widths`],
    ];
    if (v1) rows.push(["Validation error", pct(v1.median_error_viewport)]);
    if (v2) rows.push(["Validation error, second try", pct(v2.median_error_viewport)]);
    if (ve) rows.push(["Validation error at the end", pct(ve.median_error_viewport)]);
    return `<dl class="wib-summary">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
  };

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: () => `<div class="wib-page">
      <div class="wib-card" style="margin-bottom:28px">${friends(found.slice(-4))}<h1>You found ${found.length} friends!</h1><p>Great looking. Thank you for playing!</p></div>
      <p class="wib-kicker">For the grown-up</p>
      <p>Please download the data file and send it to the research team.</p>
      ${summaryHtml()}
    </div>`,
    choices: ["Download data"],
    button_html: goButton,
    on_load: () => window.WIB.sound.end(),
    data: { wib_phase: "end" },
    on_finish: () => {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      jsPsych.data.get().localSave("json", `whos-in-the-box_${PID}_${stamp}.json`);
    },
  });
  // Stays on this screen until "Start again", so the file can be downloaded more than once.
  timeline.push({
    timeline: [
      {
        type: jsPsychHtmlButtonResponse,
        stimulus: `<div class="wib-page"><h2>Data downloaded</h2><p>Look for a file starting with <code>whos-in-the-box_${PID}</code> in your Downloads folder.</p><p>To run another child, start again.</p></div>`,
        choices: ["Download again", "Start again"],
        data: { wib_phase: "done" },
        on_finish: (data) => {
          if (data.response === 0) {
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            jsPsych.data
              .get()
              .filterCustom((d) => d.wib_phase !== "done")
              .localSave("json", `whos-in-the-box_${PID}_${stamp}.json`);
          } else {
            const params = new URLSearchParams(window.location.search);
            params.delete("pid");
            window.location.search = params.toString();
          }
        },
      },
    ],
    loop_function: (data) => data.values()[0].response === 0,
  });

  window.WIB.jsPsych = jsPsych;
  window.WIB.config = CONFIG;
  window.WIB.plan = plan;
  jsPsych.run(timeline);
})();
