# Procedural rendering audit — 25 September 2026

## Interaction audit follow-up — 8 October 2026

The ten interaction/data/resource findings were repaired and exercised with unit
tests and `scripts/audit-regression.mjs` against Chrome/SwiftShader. The checks
cover coordinate-frame consistency; action-time selection coordinates; realistic
stellar visibility; persistent filters and catalogue-wide search; selectable-only
picking; responsive controls and bounded scrolling detail panels; WebGL recovery;
engine-driven UI state and keyboard/pointer/touch input; constellation references;
and Solar System resource disposal. The new constellation astrometry and V
magnitudes are linked to CDS/SIMBAD directly in the catalogue and object panels.

The headless browser deliberately lost and restored its WebGL context: the
sampled sky pixel returned exactly to `[141, 90, 45, 255]`. Five Solar System
rebuilds left the allocated geometry count unchanged at 25 after warming the
tested camera view (resources are allocated lazily for visible objects).
The alignment residual for Earth's position was below `1e-9 AU`, and modal
re-centring after changing mode/frame had zero position error. Layouts were
checked at 320, 390, 768, 1280 and 1920 pixels. These are interaction correctness
checks, not claims about mobile GPU performance or improved scientific fidelity.

Final validation passed 54 unit tests and 85 browser assertions, along with the
TypeScript check and production build. The existing large-bundle build warning
and three development-dependency audit advisories were outside these ten fixes.

The earlier rendering limitations below still apply.

## Original rendering comparison

The implementation was compared in the browser against the previous shader
(`0dc4605`) and the bundled ESO/S. Brunier panorama. The photo is a structural
reference, not a target for naked-eye brightness or absolute colour calibration.

## Changes checked

- Distinct, tapered central bulge; absorbing foreground structure rather than
  a noise multiplier across luminous sky; darker, near-monochrome eye response.
- A physical observer uniform in Galactic kpc. The centre, anti-centre,
  Cygnus, north pole and a view from 80,000 ly above the disc were inspected.
  Looking away from the bounding volume returned black `[0, 0, 0, 255]`.
- Independent bulge/disc projection and a single galaxy surface, without the
  double dimming of faint outskirts or an extra brightening layer on approach.
- Andromeda, Orion, Ring and Crab close-ups compiled and rendered successfully.
  Planetary-nebula rims and central illuminators were also inspected.
- Eye/enhanced response, Render/Photo switching and the unchanged close-Sol
  startup were captured. The final browser run reported no errors.

## Rendering cost

Chrome headless, ANGLE/Vulkan **SwiftShader (software rendering)**, 1280 × 800,
device pixel ratio 1. These are isolated diffuse-sky pass times, not application
FPS or hardware-GPU timings. Four warmups precede ten measured draws; each
measurement includes synchronous pixel readback so GPU work cannot be hidden
in the command queue.

| Median time | Previous shader | Revised shader |
| --- | ---: | ---: |
| Unchanged view | 356 ms | 10 ms |
| Small camera turn each draw | 351 ms | 217 ms |

The expensive integration has 96 samples instead of 40, but runs at half the
linear resolution. Unchanged views reuse their HDR radiance buffer. The final
moving-view run therefore used about 38% less time on this software backend.
Exposure changes reuse radiance; actual camera/projection/frame/size changes
invalidate it. No inference about real-device frame rates should be made from
these numbers.

The repeatable audit command and prerequisites are in
[galaxy-rendering.md](galaxy-rendering.md#validation). It writes screenshots
and a JSON timing/error report to the chosen temporary directory. Final review
artifacts for this run were written to `/tmp/sky-verified`; they are not needed
by the application and are not committed binary assets.

## Model limits

The Milky Way arms, dust shell and nebular filaments use illustrative density
models. Synthetic star depths and galaxy volumes are procedural. The current
eye response approximates adaptation from the visible foreground bodies.
Extended-object blending uses the display-output material pipeline. The
[rendering notes](galaxy-rendering.md) describe the current models and controls.
