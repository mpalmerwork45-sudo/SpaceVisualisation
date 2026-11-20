"""Bake Draine et al.'s SPIRE 350 maps into M31's face-on disc coordinates.

Requires numpy, scipy, astropy. Pass a directory containing the two original
FITS products listed in public/data/andromeda-dust.md.
"""
import argparse
import hashlib
from pathlib import Path
import struct

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from scipy.ndimage import map_coordinates


STEM = 'M31_S350_110_SSS_110_Model_All_SurfBr_Mdust'
SHA256 = ('10cbe9dec548f6812b8bdb1697effe2cc081f1095fe037b8219ae7e1f1d9917f',
          'dfd97075fe9e7c64002f03a239fc9df36c167931b59018d596a37f1534a4761d')
SIZE = 384
# Match the mesh tangent frame in deepSpace.ts and GalaxyRenderer.ts.
RA, DEC = np.deg2rad([0.712 * 15, 41.27])
PA, INC = np.deg2rad([38, 77])
RADIUS = np.tan(np.deg2rad(190 / 120))
RADIUS_KPC = 138000 / (2 * 3261.563777)


def direction(x, y):
    """Return ICRS sightline and abs(normal · sightline) of each disc sample."""
    major = RADIUS * x
    minor = RADIUS * y * np.cos(INC)
    east = major * np.sin(PA) + minor * np.cos(PA)
    north = major * np.cos(PA) - minor * np.sin(PA)
    # Positive minor-axis offsets face southeast, the far side.
    radial = 1 + RADIUS * y * np.sin(INC)
    equator = radial * np.cos(DEC) - north * np.sin(DEC)
    z = radial * np.sin(DEC) + north * np.cos(DEC)
    ra = RA + np.arctan2(east, equator)
    dec = np.arctan2(z, np.hypot(east, equator))
    cosine = np.cos(INC) / np.sqrt(east**2 + north**2 + radial**2)
    return np.rad2deg(ra), np.rad2deg(dec), cosine


def ramp(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def bake(folder, output):
    images, headers = [], []
    for suffix, checksum in zip(['', '_unc'], SHA256):
        path = folder / (STEM + suffix + '.fits.gz')
        if hashlib.sha256(path.read_bytes()).hexdigest() != checksum:
            raise ValueError(f'Unexpected input checksum: {path}')
        values, header = fits.getdata(path, header=True)
        images.append(values)
        headers.append(header)
    mass, error = images
    wcs = WCS(headers[0])
    if not wcs.wcs.compare(WCS(headers[1]).wcs):
        raise ValueError('FITS grids differ')
    valid = np.isfinite(mass) & np.isfinite(error) & (mass >= 0) & (error > 0)
    snr = np.divide(mass, error, where=valid, out=np.zeros_like(mass))
    weight = np.where(valid, ramp(snr, 1.5, 4.0), 0)
    weighted_mass = np.where(valid, mass, 0) * weight
    axis = 2 * (np.arange(SIZE) + 0.5) / SIZE - 1
    x, y = np.meshgrid(axis, axis)
    total, support = np.zeros_like(x), np.zeros_like(x)
    # Average at four positions per axis to anti-alias the native sky pixels.
    for dy in [-.75, -.25, .25, .75]:
        for dx in [-.75, -.25, .25, .75]:
            sx, sy = x + dx / SIZE, y + dy / SIZE
            ra, dec, cosine = direction(sx, sy)
            px, py = wcs.world_to_pixel_values(ra, dec)
            coords = np.array([py, px])
            distance_weight = 1 - ramp(np.hypot(sx, sy) * RADIUS_KPC, 16.5, 18.0)
            total += distance_weight * cosine * map_coordinates(weighted_mass, coords, order=1)
            support += distance_weight * map_coordinates(weight, coords, order=1)
    # Draine et al. eq. 7, then the mean PHAT correction to the attenuation
    # inferred from this particular dust-emission model (Dalcanton et al.).
    face_on_mass = np.divide(total, support, where=support > 0, out=np.zeros_like(total))
    tau = face_on_mass * (0.74 / 1e5) * (np.log(10) / 2.5) / 2.5
    coverage = np.rint(255 * support / 16).clip(0, 255).astype('u1')
    tau[coverage == 0] = 0
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(struct.pack('<4sHH', b'M31D', 1, SIZE) + tau.astype('<f2').tobytes() + coverage.tobytes())
    print(f'{output}: {SIZE}² columns, {np.count_nonzero(coverage)} supported, peak normal V optical depth {tau.max():.3f}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_directory', type=Path)
    parser.add_argument('--output', type=Path, default=Path('public/data/andromeda-dust.bin'))
    args = parser.parse_args()
    bake(args.source_directory, args.output)
