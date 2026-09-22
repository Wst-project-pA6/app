import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Renders a fully synthetic RGB PNG in-process: a background color, a contrasting body
 * rectangle and a plate/label bar. No external image source is read — these bytes never came
 * from a photograph, stock library, or scraped page. Used to seed demo vehicle/job photos
 * without any copyright or licensing exposure. See docs/DEMO_SEED.md for the attribution note.
 */
export function generateSyntheticPhoto(
  width: number,
  height: number,
  background: Rgb,
  body: Rgb,
  label: Rgb,
): Buffer {
  const bodyTop = Math.floor(height * 0.28);
  const bodyBottom = Math.floor(height * 0.78);
  const labelTop = Math.floor(height * 0.82);
  const labelBottom = Math.floor(height * 0.92);
  const bodyLeft = Math.floor(width * 0.1);
  const bodyRight = Math.floor(width * 0.9);
  const labelLeft = Math.floor(width * 0.3);
  const labelRight = Math.floor(width * 0.7);

  const rowBytes = width * 3;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // no filter
    for (let x = 0; x < width; x++) {
      let pixel = background;
      if (y >= bodyTop && y < bodyBottom && x >= bodyLeft && x < bodyRight) pixel = body;
      if (y >= labelTop && y < labelBottom && x >= labelLeft && x < labelRight) pixel = label;
      const offset = rowStart + 1 + x * 3;
      raw[offset] = pixel.r;
      raw[offset + 1] = pixel.g;
      raw[offset + 2] = pixel.b;
    }
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = chunk('IHDR', ihdrData);
  const idat = chunk('IDAT', deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}
