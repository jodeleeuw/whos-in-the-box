# Who's in the Box?

Gaze-contingent eye tracking for kids. A short looking game built on [jsPsych](https://www.jspsych.org) and [SaccadeJS](https://saccade.jspsych.org), meant as a testbed for how well webcam eye tracking works with children.

A grid of identical gift boxes appears. One box wiggles. When the child looks at it, the box pops open and an animal jumps out. If the tracker can't tell that the child is looking, the box opens anyway after a few seconds, so the child never fails.

**Run it:** https://jodeleeuw.github.io/whos-in-the-box/

## Session

About 5 minutes in total.

1. **Welcome** (for the grown-up): setup tips and what is recorded.
2. **Full screen.**
3. **Camera check** (`saccade-preview`): line up the child's face; loads the model.
4. **Timing check** (`saccade-time-sync`, 15 s): measures screen-to-camera lag so gaze timestamps line up with the display.
5. **Calibration with animals**: an animal pops up at each of 13 points and sways in place while SaccadeJS records.
6. **Validation with animals**: the same at 9 new points. Reports the same accuracy measures as `saccade-validate`. If the error is over the threshold (or nothing was recorded), calibration and validation run once more.
7. **The game**: 23 reveals. 4 on a 2×3 grid, 8 on 3×4, 8 on 4×5, then 3 more on 2×3 as an easy closer.
8. **Drift check**: animals at 5 points.
9. **End**: a summary for the researcher and a button to download the data as JSON.

A grown-up clicks the buttons; the child only needs to look.

## One reveal

```
 0 ms            pre-cue: all boxes still (600 ms)
 cue onset       the target box wiggles and rattles
 +400 ms ┐
         │       analysis window: nothing can open yet, so these samples are not
 +1000 ms┘       selected by the gaze contingency
 +1000–1300 ms   lockout ends (1000 ms + up to 300 ms jitter): the box is armed
 armed           opens when gaze stays in its zone for 400 ms, or
 +4500 ms        opens anyway (fallback)
 reveal          animal pops out (2 s), then the box closes (0.45 s)
```

While gaze builds dwell on the box, the lid lifts and a soft tone rises. Dwell drains 1.5× faster than it builds, so brief jitter out of the zone doesn't reset it. The target zone is the box plus a margin of 10% of the box size on each side.

Target boxes are drawn without replacement per layout, with no immediate repeats. Animals (13) are drawn the same way, so each animal appears before any repeats.

## URL options

Add options to the address, for example `?pid=P012&preset=quick&debug=1`.

| Option | Default | What it does |
| --- | --- | --- |
| `pid` | random | Participant ID, saved on every row and in the file name. |
| `preset` | `full` | `full` (23 reveals), `quick` (8), or a single layout: `big`, `med`, `small`. |
| `mouse` | `0` | `1`: the mouse pointer stands in for gaze and the camera is not used. For trying out the flow. |
| `debug` | `0` | `1`: show the gaze estimate as a dot and outline the target zone. |
| `timesync` | `1` | `0`: skip the 15 s timing check. Gaze timestamps are then not corrected for camera lag. |
| `calibrate` | `1` | `0`: skip calibration and validation (only useful with `mouse=1`). |
| `fullscreen` | `1` | `0`: don't switch to full screen. |
| `sound` | `1` | `0`: no sound at all. |
| `cuesound` | `1` | `0`: no rattle with the wiggle. |
| `hoversound` | `1` | `0`: no rising tone while dwell builds. |
| `maxerr` | `0.15` | Recalibrate if validation error is above this fraction of the screen diagonal. **Placeholder: set it from pilot data.** |
| `lockout` | `1000` | Lockout in ms (also the end of the analysis window). |
| `jitter` | `300` | Random extra lockout, up to this many ms. |
| `dwell` | `400` | Dwell needed to open a box, in ms. |
| `timeout` | `4500` | Fallback opening time, in ms after cue onset. |
| `zone` | `0.1` | Zone margin beyond the box edge, as a fraction of the box size. |

## Data

The download is a JSON array with one row per trial. Every row has `participant_id`, `task_version`, `gaze_source` (`saccade` or `mouse`), `preset`, `url_params` and `wib_phase`. With the camera, every row also has `saccade_model` and `saccade_mode`.

### Game trials (`wib_phase: "game"`)

| Field | Meaning |
| --- | --- |
| `game_trial`, `block`, `block_layout`, `trial_in_block` | Position in the session. |
| `rows_shown`, `cols_shown` | Grid as displayed (swapped on a portrait screen). |
| `target_index`, `target_row`, `target_col` | The cued box (row-major). |
| `animal` | Who was in the box. |
| `viewport_width`, `viewport_height` | Window size in pixels. |
| `box_size`, `box_centers`, `target_x`, `target_y`, `zone_half_width` | Geometry, in viewport pixels (the same space as `saccade_data`). |
| `lockout_actual`, `window_start`, `window_end` | ms after cue onset. |
| `dwell`, `zone_margin`, `fallback_timeout_actual` | Contingency settings used. |
| `trigger` | `gaze` or `fallback`. |
| `fallback_cause` | For fallbacks: `no_gaze` (gaze available for less than half the armed time, meaning the tracker lost the child) or `gaze_off_target` (tracking, but not in the zone). |
| `time_to_open` (= `rt`) | ms from cue onset to the box opening. |
| `armed_gaze_coverage` | Share of the armed phase with a gaze estimate. |
| `armed_in_zone_prop` | Share of the armed phase with gaze in the zone. |
| `window_n` | Gaze samples in the analysis window. |
| `window_err_px`, `window_err_box` | Median distance from the target centre in the window, in pixels and in box widths. |
| `window_in_zone_prop` | Share of window samples in the target zone. |
| `window_nearest_box`, `window_on_target` | Box nearest the median gaze in the window, and whether it is the target. |
| `live_gaze` | The samples the game reacted to: `{x, y, t}`, `t` in ms from cue onset. |
| `cue_onset`, `open_onset` | Cue and opening times on the clock of `saccade_data` (ms from `saccade_timing.trial_start`). |
| `cue_onset_time`, `open_time` | The same events on the `performance.now()` clock. |
| `saccade_data`, `saccade_targets`, `saccade_timing` | Added by the SaccadeJS extension. `saccade_targets["#wib-target"]` is the cued box. |
| `live_gaze_available` | `false` if the tracker had not started or was in deferred mode (then every box opens by fallback). |
| `resized` | The window changed size during the trial. |

The summary fields are computed from live samples, for convenience. For the paper, recompute from `saccade_data` using `cue_onset`.

### Calibration and validation (`wib_phase: "calibration_1"`, `"validation_1"`, `"calibration_2"`, `"validation_2"`, `"validation_end"`)

All have `mode`, `animals_shown`, `points_percent`, `points_px`, `viewport_width`, `viewport_height` and `rt`.

- **Calibration** adds `frames_per_point`, `failed_points`, `n_points`, `lambda`, `fit` and `weighting` (all as in `saccade-calibrate`; `lambda` is `null` if the fit failed).
- **Validation** adds `median_error_viewport` (the number to report), `median_error_px`, `average_offset`, `percent_in_roi`, `roi_radius`, `raw_gaze` and `samples_per_sec`, computed as in `saccade-validate`.

## Files

| File | |
| --- | --- |
| `index.html` | Loads jsPsych 8.2.3 and SaccadeJS 1.0.0 (pinned) and the game. |
| `js/experiment.js` | The timeline and URL options. |
| `js/plugin-whos-in-the-box.js` | `jsPsychWhosInTheBox`: one reveal. Usable on its own with any jsPsych 8 timeline. |
| `js/plugin-whos-in-the-box-peek.js` | `jsPsychWhosInTheBoxPeek`: animal calibration and validation. |
| `js/wib-art.js` | Animal and box artwork (inline SVG). |
| `js/wib-sound.js` | Sound effects, synthesized with Web Audio. |
| `css/whos-in-the-box.css` | Styles. |

## Running locally

The camera only works over `https://` or on `localhost`, so serve the folder rather than opening the file:

```sh
npx serve .        # or: python3 -m http.server
```

Then open `http://localhost:3000/?mouse=1` to try it with the mouse.

## Before collecting data

- **Thresholds are placeholders.** `maxerr`, `zone`, `dwell` and `timeout` should be set from pilot data with children.
- **Model hosting.** SaccadeJS downloads its model from a public server by default. For a real study, host it yourself ([Hosting the assets](https://saccade.jspsych.org/guides/hosting-the-assets)).
- **Saving data.** Data is only downloaded to the computer running the game; nothing is sent to a server. Add a server-side save (for example DataPipe) before collecting remotely.
- **Live mode only.** Gaze-contingent opening needs live gaze. On computers too slow for live mode, every box opens by fallback.
