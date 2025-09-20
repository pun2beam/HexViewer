const decoderCache = new Map<string, TextDecoder>();

const encodingAliases: Record<string, string> = {
  ascii: "iso-8859-1",
  us_ascii: "iso-8859-1",
  utf8: "utf-8",
  utf_8: "utf-8",
  ucs2: "utf-16le",
  ucs_2: "utf-16le",
  utf16le: "utf-16le",
  utf_16le: "utf-16le",
  utf16be: "utf-16be",
  utf_16be: "utf-16be",
};

function normaliseEncoding(encoding?: string): string {
  if (!encoding) {
    return "utf-8";
  }
  const normalised = encoding.trim().toLowerCase();
  const aliasKey = normalised.replace(/[^0-9a-z]+/g, "_");
  return encodingAliases[aliasKey] ?? normalised;
}

function getDecoder(encoding: string): TextDecoder {
  const key = encoding.toLowerCase();
  let decoder = decoderCache.get(key);
  if (!decoder) {
    decoder = new TextDecoder(encoding as unknown as string, { fatal: false });
    decoderCache.set(key, decoder);
  }
  return decoder;
}

function toUint8Array(value: Uint8Array | ArrayLike<number>): Uint8Array {
  return value instanceof Uint8Array ? value : Uint8Array.from(value);
}

function decode(
  buffer: Uint8Array | ArrayLike<number>,
  encoding?: string
): string {
  const targetEncoding = normaliseEncoding(encoding);
  const bytes = toUint8Array(buffer);
  try {
    return getDecoder(targetEncoding).decode(bytes);
  } catch {
    if (targetEncoding !== "utf-8") {
      return getDecoder("utf-8").decode(bytes);
    }
    // Fallback to manual decoding to avoid crashing the viewer entirely.
    let result = "";
    for (let i = 0; i < bytes.length; i += 1) {
      result += String.fromCharCode(bytes[i]);
    }
    return result;
  }
}

export { decode };

export default { decode };
