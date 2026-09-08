"""Deterministic preprocessing solely for reading the original menu pixels."""
from PIL import Image, ImageOps
import sys
with Image.open(sys.argv[1]) as source:
    image = ImageOps.autocontrast(source.convert('L'))
    image.resize((image.width * 2, image.height * 2), Image.Resampling.LANCZOS).save(sys.argv[2])
