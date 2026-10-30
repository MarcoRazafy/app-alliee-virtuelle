function pngSize(bytes) {
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function gifSize(bytes) {
  if (bytes.length < 10 || bytes.toString('latin1', 0, 4) !== 'GIF8') return null;
  return { format: 'gif', width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
}

function webpSize(bytes) {
  if (bytes.length < 30 || bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = bytes.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') return { format: 'webp', width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const b = bytes.subarray(21, 25);
    return {
      format: 'webp',
      width: 1 + (b[0] | ((b[1] & 0x3f) << 8)),
      height: 1 + (((b[1] & 0xc0) >> 6) | (b[2] << 2) | ((b[3] & 0x0f) << 10)),
    };
  }
  if (chunk === 'VP8X') return { format: 'webp', width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  return null;
}

const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegSize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (JPEG_SOF_MARKERS.has(marker)) {
      return { format: 'jpeg', width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

function imageSize(bytes) {
  const size = pngSize(bytes) || jpegSize(bytes) || webpSize(bytes) || gifSize(bytes);
  return size && size.width > 0 && size.height > 0 ? size : null;
}

function jpegOrientation(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker === 0xe1 && bytes.toString('latin1', offset + 4, offset + 10) === 'Exif\u0000\u0000') {
      const tiff = offset + 10;
      const little = bytes.toString('latin1', tiff, tiff + 2) === 'II';
      const read16 = (at) => (little ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at));
      const read32 = (at) => (little ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at));
      const ifd = tiff + read32(tiff + 4);
      if (ifd + 2 > bytes.length) return 1;
      const entries = read16(ifd);
      for (let i = 0; i < entries; i += 1) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > bytes.length) return 1;
        if (read16(entry) === 0x0112) {
          const value = read16(entry + 8);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    if (marker === 0xda) return 1;
    offset += 2 + length;
  }
  return 1;
}

module.exports = { imageSize, jpegOrientation };
