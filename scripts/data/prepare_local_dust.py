"""Resample the Edenhofer et al. 1.25 kpc dust map into the browser's texture.

Requires numpy, astropy and astropy-healpix. See public/data/local-dust.md for
the pinned source, coordinate system, units and decoding.
"""

import argparse
import hashlib
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import astropy.units as u
from astropy.io import fits
from astropy_healpix import HEALPix


DEPTH = 64
SAMPLES = 8  # quadrature points along each angular axis of a target pixel
EDGES_PC = np.geomspace(69.0, 1250.0, DEPTH + 1)
TAU_PER_E = 2.8 * np.log(10.0) / 2.5  # paper section 7, A(540 nm) = 2.8 E
TARGET = Path(__file__).resolve().parents[2] / "public/data/local-dust-edenhofer.bin"
CLOUD_TARGET = TARGET.with_name("local-dust-clouds.bin")


@dataclass(frozen=True)
class Field:
    name: str
    width: int
    height: int
    lon_min: float
    lon_max: float
    lat_min: float
    lat_max: float


ALL_SKY = Field("All sky", 256, 128, 0, 360, -90, 90)
# Region order is also the order of the 64-layer slabs in the cloud asset.
CLOUDS = (Field("Coalsack", 128, 96, 288, 316, -12, 8),
          Field("Cygnus Rift", 128, 96, 64, 92, -8, 12))


def angular_footprints(healpix, field):
    """Indices of equal-solid-angle sample points in each output texel."""
    fraction = (np.arange(SAMPLES) + 0.5) / SAMPLES
    step = np.deg2rad(field.lon_max - field.lon_min) / field.width
    lon = np.deg2rad(field.lon_min) + (np.arange(field.width)[:, None] + fraction) * step
    sin_edges = np.sin(np.linspace(np.deg2rad(field.lat_min), np.deg2rad(field.lat_max), field.height + 1))
    sin_lat = sin_edges[:-1, None] + np.diff(sin_edges)[:, None] * fraction
    lat = np.arcsin(sin_lat)
    return healpix.lonlat_to_healpix(
        lon[None, :, None, :] * u.rad, lat[:, None, :, None] * u.rad
    ).astype(np.int32)


def read_release(hdus):
    mean = hdus["MEAN"]
    if mean.header["ORDERING"] != "NEST" or mean.header["NSIDE"] != 256:
        raise ValueError("Expected the released nested NSIDE=256 survey map")
    raw = mean.data
    raw_edges = hdus["RADIAL PIXEL BOUNDARIES"].data.field(0)
    # Verify the two specific FITS data blocks used by the atlas. This also
    # catches incomplete media and partial downloads with empty shells.
    if hashlib.sha256(raw).hexdigest() != "05e3490d1b56761280d8e6a4e7188059cd7501e8d66e8a79ed888ba8015c3095":
        raise ValueError("Mean density data does not match the pinned Edenhofer release")
    if hashlib.sha256(raw_edges).hexdigest() != "b970a0cee003ba0ec227f9c3b9d283ca7af78e87be93a3bb2daefb591108a89d":
        raise ValueError("Radial boundaries do not match the pinned Edenhofer release")
    return raw, raw_edges.astype(np.float64)


def prepare_field(raw, boundaries, field):
    healpix = HEALPix(nside=256, order="nested")
    footprints = angular_footprints(healpix, field)
    # A small region only needs its own HEALPix columns from the full survey.
    if field != ALL_SKY:
        occupied, remap = np.unique(footprints, return_inverse=True)
        raw = raw[:, occupied]
        footprints = remap.reshape(footprints.shape)
    result = np.empty((DEPTH, field.height, field.width), dtype=np.float64)
    # A native sightline integrated independently through the released radial
    # shells checks both the rebinning and the back-conversion of the texture.
    column = np.zeros(raw.shape[1], dtype=np.float64)
    weights = np.maximum(0, np.minimum(boundaries[1:], EDGES_PC[-1]) - np.maximum(boundaries[:-1], EDGES_PC[0]))
    for i, shell in enumerate(raw):
        column += shell.astype(np.float64) * weights[i]
    reference_column = column[footprints].mean(axis=(2, 3)) * TAU_PER_E

    for z, (lo, hi) in enumerate(zip(EDGES_PC[:-1], EDGES_PC[1:])):
        overlap = np.minimum(hi, boundaries[1:]) - np.maximum(lo, boundaries[:-1])
        averaged = np.zeros(raw.shape[1], dtype=np.float64)
        for i in np.flatnonzero(overlap > 0):
            averaged += raw[i] * (overlap[i] / (hi - lo))
        # Each published shell contains E_ZGR per parsec. The renderer uses
        # differential V-band optical depth per kpc.
        result[z] = averaged[footprints].mean(axis=(2, 3)) * (1000 * TAU_PER_E)
    if not np.isfinite(result).all() or np.min(result) < 0:
        raise ValueError("Invalid differential extinction in survey")
    encoded, decoded_column = encode_and_validate(result, reference_column, field)
    if field != ALL_SKY:
        validate_cloud_projection(healpix, occupied, column * TAU_PER_E, decoded_column, field)
    return encoded


def encode_and_validate(density, reference_column, field):
    encoded = np.rint(np.log2(1 + density / 0.125) * (255 / 12))
    if encoded.max() > 255:
        raise ValueError(f"Texture would clip peak density {density.max():.3f} per kpc")
    encoded = encoded.astype(np.uint8)
    decoded = 0.125 * np.expm1(encoded.astype(np.float64) * (12 * np.log(2) / 255))
    widths_kpc = np.diff(EDGES_PC)[:, None, None] / 1000
    if not np.allclose((density * widths_kpc).sum(axis=0), reference_column, rtol=1e-6, atol=1e-7):
        raise ValueError("Rebinning failed to conserve the native line-of-sight columns")
    column = (decoded * widths_kpc).sum(axis=0)
    dusty = reference_column > 0.05
    fractional = np.abs(column[dusty] / reference_column[dusty] - 1)
    print(f"{field.name}: peak density {density.max():.4f} per kpc, highest byte {encoded.max()}")
    print(f"Median / 99th percentile fractional column error (tau > 0.05): {np.quantile(fractional, [0.5, 0.99])}")
    if np.quantile(fractional, 0.99) > 0.02:
        raise ValueError("Quantization introduced unexpectedly large column errors")
    for label, lon, lat in [("Coalsack", 303, -1), ("Cygnus", 78, 2), ("Galactic centre", 0, 0), ("High latitude", 303, 55)]:
        if not (field.lon_min <= lon < field.lon_max and field.lat_min <= lat < field.lat_max):
            continue
        x = int((lon - field.lon_min) / (field.lon_max - field.lon_min) * field.width)
        y = int((lat - field.lat_min) / (field.lat_max - field.lat_min) * field.height)
        profile = decoded[:, y, x]
        peak = np.argmax(profile)
        print(f"{label} pixel ({x}, {y})  native/decoded τ = "
              f"{reference_column[y,x]:.5f} / {column[y,x]:.5f}, "
              f"peak layer [{EDGES_PC[peak]:.1f}, {EDGES_PC[peak + 1]:.1f}] pc")
    return encoded.tobytes(order="C"), column


def validate_cloud_projection(healpix, native_ids, native_columns, image, field):
    """Sample the encoded cloud column at the original HEALPix centres."""
    lon, lat = healpix.healpix_to_lonlat(native_ids)
    lon, lat = lon.deg, lat.deg
    # The runtime mixes in the all-sky atlas along this peripheral strip.
    interior = ((lon > field.lon_min + 1.4) & (lon < field.lon_max - 1.4) &
                (lat > field.lat_min + 1.4) & (lat < field.lat_max - 1.4))
    x = (lon[interior] - field.lon_min) * field.width / (field.lon_max - field.lon_min) - 0.5
    y = (lat[interior] - field.lat_min) * field.height / (field.lat_max - field.lat_min) - 0.5
    ix, iy = x.astype(int), y.astype(int)
    dx, dy = x - ix, y - iy
    lower = image[iy, ix] * (1 - dx) + image[iy, ix + 1] * dx
    upper = image[iy + 1, ix] * (1 - dx) + image[iy + 1, ix + 1] * dx
    projected = lower * (1 - dy) + upper * dy
    native = native_columns[interior]
    rms = np.sqrt(np.mean((projected - native) ** 2))
    correlation = np.corrcoef(projected, native)[0, 1]
    print(f"Native-pixel check across {len(native)} sightlines: RMS tau error {rms:.4f}, r={correlation:.4f}")
    if not correlation > 0.99:
        raise ValueError("Projected cloud structure disagrees with the native HEALPix columns")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Edenhofer v1.0.2 mean_and_std_healpix.fits")
    parser.add_argument("--clouds", action="store_true", help="prepare the two native-resolution cloud regions")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    target = args.output or (CLOUD_TARGET if args.clouds else TARGET)
    fields = CLOUDS if args.clouds else (ALL_SKY,)
    with fits.open(args.source, memmap=True) as hdus:
        raw, boundaries = read_release(hdus)
        data = b"".join(prepare_field(raw, boundaries, field) for field in fields)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    print(f"{hashlib.sha256(data).hexdigest()}  {target}")


if __name__ == "__main__":
    main()
