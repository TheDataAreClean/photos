'use strict';

const exifr = require('exifr');

async function extractExif(filepath) {
  try {
    const raw = await exifr.parse(filepath, {
      tiff: true,
      xmp: true,
      iptc: false,
      gps: true,
      translateValues: true,
      translateKeys: true,
      reviveValues: true,
    });

    if (!raw) return {};

    return {
      camera: formatCamera(raw.Make, raw.Model),
      lens: raw.LensModel || raw.Lens || null,
      focalLength: raw.FocalLength ? `${Math.round(raw.FocalLength)}mm` : null,
      focalLength35: raw.FocalLengthIn35mmFormat
        ? `${Math.round(raw.FocalLengthIn35mmFormat)}mm`
        : null,
      aperture: raw.FNumber ? `f/${raw.FNumber}` : null,
      shutterSpeed: formatShutter(raw.ExposureTime),
      iso: raw.ISO || raw.ISOSpeedRatings || null,
      flash: raw.Flash != null
        ? (typeof raw.Flash === 'object' ? !!raw.Flash.fired : !!raw.Flash)
        : null,
      dateTaken: raw.DateTimeOriginal
        ? raw.DateTimeOriginal.toISOString()
        : null,
      gps:
        raw.latitude != null && raw.longitude != null
          ? {
              lat: raw.latitude,
              lng: raw.longitude,
              altitude: raw.GPSAltitude || null,
            }
          : null,
    };
  } catch {
    return {};
  }
}

function formatCamera(make, model) {
  if (!model) return make ? make.trim() : null;
  if (!make) return model.trim();
  // Avoid duplication like "FUJIFILM FUJIFILM X-T5"
  const makeUpper = make.trim().toUpperCase();
  const modelClean = model.trim();
  if (modelClean.toUpperCase().startsWith(makeUpper)) return modelClean;
  return `${make.trim()} ${modelClean}`;
}

function formatShutter(exposureTime) {
  if (exposureTime == null) return null;
  if (exposureTime >= 1) return `${exposureTime}s`;
  const denom = Math.round(1 / exposureTime);
  return `1/${denom}s`;
}

module.exports = { extractExif };
