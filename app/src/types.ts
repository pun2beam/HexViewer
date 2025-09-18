export type ByteOffset = number;
export type ByteLength = number;

export interface Range {
  start: ByteOffset;
  length: ByteLength;
}

export interface ParseError {
  message: string;
  nodePath?: string;
}

export interface AstNode {
  id: string;
  name: string;
  typeName: string;
  range: Range;
  endian?: "le" | "be";
  value?: unknown;
  children?: AstNode[];
  attributes?: Record<string, unknown>;
  errors?: ParseError[];
}

export interface ParseResult {
  root: AstNode | null;
  flatNodes: AstNode[];
  warnings: string[];
  errors: ParseError[];
}

export interface Annotation {
  id: string;
  range: Range;
  color?: string;
  label?: string;
  note?: string;
  tags?: string[];
  createdAt: number;
}

export interface SessionFileMeta {
  name: string;
  size: number;
  sha256: string;
}

export interface SessionData {
  fileMeta: SessionFileMeta | null;
  bufferBase64: string | null;
  ksySource: string;
  annotations: Annotation[];
  viewState: {
    hexCols: 16 | 24 | 32;
    caret: ByteOffset | null;
    zoom?: Range | null;
  };
}
