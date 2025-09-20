declare module "kaitai-struct" {
  export class KaitaiStream {
    constructor(data: ArrayBuffer | Uint8Array | number[]);
    pos: number;
    byteOffset: number;
    size: number;
  }
}
