# Galaxy rendering notes

The renderer treats a galaxy as an extended celestial source with depth,
stellar emission and dust absorption.

## Coordinate and angular model

- Catalogue positions are stored as ICRS/J2000 right ascension (hours) and
  declination (degrees).
- The published ICRS-to-Galactic rotation matrix is used for Galactic
  longitude/latitude. The inverse is its orthogonal transpose.
- In Galactic-aligned mode the background frame is the identity: `+X` is
  `l=0°, b=0°` (the central bulge), `+Y` is the north Galactic pole, and `-Z`
  is `l=90°`. Center Galactic Bulge turns toward the centre from the current
  observer position, preserving the orbit anchor, radius, frame and field of view.
- Ecliptic alignment uses the J2000 obliquity (23.439281°) with the renderer's
  `+Y = north` convention.
- Each galaxy’s disc is inclined in a tangent frame whose major axis follows the
  catalogue position angle, measured east of celestial north.
- In the realistic sky mode the image diameter is
  `2 * R * tan(apparent_diameter / 2)`, so changing the shell radius does not
  change an object's apparent angular size.

## Appearance model

`GalaxyAppearance` stores morphology, angular major/minor extents, position
angle, inclination, physical diameter, V-band apparent magnitude, bulge/Sérsic
parameters, arm pitch/contrast, dust opacity and a source note. The current
catalogue values are deliberately explicit and test their physical
diameter/distance consistency; they are suitable visual inputs, not a claim
that every isophotal definition is identical across surveys.

The shader integrates 36 segments along the sightline through an inclined
ellipsoid. The observed axis ratio and inclination determine its polar depth.
A rounder Sérsic-like bulge sits inside a thicker disc of old stars. Young
stars, ionized gas and dust occupy thinner layers. Each galaxy has a cached
256 × 256 density map for those four components. Mipmapping blends small
associations together as their apparent size falls below a pixel. Integrated
V magnitude and the catalogue's angular area set the brightness scale.

Andromeda's dust lanes come from Draine et al.'s infrared dust-mass and
uncertainty maps. The renderer deprojects each measured column into the disc,
places the northwestern edge toward Sol, and distributes the dust vertically
with an assumed exponential scale height. A confidence weight fades into the
procedural disc where the observations lose sensitivity. Fine filaments
redistribute the measured column below the map's resolution. The strongest
ring falls at 11–12 kpc. [Data and conversion](../public/data/andromeda-dust.md)

Triangulum has looser arms dotted with star-forming regions. Sombrero's dust
ring crosses its bright central bulge.
The Large Magellanic Cloud has a displaced bar, and the Small Magellanic Cloud
has an extended wing. The ray marcher follows absorption through each layer as
the observer orbits the galaxy. Observational references include
[Andromeda's dust ring](https://svs.gsfc.nasa.gov/30990/) and
[Triangulum's star-forming regions](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-33/).

Each galaxy uses a single volume for angular and close orbital views. Ray
integration uses the camera’s local position, including views from inside the
volume. Presentation uses premultiplied alpha with relative surface brightness.
The other galaxies use catalogue extents and orientations with procedural
internal structure.

## Observation and asset pipeline

The default `darkAdaptedEye` exposure is intentionally conservative. The UI
exposure button switches to `enhancedOptical` for a brighter inspection view.
It adjusts tone mapping and the galaxy radiance uniforms.

Search for **Milky Way** to orbit the full Galactic disc. The view starts
32 kpc above its centre on landscape screens and fits to the width on
portrait screens.
Search for **Coalsack** or **Cygnus Rift** to view either dark cloud from Sol.
These viewpoints select Enhanced Exposure and the live volume.

The Milky Way shader integrates 96 segments of stellar emission and
wavelength-dependent absorption along each sightline. Seven spiral-arm
segments follow the fitted locations, pitch changes, widths and azimuth
ranges in Reid et al.'s maser parallax study. A lower-contrast spiral model
continues beyond the observed segments on the far side. Procedural dust
lanes branch along the arm ridges, and young stellar associations and ionized
gas add structure within the thin disc. The bar and older stellar disc
provide broad emission behind the arms. The procedural detail is fixed in
Galactocentric coordinates so it stays in place as the camera moves.
[Arm parameters, Table 2](https://arxiv.org/abs/1910.03357)

The integration runs into a half-resolution, linear half-float HDR framebuffer.
The full-resolution sky presentation applies observation response and tone
mapping once. The renderer caches the integration for a given camera pose,
projection, physical observer position, coordinate frame, drawing-buffer size
and set of loaded surveys. Presentation reuses the same integration at
different exposures. Photo mode skips the integration.
For steep views from above/below the disc, 64 of the 96 samples concentrate
within 1.5 kpc of the midplane to resolve its thin absorbing layer.

In linear navigation the observer position is transformed back into Galactic
coordinates in kpc. Rays intersect the model's bounding volume, so views from
outside the Galaxy work too. Logarithmic and angular-sky modes use Sol's
physical sightlines.
The local dust density comes from Edenhofer et al.'s three-dimensional
extinction reconstruction, from 69 to 1,250 pc around Sol. The all-sky
volume has 64 radial shells. A worker adds deterministic structure in Galactic
coordinates and preserves each parent cell's area-weighted mean density.
Higher-resolution volumes for the Coalsack and Cygnus Rift sample the native
survey at about 0.22° and retain all 64 distances. The renderer blends the
regional volumes into the all-sky data at their edges.
[Survey credit, reconstruction and error measurements](../public/data/local-dust.md)

The stellar light and the 100,000 finite-distance synthetic stars sample the
same local volume. From Sol, the renderer reads cumulative extinction out to
each source. Elsewhere, it intersects the radial shells between that source
and the observer. The analytic dust model supplies the Galactic material
outside the reconstruction and the initial sky while the assets load.
Catalogue magnitudes already include foreground extinction.

Galaxy: Render / Photo switches to the bundled 6000 × 3000 ESO/S. Brunier
photographic reference. The JPEG is fetched locally only on first selection;
switching back retains it for reuse. Credit and CC BY 4.0 links appear in
photo mode. Provenance is in `public/textures/README.md`. Synthetic background
stars are hidden in photo mode. Both sky shells follow the camera.

Realistic Sky selects observer-centred angular geometry, hides the grid and
selects Eye Exposure. Eye Exposure reduces diffuse radiance and mutes procedural
Milky Way colour; Enhanced Exposure restores brighter photographic-style colour.
Procedural diffuse nebulae use the same nearly monochrome eye-mode convention.
In the physical map, the apparent area of the Sun and nearby illuminated
planets reduces Eye Exposure. Sensitivity recovers more slowly as bright objects
leave the view. The brightness estimate uses the displayed bodies and an
approximate planetary phase. Enhanced Exposure stays fixed. Photo mode retains
its photographed colour under either exposure.

Catalogue stars in the angular sky omit Sol (the observer), rather than placing
it at its placeholder catalogue coordinates. Eye exposure has an illustrative
V-magnitude limit of 6.5; enhanced exposure extends it to 14. Relative stellar
light follows the magnitude/flux relation with bright-end display compression,
and eye colour is muted. Invisible stars have no pickable geometry or labels.
The physical/logarithmic maps retain all catalogue navigation markers; searching
for a faint star still opens its information and explains the visibility limit.
These conventions are not physiological or telescope calibrations.
The catalogue uses one point buffer for unresolved stars and a separate marker
for Sol. Screen-space picking uses the same pixel radii as the star draw.

Changing coordinate alignment transforms the current and target camera anchors,
orbit directions, up vector and all planetary/orbital geometry together, preserving
physical position, heading and zoom. Selection actions resolve catalogue IDs in
the current mode and frame. Switching modes reframes the focused catalogue object
at the new distance or angular scale. Spectral filters persist through rebuilds. Explicit search reveals
a filtered-out star by clearing the incompatible filter. Brown dwarfs group L/T/Y.

Startup and the Sol Planetary Zoom preset centre on Sol at 0.0003 ly (~19 AU),
looking directly toward the Galactic centre (l=0°, b=0°). The scene remains
ecliptic-aligned for planetary orbits; the camera direction is transformed into
that frame. Startup applies the pose before rendering, without a glide from
another orientation. The separate Galactic Pole top-view preset is unchanged.

## Deep-space object forms

Each of the seven nebula entries has a distinct emission and absorption field.
Orion has an open cavity and an illuminated gas front. Dense pillars absorb
light in the Eagle, and a dust rift crosses the bubbles in Carina. The Ring
has a hollow barrel, the Helix has shells in different planes, and the Crab
has filaments surrounding a diffuse core. Illuminated dust sheets give the
Pleiades their blue reflection nebulosity. The Galactic nucleus entry shows
the compact nuclear star cluster around Sagittarius A*. Its illustrative
light profile uses a 4.2 pc projected half-light radius and an axis ratio
of 0.71 from infrared measurements. [Nuclear cluster measurements](https://doi.org/10.1051/0004-6361/201423481)

The renderer samples these illustrative structures along the viewer's sightline.
The Ring Nebula's long axis is set to 60° east of north following the published
[optical model of the main ring](https://www.spacetelescope.org/static/archives/releases/science_papers/heic1310a.pdf).
Compact illuminators use an analytic profile so that a small change in angle
does not move a star between gas samples. Search initially shows a nebula or
galaxy from Sol's viewing direction and fits its extent to the shorter viewport
dimension. Drag in either 3D map to inspect the shape from another angle.
Catalogue stars remain unresolved points when narrowing the field of view.
Sky-object inspection can narrow below one degree to resolve compact nebulae.

Above / Level / Below change the orbit elevation around the current focus,
preserving distance and heading. The logarithmic field-of-view slider ranges
from 0.05° for compact-object inspection to 90° for wide views, independently
of orbit distance. In Realistic Sky, the observer stays at Sol and the wheel and
pinch controls change the field of view. Turn 180° reverses the sightline in place.

## Planet inspection

Earth, Mars, Jupiter and Pluto have locally bundled image maps. Earth adds ocean
glint and a separate moving cloud layer that casts shadows on the surface.
The globe shader samples the cloud layer along each sightline. A thin outer
shell completes the silhouette, keeping the clouds stable at close range.
Each map loads when its planet first reaches 24 drawing-buffer pixels across.
The other planets use procedural materials. Mercury's craters alter the lighting
at grazing angles. Saturn's rings have gaps and varying opacity and cast a
shadow across the oblate globe. The globe in turn shadows the rings. Inspection
opens at an oblique angle to the sunlight so the terminator is visible.
Image sources, resolutions and credits are listed in the [texture notes](../public/textures/README.md).

Equatorial and polar radii set each figure's flattening. The selected date sets
the surface orientation using a fixed pole and constant spin rate. Imagery and
displayed weather are illustrative for other epochs. Rotation omits precession
and periodic corrections. The figure and rotation constants come from the
[JPL planetary constants kernel](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc).

Planet navigation and non-overlapping labels open a sunlit inspection view with
diameter, orbital period, inclination and current computed heliocentric distance.
The date in the Solar System bar opens the UTC date and playback controls. The
clock starts paused at the present date. Play advances the approximate Keplerian
orbits at the selected number of days per second. Today pauses at the present
date. Planet positions, illumination, Saturn’s ring shadow and the inspection
camera update as the date changes. Visual radii are enlarged and compressed in
ratio for legibility. Pluto is labelled as a dwarf planet. Background star
labels are suppressed at planetary scale.

## Validation

Run:

```sh
npm run test:run
npm run build
npx tsc --noEmit
```

The tests cover Galactic-centre and pole anchors, ecliptic sign, transform
round trips, tangent-frame orthonormality, angular-size projection, catalogue
schema/uniqueness, physical galaxy diameter checks, orbit-camera direction,
background-frame alignment, extended-source surface photometry, transparent
and opaque radiative-transfer limits, subdivision invariance, observer/frame
conversion, HDR-cache invalidation, render-state restoration and disposal.

The interaction regression suite uses Playwright and a Vite dev server:

```sh
npm run dev -- --host 127.0.0.1 --port 5179
# In a second terminal, with Playwright Chromium installed:
npm run test:browser
# Or use an existing Chrome installation:
CHROME_PATH=/usr/bin/google-chrome npm run test:browser
```

Set `AUDIT_URL` for a different server and `AUDIT_OUTPUT` for a different output
directory (default `/tmp/space-visualisation-regression`). The suite checks
coordinate/selection/filter consistency, magnitude visibility, selective picking,
planet controls, keyboard/pointer/touch interactions, GPU resource stability,
actual WebGL context recovery, and layouts from 320 to 1920 pixels wide. It saves
interactive layout screenshots, a JSON report and three labelled catalogue
contact sheets (`planets.png`, `galaxies.png` and `nebulae.png`). The sheets use
Enhanced Exposure against black. The suite instruments the engine through the
Vite dev server.

### Survey comparisons

The browser audit also saves `milky-way.png` from the exterior search view
and `survey-sky.png` from matched camera headings at Sol, 35 pc sideways and
350 pc along the Coalsack sightline. Its JSON report includes the following
independent comparisons.

- **Planck**. The 96 × 64 reference tile uses the Planck Collaboration's GNILC
  353 GHz dust opacity from release R2.01. The audit registers it to the same
  perspective rays as the local volume. Each column image uses its own log
  stretch. The Planck column includes the whole Galaxy, while Edenhofer's
  column ends at 1.25 kpc. Their spatial correlation is modest across this
  field. The report separately records the correlation with diffuse light,
  which also depends on the distribution of emitting stars.
  [Planck analysis](https://arxiv.org/abs/1605.09387) ·
  [IRSA map and FITS header](https://irsa.ipac.caltech.edu/data/Planck/release_2/all-sky-maps/previews/COM_CompMap_Dust-GNILC-Model-Opacity_2048_R2.01/header.txt)
- **Gaia**. Ten fixed half-degree-radius apertures use the sum of observed
  G, BP and RP flux for sources with G between 8 and 20 and positive BP and
  RP flux. ESA's Gaia mission and its Data Processing and Analysis Consortium
  (DPAC) supplied these measurements through the AIP archive. The audit
  compares relative green brightness and blue/red colour in linear model
  radiance. The renderer uses illustrative RGB passbands and relative
  brightness, with Gaia serving as an observational comparison.
  [Gaia DR3 source data and attribution](https://doi.org/10.17876/gaia/dr.3/1)
- **Foreground stars**. The audit renders the same synthetic point at 120 pc
  and 350 pc toward the Coalsack, holding its intrinsic display flux fixed.
  The more distant point dims behind the cloud.

The two reference files live under `scripts/data/references`. They are used
offline by the browser checks. To rebuild them, use Python 3.11 or later with
NumPy, Astropy and astropy-healpix. Download the Planck FITS from the `source`
URL in `planck-coalsack.json` and run these commands.

```sh
python scripts/data/prepare_sky_references.py planck /path/to/COM_CompMap_Dust-GNILC-Model-Opacity_2048_R2.01.fits
python scripts/data/prepare_sky_references.py gaia
```

For repeatable visual/performance checks, run Vite and a local Chrome instance
with remote debugging on port 9222, then:

```sh
node --experimental-websocket scripts/render-audit.mjs /tmp/sky-current
node --experimental-websocket scripts/render-audit.mjs /tmp/sky-baseline --baseline
```

The audit captures centre, anticentre, Cygnus, pole, enhanced and photo views at
1280 × 800, records browser errors, and measures the isolated diffuse-sky pass
with synchronous pixel readback. Baseline mode installs the previous shader
from commit `0dc4605` into the running page without modifying the checkout.
These measurements include readback and are not whole-application FPS.
