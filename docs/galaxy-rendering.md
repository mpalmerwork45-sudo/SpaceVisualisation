# Galaxy rendering notes

The renderer treats a galaxy as an extended celestial source rather than as a
random cloud of point particles.

## Coordinate and angular model

- Catalogue positions are stored as ICRS/J2000 right ascension (hours) and
  declination (degrees).
- The published ICRS-to-Galactic rotation matrix is used for Galactic
  longitude/latitude. The inverse is its orthogonal transpose.
- In Galactic-aligned mode the background frame is the identity: `+X` is
  `l=0°, b=0°` (the central bulge), `+Y` is the north Galactic pole, and `+Z`
  is `l=90°`. Center Galactic Bulge turns toward the centre from the current
  observer position, preserving the orbit anchor, radius, frame and field of view.
- Ecliptic alignment uses the J2000 obliquity (23.439281°) with the renderer's
  `+Y = north` convention.
- Each galaxy gets an orthonormal tangent frame. Its major axis is the
  catalogue position angle, measured east of celestial north; the minor axis
  is the perpendicular tangent direction.
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

The shader combines:

- a Sérsic-like bulge,
- an exponential disk,
- logarithmic spiral arms for spiral/barred spiral morphologies,
- a deterministic value-noise field for irregular structure,
- an optical-depth dust lane (`exp(-tau)`), and
- a mean surface-brightness scale derived from integrated V magnitude and the
  catalogue's elliptical angular area.

It uses premultiplied alpha with normal blending. Galaxies therefore layer as
continuous light sources without the white additive halos produced by the old
random-point implementation. A restrained close-navigation layer is enabled
only in linear physical-distance mode.

## Observation and asset pipeline

The default `darkAdaptedEye` exposure is intentionally conservative. The UI
exposure button switches to `enhancedOptical` for a brighter inspection view;
this changes both the renderer tone mapping and galaxy radiance uniforms.

`MilkyWayBackground` defaults to a live, texture-free fragment shader. Forty
front-to-back samples integrate an exponential thin/thick stellar disc, a
bar-shaped bulge, a schematic four-arm spiral pattern and dust extinction.
Shorter wavelengths attenuate more strongly. Direction-space fractal noise
adds structure without a longitude seam, with approximate foreground cloud
envelopes for the Great Rift, Ophiuchus and Coalsack. The unresolved-star
shader shares the foreground extinction model, and tests against planetary
depth so background stars do not shine through foreground bodies.

The model is informed by the broad anatomy described by
[ESA](https://www.esa.int/ESA_Multimedia/Images/2016/09/Anatomy_of_the_Milky_Way)
and the dust extinction described by
[ESO](https://www.eso.org/public/images/b06/). It is an illustrative Solar-vantage
model, not a reconstruction of measured 3D dust or calibrated surface brightness.
Fine cloud shapes and spiral structure are procedural approximations.

Galaxy: Render / Photo switches to the bundled 6000 × 3000 ESO/S. Brunier
photographic reference. The JPEG is fetched locally only on first selection;
switching back retains it for reuse. Credit and CC BY 4.0 links appear in
photo mode. Provenance is in `public/textures/README.md`. Synthetic background
stars are hidden in photo mode. Both sky shells follow the camera.

Realistic Sky selects observer-centred angular geometry, hides the grid and
selects Eye Exposure. Eye Exposure reduces diffuse radiance and mutes procedural
Milky Way colour; Enhanced Exposure restores brighter photographic-style colour.
This is a display approximation to dark adaptation, not a calibrated simulation
of human vision. A bright foreground planet or Sun does not yet dynamically
change adaptation. Photo mode is dimmed but retains its photographed colour.

Startup and the Sol Planetary Zoom preset centre on Sol at 0.0003 ly (~19 AU),
looking directly toward the Galactic centre (l=0°, b=0°). The scene remains
ecliptic-aligned for planetary orbits; the camera direction is transformed into
that frame. Startup applies the pose before rendering, without a glide from
another orientation. The separate Galactic Pole top-view preset is unchanged.

## Planet inspection

## Deep-space object forms

Nebulae use transparent 3D volumes with front-to-back integration, not square
point sprites. Morphologies distinguish ionised planetary shells, supernova
filaments, reflection clouds and dusty emission regions. The obscured Galactic
nucleus is a faint cloud, not a visible sphere representing the black hole.
These are illustrative models with catalogue positions and angular extents;
small-scale gas structures are not measured reconstructions.

Galaxy surfaces include multiscale stellar texture, clumped arm structure,
offset dust lanes, extinction reddening and restrained star-forming knots.
Catalogue stars remain unresolved points when narrowing the field of view.
Sky-object inspection can narrow below one degree to resolve compact nebulae.

## Planet inspection

Planets have procedural rocky terrain, cloud decks, gas-giant belts, ocean
reflection and atmospheric rim shading. Saturn's ring shader includes radial
structure, a Cassini-like division and the planet's shadow. Planet shading uses
the direction to Sol, not the scene's general ambient lighting. Surface rotation
is illustrative; neither terrain (including Earth coastlines) nor cloud motion
is a measured planetary map or rotational ephemeris.

Planet navigation and non-overlapping labels open a sunlit inspection view with
diameter, orbital period, inclination and current computed heliocentric distance.
Positions use the existing orbital elements; visual radii are enlarged and
compressed in ratio for legibility, explicitly noted in the UI. Pluto is labelled
as a dwarf planet. Background star labels are suppressed at planetary scale.

## Validation

Run:

```sh
npm run test:run
npm run build
```

The tests cover Galactic-centre and pole anchors, ecliptic sign, transform
round trips, tangent-frame orthonormality, angular-size projection, catalogue
schema/uniqueness, physical galaxy diameter checks, orbit-camera direction,
background-frame alignment, and extended-source surface photometry.
