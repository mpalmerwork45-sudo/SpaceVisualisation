# Procedural rendering audit — 25 September 2026

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

## Remaining limits

This is a procedural illustration, not a survey reconstruction. Spiral arms
are schematic and overly regular from outside; the local dust complex uses
an approximate shell, not individual measured cloud distances. Synthetic stars
remain a Solar-vantage angular population. External galaxies are projected
surfaces, and individual nebular filaments are not measured structures.
Exposure is a display convention, without luminance calibration, dynamic
adaptation to bright planets, or a complete human-vision model. Blending of
extended objects still uses the existing display-output material pipeline,
not a fully linear HDR compositor for the entire scene.
