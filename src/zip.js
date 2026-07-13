const decoder = new TextDecoder();

function findEndOfCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  throw new Error('This does not appear to be a valid ZIP/XAP archive.');
}

async function inflateRaw(bytes) {
  if (!globalThis.DecompressionStream) throw new Error('This browser cannot decompress ZIP files. Try a current Chrome, Edge, Firefox, or Safari.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function openZip(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const eocd = findEndOfCentralDirectory(bytes);
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const entries = new Map();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('The ZIP directory is damaged.');
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).replaceAll('\\', '/');
    entries.set(name, { method, compressedSize, uncompressedSize, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  const read = async (name) => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`Archive entry not found: ${name}`);
    const o = entry.localOffset;
    if (view.getUint32(o, true) !== 0x04034b50) throw new Error(`Invalid ZIP entry: ${name}`);
    const start = o + 30 + view.getUint16(o + 26, true) + view.getUint16(o + 28, true);
    const data = bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return data.slice();
    if (entry.method === 8) return inflateRaw(data);
    throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
  };

  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name),
    bytes: read,
    text: async (name) => decoder.decode(await read(name)),
    imageUrl: async (name) => URL.createObjectURL(new Blob([await read(name)], { type: 'image/png' }))
  };
}
