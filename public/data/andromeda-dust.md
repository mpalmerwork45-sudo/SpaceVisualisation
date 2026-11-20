# Andromeda dust lanes

The face-on map in `andromeda-dust.bin` describes Andromeda's V-band dust optical depth and the support for that estimate. The source is the projected dust mass per unit sky area inferred by Draine et al. from infrared observations. The two SPIRE 350 products share a 24.9 arcsecond beam and 10 arcsecond pixels. [Survey and data products](https://www.astro.princeton.edu/~draine/m31dust/m31dust.html) · [Published analysis](https://doi.org/10.1088/0004-637X/780/2/172)

To reproduce the asset, download the [dust surface density](https://www.astro.princeton.edu/~draine/m31dust/M31_S350_110_SSS_110_Model_All_SurfBr_Mdust.fits.gz) and its [reported uncertainty](https://www.astro.princeton.edu/~draine/m31dust/M31_S350_110_SSS_110_Model_All_SurfBr_Mdust_unc.fits.gz) into one directory. From the repository root, run the following with NumPy, SciPy and Astropy available.

```sh
python scripts/data/prepare_andromeda.py /path/to/fits
```

The script checks both input SHA-256 digests and their common FITS world coordinate system. It projects each face-on cell into ICRS at 16 subcell positions. The model centre is RA 10.68°, Dec +41.27°, its major axis is 190 arcminutes across at position angle 38° east of north, and its inclination is 77°. Positive disc x points northeast and positive disc y lies on the more distant southeast side. The northwest side is closer to the observer. [Near-side measurements and references](https://subarutelescope.org/staff/miye/SpinParityArxiv20191023B.pdf)

Each mass column in solar masses per square kiloparsec is multiplied by the absolute cosine between the local sightline and disc normal. Equation 7 of Draine et al. gives 0.74 magnitudes of V-band extinction per 100,000 solar masses per square kiloparsec. The conversion to normal optical depth includes a factor of ln(10)/2.5. We divide by a further 2.5 as an approximate empirical calibration from independent PHAT stellar reddening measurements. This last factor represents a galaxy-wide average with spatial variation. [Infrared dust model](https://doi.org/10.1088/0004-637X/780/2/172) · [PHAT extinction analysis](https://authors.library.caltech.edu/records/8c3fm-yv019)

Support rises smoothly between signal-to-noise ratios of 1.5 and 4. Missing samples and unusable errors receive zero weight. The weight fades from 16.5 to 18 kpc near the edge of reliable measurements. The 384 × 384 map spans the model's 42.3 kpc diameter. Its strongest azimuthally averaged dust ring falls at 11–12 kpc, comparable to the 11.2 kpc ring reported in the survey. [Radial profile and survey limits](https://doi.org/10.1088/0004-637X/780/2/172)

The eight-byte little-endian header consists of the four ASCII bytes `M31D`, a uint16 version (1), and a uint16 width (384). Two row-major planes follow, ascending from negative disc y, with x changing fastest. The first stores binary16 normal V optical depths. The second stores uint8 support, scaled from 0 to 255. The file is 442,376 bytes and its SHA-256 is `786515caa8c9e24f80d0bb52155939c50c5085a22402e835d0a30e39d353483b`.

During rendering the engine gives each measured column a thin exponential vertical profile and conserves its optical depth when adding procedural filaments below the atlas resolution. It blends the analytic dust field into regions with limited support. Young-star colours and emission knots adjacent to the lanes are illustrative. The source maps constrain projected dust mass, while the vertical distribution and subcell structure are model assumptions.
