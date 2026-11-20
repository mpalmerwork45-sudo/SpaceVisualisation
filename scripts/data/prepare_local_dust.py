"""Resample the Edenhofer et al. 1.25 kpc dust map into the browser's texture.

Requires numpy, astropy and astropy-healpix. See public/data/local-dust.md for
the pinned source, coordinate system, units and decoding.
"""

import argparse
import hashlib
from pathlib import Path

import numpy as np
import astropy.units as u
from astropy.io import fits
from astropy_healpix import HEALPix


WIDTH, HEIGHT, DEPTH = 256, 128, 64
SAMPLES = 8  # quadrature points along each angular axis of a target pixel
EDGES_PC = np.geomspace(69.0, 1250.0, DEPTH + 1)
TAU_PER_E = 2.8 * np.log(10.0) / 2.5  # paper section 7, A(540 nm) = 2.8 E
TARGET = Path(__file__).resolve().parents[2] / "public/data/local-dust-edenhofer.bin"


def angular_footprints(healpix):
    """Indices of equal-solid-angle sample points in each output texel."""
    fraction = (np.arange(SAMPLES) + 0.5) / SAMPLES
    lon = (np.arange(WIDTH)[:, None] + fraction) * (2 * np.pi / WIDTH)
    sin_edges = np.sin(np.linspace(-np.pi / 2, np.pi / 2, HEIGHT + 1))
    sin_lat = sin_edges[:-1, None] + np.diff(sin_edges)[:, None] * fraction
    lat = np.arcsin(sin_lat)
    return healpix.lonlat_to_healpix(
        lon[None, :, None, :] * u.rad, lat[:, None, :, None] * u.rad
    ).astype(np.int32)


def rebin(hdus):
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
    boundaries = raw_edges.astype(np.float64)
    footprints = angular_footprints(HEALPix(nside=256, order="nested"))
    result = np.empty((DEPTH, HEIGHT, WIDTH), dtype=np.float64)
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
    return result, reference_column


def encode_and_validate(density, reference_column):
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
    print(f"Peak density {density.max():.4f} per kpc, highest byte {encoded.max()}")
    print(f"Median / 99th percentile fractional column error (tau > 0.05): {np.quantile(fractional, [0.5, 0.99])}")
    if np.quantile(fractional, 0.99) > 0.02:
        raise ValueError("Quantization introduced unexpectedly large column errors")
    for label, lon, lat in [("Coalsack", 303, -1), ("Cygnus", 78, 2), ("Galactic centre", 0, 0), ("High latitude", 303, 55)]:
        x = int((lon % 360) / 360 * WIDTH)
        y = int((lat + 90) / 180 * HEIGHT)
        profile = decoded[:, y, x]
        peak = np.argmax(profile)
        print(f"{label} pixel ({x}, {y})  native/decoded τ = "
              f"{reference_column[y,x]:.5f} / {column[y,x]:.5f}, "
              f"peak layer [{EDGES_PC[peak]:.1f}, {EDGES_PC[peak + 1]:.1f}] pc")
    return encoded.tobytes(order="C")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Edenhofer v1.0.2 mean_and_std_healpix.fits")
    parser.add_argument("--output", type=Path, default=TARGET)
    args = parser.parse_args()
    with fits.open(args.source, memmap=True) as hdus:
        data = encode_and_validate(*rebin(hdus))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(data)
    print(f"{hashlib.sha256(data).hexdigest()}  {args.output}")


if __name__ == "__main__":
    main()
