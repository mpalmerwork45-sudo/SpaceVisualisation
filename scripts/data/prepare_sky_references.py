"""Build small, offline optical and submillimetre reference fields for the sky audit."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import urlencode
from urllib.request import urlopen
from xml.etree import ElementTree

from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy_healpix import HEALPix
import numpy as np

OUTPUT = Path(__file__).resolve().parent / "references"
GAIA = "https://gaia.aip.de/tap/sync"
PLANCK = ("https://irsa.ipac.caltech.edu/data/Planck/release_2/all-sky-maps/maps/"
          "component-maps/foregrounds/COM_CompMap_Dust-GNILC-Model-Opacity_2048_R2.01.fits")
# Fixed equal-area fields across the Coalsack and at different Galactic latitudes.
FIELDS = [(296, -2), (299, -2), (302, -2), (305, -2), (308, -2),
          (80, 0), (180, 0), (0, 8), (180, 30), (180, 70)]
SELECTION = ("phot_g_mean_mag BETWEEN 8 AND 20 AND phot_bp_mean_flux > 0 "
             "AND phot_rp_mean_flux > 0")


def aperture(field):
    longitude, latitude = field
    centre = SkyCoord(longitude * u.deg, latitude * u.deg, frame="galactic").icrs
    query = f"""SELECT COUNT(*) AS n, SUM(phot_g_mean_flux) AS g,
        SUM(phot_bp_mean_flux) AS bp, SUM(phot_rp_mean_flux) AS rp
        FROM gaiadr3.gaia_source WHERE
        1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{centre.ra.deg:.8f},{centre.dec.deg:.8f},0.5))
        AND {SELECTION}"""
    url = GAIA + "?" + urlencode(dict(REQUEST="doQuery", LANG="ADQL", FORMAT="votable", QUERY=query))
    for attempt in range(3):
        try:
            with urlopen(url, timeout=150) as response:
                table = ElementTree.fromstring(response.read())
            for info in table.findall(".//{*}INFO"):
                if info.get("name") == "QUERY_STATUS" and info.get("value") != "OK":
                    raise ValueError(info.text)
            n, g, bp, rp = [cell.text for cell in table.findall(".//{*}TR/{*}TD")]
            return dict(l=longitude, b=latitude, n=int(n), g=float(g), bp=float(bp), rp=float(rp))
        except (ValueError, OSError):
            if attempt == 2:
                raise
            time.sleep(3 * (attempt + 1))


def gaia():
    with ThreadPoolExecutor(max_workers=3) as pool:
        fields = list(pool.map(aperture, FIELDS))
    data = dict(table="gaiadr3.gaia_source", service=GAIA, radiusDegrees=0.5,
                selection=SELECTION, fluxUnit="electron/s, sum over sources", fields=fields)
    (OUTPUT / "gaia-apertures.json").write_text(json.dumps(data, indent=2) + "\n")


def planck(path):
    width, height = 96, 64
    l0, l1, b0, b1 = 290, 314, -10, 6
    with path.open("rb") as raw:
        checksum = hashlib.file_digest(raw, "sha256").hexdigest()
    if checksum != "a236478b0ec459df485cecc618e3f77e02b4c251dd21c31d61d3fa1835da36b1":
        raise ValueError("Expected the complete Planck GNILC opacity R2.01 FITS")
    with fits.open(path) as hdus:
        hdu = hdus[1]
        hp = HEALPix(nside=hdu.header["NSIDE"], order=hdu.header["ORDERING"].strip().lower())
        opacity = hdu.data["TAU353"]
        y, x = np.mgrid[:height, :width]
        tile = np.zeros_like(x, dtype=float)
        for dy in (0.125, 0.375, 0.625, 0.875):
            for dx in (0.125, 0.375, 0.625, 0.875):
                lon = l0 + (x + dx) * (l1 - l0) / width
                lat = b0 + (y + dy) * (b1 - b0) / height
                tile += opacity[hp.lonlat_to_healpix(lon * u.deg, lat * u.deg)] / 16
    if not np.all(np.isfinite(tile) & (tile > 0)):
        raise ValueError("Missing opacity in this field")
    # Integer micro-tau is ample precision for this high-column field.
    data = dict(source=PLANCK, column="TAU353", scale=1e-6, width=width, height=height,
                longitudeEdges=[l0, l1], latitudeEdges=[b0, b1],
                values=np.rint(tile.ravel() * 1e6).astype(int).tolist())
    (OUTPUT / "planck-coalsack.json").write_text(json.dumps(data, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="task", required=True)
    commands.add_parser("gaia")
    commands.add_parser("planck").add_argument("fits_file", type=Path)
    args = parser.parse_args()
    OUTPUT.mkdir(exist_ok=True)
    if args.task == "gaia":
        gaia()
    else:
        planck(args.fits_file)
