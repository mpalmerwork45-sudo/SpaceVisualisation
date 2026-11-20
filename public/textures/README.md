# Texture credits

## Milky Way panorama

`milky-way-eso0932a.jpg` is the unmodified 6000 × 3000 large JPEG of
**The Milky Way panorama**, image eso0932a.

- Credit: **ESO/S. Brunier**
- Source: https://www.eso.org/public/images/eso0932a/
- Download: https://cdn.eso.org/images/large/eso0932a.jpg
- Licence: Creative Commons Attribution 4.0 International
  https://creativecommons.org/licenses/by/4.0/
- ESO usage terms: https://www.eso.org/public/outreach/copyright/

The application displays the credit and licence links beside the sky.
The image is bundled locally, so sky loading does not contact ESO at runtime.

Projection: Galactic equirectangular, centre longitude 0° at image centre,
longitude increasing to the left and north at the top. The renderer maps
+X to u=0.5, -Z to u=0.25 and +Y to v=1.
The Magellanic Clouds appear below and to the right of the centre.

This is a processed photographic mosaic, not calibrated surface photometry
or a 3D model of dust. Its colour and detail represent photographic exposure.
It contains background stars and objects (and some planets present during
capture); catalogue overlays retain their independent positions and selection.

## Earth surface

`earth-blue-marble-july.jpg` is a 2048 × 1024 copy of the July 2004
cloud-free Blue Marble Next Generation base map. Reto Stöckli, NASA Earth
Observatory, produced the original composite. The 5400 × 2700 global JPEG
was downsampled and recompressed for interactive rendering.
[NASA Earth Observatory base maps](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/).

The local texture wraps eastwards from the antimeridian, with north at the
top. The planet shader adds sunlight, ocean glint and a procedural cloud deck.

## Mars, Jupiter and Pluto

- `mars-viking.jpg` uses the 1440 × 720 Viking mosaic processed by USGS
  and distributed by NASA/JPL-Caltech. [Mars image texture](https://science.nasa.gov/3d-resources/mars/).
- `jupiter-voyager.jpg` uses the 720 × 360 Voyager mosaic from JPL/Caltech.
  The material mutes the yellow cast of the original mosaic and lights it
  from Sol. Storm positions and belt patterns show the source epoch.
  [Jupiter image texture](https://science.nasa.gov/3d-resources/jupiter/).
- `pluto-vtad.jpg` is the base-colour layer of the NASA Visualization
  Technology Applications and Development Pluto model, downsampled from
  4096 × 2048 to 1536 × 768. Detail varies with the imaging coverage in
  the source model. [Pluto 3D model](https://science.nasa.gov/resource/pluto-3d-model/).

The three JPEGs retain the north-up cylindrical layout of their source
textures. Mars places Syrtis Major east of the central meridian. On Pluto,
Sputnik Planitia lies near the antimeridian. The Jupiter mosaic retains its
original seam and illustrates the globe's spin without tracking individual
storms to present-day longitudes.
