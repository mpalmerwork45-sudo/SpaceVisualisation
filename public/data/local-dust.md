# Local Milky Way dust extinction

The all-sky atlas and two higher-resolution cloud regions use the posterior mean in
*A parsec-scale Galactic 3D dust map out to 1.25 kpc from the Sun*, by Gordian
Edenhofer, Catherine Zucker, Philipp Frank, Andrew K. Saydjari, Joshua S.
Speagle, Douglas Finkbeiner and Torsten Enßlin. The source is the v1.0.2
main reconstruction, `mean_and_std_healpix.fits`. The authors inferred the
field from extinction and distance estimates for 54 million stars.
[Research paper](https://doi.org/10.1051/0004-6361/202347628) ·
[Data release](https://zenodo.org/records/10658339) ·
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Coverage and units

The browser atlas has 256 Galactic longitude cells, 128 latitude cells and
64 logarithmic radial shells between 69 and 1,250 pc from the Sun. Each
voxel represents differential visual optical depth per kpc. The offline
conversion uses the authors' 540 nm visualization calibration
`A_V = 2.8 E_ZGR` and `tau_V = ln(10) A_V / 2.5`.

The input has 516 native radial bins and a nested NSIDE 256 HEALPix sphere
at each distance. Each reduced angular pixel uses 8 × 8 equal-solid-angle
samples. Each radial bin is the path-length-weighted average of overlapping
survey bins, preserving the input column along that footprint. The short
interval between the last native edge (1,248.1 pc) and the nominal 1,250 pc
outer boundary contributes zero survey extinction.

The source authors excluded the inner 69 pc because low-extinction bias
produced an artificial concentration there. The model also loses sensitivity
behind dense clouds where the stellar sample thins. The binary contains the
posterior mean for visualisation. The full release supplies uncertainty
estimates and posterior samples for quantitative analysis.
[Source discussion, sections 6–7 and appendix C](https://www.aanda.org/articles/aa/pdf/2024/05/aa47628-23.pdf)

## Binary layout

The file is a headerless 2,097,152-byte array. Longitude varies fastest,
increasing from 0° to 360°, followed by latitude from −90° to +90°, then
distance outwards. Values represent cell centres. Decode a byte `b` as
`0.125 * (2**(12*b/255) - 1)` in inverse kpc. Longitude wraps across 0°.
For a heliocentric point `(x,y,z)` in the app’s Galactic frame, use
`l = atan2(-z,x)` and `b_lat = asin(y/r)`.

## Coalsack and Cygnus Rift

`local-dust-clouds.bin` retains more of the native survey's angular detail
through all 64 distance shells. Each region has 128 longitude cells and 96
latitude cells, about 0.22° × 0.21° per cell. A native NSIDE 256 HEALPix
pixel has an area equivalent to a square about 0.23° on a side.

| Region index | Galactic longitude edges | Galactic latitude edges |
| --- | --- | --- |
| 0 · Coalsack | 288° to 316° | −12° to +8° |
| 1 · Cygnus Rift | 64° to 92° | −8° to +12° |

The 1,572,864-byte file stores the 64 Coalsack layers first and the 64
Cygnus Rift layers second. Within each layer, longitude increases fastest,
then latitude. The cloud and all-sky files use the same radial boundaries and
byte encoding. They represent the same dust at two angular resolutions. A
renderer can blend between the two estimates at each region's boundary.

Each cloud texel averages 8 × 8 equal-solid-angle samples of the original
HEALPix map. For all 24,576 cloud sightlines the radial reduction preserves
the native integral to floating-point precision. Quantization changes the
column by less than 0.80% at the 99th percentile in both regions, for
directions with optical depth above 0.05.

As a separate spatial check, we evaluated the decoded, bilinearly
interpolated columns at the centres of the original HEALPix pixels at least
1.4° inside each boundary. The reference is the original HEALPix density at
each centre integrated from 69 to 1,250 pc, before the runtime radial taper.

| Region | Native sightlines | All-sky atlas RMS error in τV | Cloud atlas RMS error in τV |
| --- | ---: | ---: | ---: |
| Coalsack | 8,223 | 0.1302 | 0.0321 |
| Cygnus Rift | 8,223 | 0.2654 | 0.0617 |

## Reproduction

The pinned upstream FITS has MD5 `10c823a5fcf81b47b6e15530bcdf54dc`.
Using Python with NumPy, Astropy and astropy-healpix, run from the repository
root after downloading the FITS file.

```sh
python scripts/data/prepare_local_dust.py /path/to/mean_and_std_healpix.fits
python scripts/data/prepare_local_dust.py --clouds /path/to/mean_and_std_healpix.fits
```

The script checks the rebinned column for every direction, reports
quantization errors and prints representative sightline integrals. NumPy
2.3.1, Astropy 8.0.3 and astropy-healpix 2.0.1 produced these SHA-256 hashes.

| File | SHA-256 |
| --- | --- |
| `local-dust-edenhofer.bin` | `81bfa27d5a9a87f2c947f23c5373a0b51d324b51dd88666cf0a947e7f0ca3204` |
| `local-dust-clouds.bin` | `79176180657da0961d7c8927c47c5b48d8684cb5564e0fc74788c7ef2cb81ad4` |

All 32,768 resampled directions conserve the native column within floating
point precision before encoding. For directions with optical depth above
0.05, the R8 encoding changes the column by 0.24% at the median and 1.06%
at the 99th percentile. The peak density is 188.05 per kpc. The following
values are integrated from 69 to 1,250 pc over the angular texel containing
the given sky position. They precede the renderer's edge blending.

| Galactic direction | Native optical depth | Decoded optical depth | Strongest radial shell |
| --- | ---: | ---: | ---: |
| Coalsack (303°, −1°) | 1.326 | 1.327 | 195–205 pc |
| Cygnus (78°, +2°) | 2.217 | 2.225 | 953–997 pc |
| Galactic centre (0°, 0°) | 1.765 | 1.768 | 156–163 pc |
| High latitude (303°, +55°) | 0.069 | 0.069 | 124–130 pc |
