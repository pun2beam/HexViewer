import yaml from "js-yaml";
import type { AstNode, ParseError, ParseResult, Range } from "../types";

interface KaitaiSchema {
  meta?: {
    id?: string;
    endian?: "le" | "be";
  };
  seq?: KaitaiField[];
  types?: Record<string, KaitaiType>;
}

interface KaitaiType {
  seq?: KaitaiField[];
  params?: Array<{ id: string }>;
  instances?: Record<string, unknown>;
  enums?: Record<string, unknown>;
  endian?: "le" | "be";
}

interface KaitaiTypeSwitch {
  "switch-on": number | string;
  cases: Record<string, string>;
}

interface KaitaiField {
  id: string;
  type?: string | KaitaiTypeSwitch;
  size?: number | string;
  encoding?: string;
  repeat?: "expr" | "eos" | "until";
  repeatExpr?: number | string;
  terminator?: number;
  consume?: boolean;
  include?: boolean;
  if?: string;
  doc?: string;
  pos?: number | string;
}

interface ParseEnv {
  buffer: Uint8Array;
  defaultEndian: "le" | "be";
  schema: KaitaiSchema;
  types: Record<string, KaitaiType>;
  values: Map<string, unknown>;
}

interface ParseContext {
  path: string[];
  offset: number;
  endian: "le" | "be";
  scopeValues: Record<string, unknown>;
}

interface ParseOutcome {
  node: AstNode;
  newOffset: number;
  value: unknown;
}

const textDecoderCache = new Map<string, TextDecoder>();

function getDecoder(encoding: string | undefined): TextDecoder {
  const enc = encoding?.toLowerCase() ?? "utf-8";
  if (!textDecoderCache.has(enc)) {
    textDecoderCache.set(enc, new TextDecoder(enc, { fatal: false }));
  }
  return textDecoderCache.get(enc)!;
}

class ExpressionParser {
  private index = 0;
  private readonly expr: string;
  private readonly env: ParseEnv;
  private readonly ctx: ParseContext;

  constructor(expr: string, env: ParseEnv, ctx: ParseContext) {
    this.expr = expr;
    this.env = env;
    this.ctx = ctx;
  }

  parse(): number | undefined {
    try {
      const value = this.parseExpression();
      this.skipWhitespace();
      if (this.index !== this.expr.length) {
        return undefined;
      }
      return value;
    } catch {
      return undefined;
    }
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      this.skipWhitespace();
      const op = this.peek();
      if (op === "+" || op === "-") {
        this.index++;
        const rhs = this.parseTerm();
        value = op === "+" ? value + rhs : value - rhs;
      } else {
        break;
      }
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    while (true) {
      this.skipWhitespace();
      const op = this.peek();
      if (op === "*" || op === "/") {
        this.index++;
        const rhs = this.parseUnary();
        if (op === "*") {
          value *= rhs;
        } else {
          value /= rhs;
        }
      } else {
        break;
      }
    }
    return value;
  }

  private parseUnary(): number {
    this.skipWhitespace();
    const op = this.peek();
    if (op === "+" || op === "-") {
      this.index++;
      const value = this.parseUnary();
      return op === "+" ? value : -value;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipWhitespace();
    const ch = this.peek();
    if (ch === "(") {
      this.index++;
      const value = this.parseExpression();
      this.skipWhitespace();
      if (this.peek() !== ")") {
        throw new Error("Unmatched parenthesis");
      }
      this.index++;
      return value;
    }
    if (this.isDigit(ch)) {
      return this.parseNumber();
    }
    if (this.isIdentifierStart(ch)) {
      const identifier = this.parseIdentifier();
      const resolved = resolveIdentifier(identifier, this.env, this.ctx);
      if (typeof resolved === "number") {
        return resolved;
      }
    }
    throw new Error("Unable to parse expression");
  }

  private parseNumber(): number {
    const remainder = this.expr.slice(this.index);
    const match = remainder.match(/^(0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|[0-9]+)/);
    if (!match) {
      throw new Error("Invalid number");
    }
    this.index += match[0].length;
    return Number(match[0]);
  }

  private parseIdentifier(): string {
    const start = this.index;
    while (this.index < this.expr.length) {
      const ch = this.expr[this.index];
      if (this.isIdentifierPart(ch) || ch === ".") {
        this.index++;
      } else {
        break;
      }
    }
    return this.expr.slice(start, this.index);
  }

  private skipWhitespace(): void {
    while (this.index < this.expr.length && /\s/.test(this.expr[this.index]!)) {
      this.index++;
    }
  }

  private peek(): string | undefined {
    return this.expr[this.index];
  }

  private isDigit(ch: string | undefined): ch is string {
    return ch !== undefined && /[0-9]/.test(ch);
  }

  private isIdentifierStart(ch: string | undefined): ch is string {
    return ch !== undefined && /[A-Za-z_$]/.test(ch);
  }

  private isIdentifierPart(ch: string | undefined): ch is string {
    return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
  }
}

function resolveIdentifier(
  identifier: string,
  env: ParseEnv,
  ctx: ParseContext
): number | undefined {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.replace(/\s+/g, "");
  const lookupCandidates = new Set<string>();
  const rootPrefixes = ["$root.", "_root."];
  const rootPath = ctx.path[0] ?? env.schema.meta?.id ?? "root";

  const matchedRootPrefix = rootPrefixes.find((prefix) =>
    normalized.startsWith(prefix)
  );
  if (matchedRootPrefix) {
    const remainder = normalized.slice(matchedRootPrefix.length);
    if (!remainder) {
      return undefined;
    }
    if (rootPath) {
      lookupCandidates.add([rootPath, remainder].filter(Boolean).join("."));
    }
    lookupCandidates.add(remainder);
  } else {
    if (ctx.path.length > 0) {
      lookupCandidates.add(
        [...ctx.path, normalized].filter(Boolean).join(".")
      );
      lookupCandidates.add(
        [...ctx.path.slice(0, -1), normalized].filter(Boolean).join(".")
      );
    }
    lookupCandidates.add(normalized);
  }

  for (const candidate of lookupCandidates) {
    if (!candidate) {
      continue;
    }
    if (env.values.has(candidate)) {
      const value = env.values.get(candidate);
      if (typeof value === "number") {
        return value;
      }
    }
    const scopeValue = resolveScopeValue(candidate, ctx.scopeValues);
    if (typeof scopeValue === "number") {
      return scopeValue;
    }
  }
  return undefined;
}

function evaluateExpression(
  expr: number | string | undefined,
  env: ParseEnv,
  ctx: ParseContext
): number | undefined {
  if (expr === undefined) {
    return undefined;
  }
  if (typeof expr === "number") {
    return expr;
  }

  const parser = new ExpressionParser(expr, env, ctx);
  return parser.parse();
}

function resolveScopeValue(path: string, scope: Record<string, unknown>): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = scope;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function makeNodeId(path: string[]): string {
  return path.filter(Boolean).join(".") || "root";
}

function parseNumeric(
  field: KaitaiField,
  env: ParseEnv,
  ctx: ParseContext,
  byteLength: number,
  signed: boolean
): ParseOutcome {
  const view = new DataView(env.buffer.buffer, env.buffer.byteOffset, env.buffer.byteLength);
  const offset = ctx.offset;
  const littleEndian = ctx.endian === "le";
  if (offset + byteLength > env.buffer.length) {
    throw new Error(`Reading past end of buffer at offset ${offset}`);
  }
  let value: number;
  switch (byteLength) {
    case 1:
      value = signed ? view.getInt8(offset) : view.getUint8(offset);
      break;
    case 2:
      value = signed
        ? view.getInt16(offset, littleEndian)
        : view.getUint16(offset, littleEndian);
      break;
    case 4:
      value = signed
        ? view.getInt32(offset, littleEndian)
        : view.getUint32(offset, littleEndian);
      break;
    case 8: {
      const high = view.getUint32(offset + (littleEndian ? 4 : 0), littleEndian);
      const low = view.getUint32(offset + (littleEndian ? 0 : 4), littleEndian);
      value = littleEndian ? high * 2 ** 32 + low : high * 2 ** 32 + low;
      break;
    }
    default:
      throw new Error(`Unsupported integer width: ${byteLength}`);
  }

  const range: Range = { start: offset, length: byteLength };
  const node: AstNode = {
    id: makeNodeId([...ctx.path, field.id]),
    name: field.id,
    typeName: `u${byteLength * 8}`,
    range,
    endian: ctx.endian,
    value,
  };
  return { node, newOffset: offset + byteLength, value };
}

function parseString(
  field: KaitaiField,
  env: ParseEnv,
  ctx: ParseContext,
  size: number
): ParseOutcome {
  const offset = ctx.offset;
  if (offset + size > env.buffer.length) {
    throw new Error(`Reading past end of buffer at offset ${offset}`);
  }
  const slice = env.buffer.subarray(offset, offset + size);
  const decoder = getDecoder(field.encoding);
  const value = decoder.decode(slice);
  const node: AstNode = {
    id: makeNodeId([...ctx.path, field.id]),
    name: field.id,
    typeName: "str",
    range: { start: offset, length: size },
    value,
    attributes: {
      encoding: field.encoding ?? decoder.encoding,
    },
  };
  return { node, newOffset: offset + size, value };
}

function parseBytes(
  field: KaitaiField,
  env: ParseEnv,
  ctx: ParseContext,
  size: number
): ParseOutcome {
  const offset = ctx.offset;
  if (offset + size > env.buffer.length) {
    throw new Error(`Reading past end of buffer at offset ${offset}`);
  }
  const slice = env.buffer.subarray(offset, offset + size);
  const node: AstNode = {
    id: makeNodeId([...ctx.path, field.id]),
    name: field.id,
    typeName: "bytes",
    range: { start: offset, length: size },
    value: Array.from(slice),
  };
  return { node, newOffset: offset + size, value: slice };
}

function parseCustomType(
  field: KaitaiField,
  env: ParseEnv,
  ctx: ParseContext,
  typeName: string
): ParseOutcome {
  const type = env.types[typeName];
  if (!type) {
    throw new Error(`Unknown type: ${typeName}`);
  }
  const children: AstNode[] = [];
  let localOffset = ctx.offset;
  const scope: Record<string, unknown> = {};
  const typeEndian = type.endian ?? ctx.endian;
  const startOffset = localOffset;

  if (type.seq) {
    for (const childField of type.seq) {
      const enabled = childField.if
        ? Boolean(
            evaluateExpression(childField.if, env, {
              ...ctx,
              offset: localOffset,
              endian: typeEndian,
              scopeValues: scope,
            })
          )
        : true;
      if (!enabled) continue;

      const nextOffsetExpr = evaluateExpression(childField.pos, env, {
        ...ctx,
        offset: localOffset,
        endian: typeEndian,
        scopeValues: scope,
      });
      if (typeof nextOffsetExpr === "number") {
        localOffset = nextOffsetExpr;
      }

      const subCtx: ParseContext = {
        path: [...ctx.path, field.id],
        offset: localOffset,
        endian: typeEndian,
        scopeValues: scope,
      };
      const outcome = parseField(childField, env, subCtx);
      children.push(outcome.node);
      scope[childField.id] = outcome.value;
      env.values.set(outcome.node.id, outcome.value);
      localOffset = outcome.newOffset;
    }
  }

  const range: Range = { start: startOffset, length: Math.max(0, localOffset - startOffset) };
  const node: AstNode = {
    id: makeNodeId([...ctx.path, field.id]),
    name: field.id,
    typeName,
    range,
    children,
  };
  return { node, newOffset: localOffset, value: scope };
}

function parseField(field: KaitaiField, env: ParseEnv, ctx: ParseContext): ParseOutcome {
  let offset = ctx.offset;
  const posExpr = evaluateExpression(field.pos, env, ctx);
  if (typeof posExpr === "number") {
    offset = posExpr;
  }
  const subCtx: ParseContext = { ...ctx, offset };

  if (!field.type) {
    const sizeExpr = evaluateExpression(field.size, env, subCtx);
    if (typeof sizeExpr !== "number") {
      throw new Error(`Field ${field.id} requires size when no type is specified`);
    }
    return parseBytes(field, env, subCtx, sizeExpr);
  }

  const resolvedType = resolveFieldTypeName(field, env, subCtx);
  const builtin = resolvedType.toLowerCase();
  switch (builtin) {
    case "u1":
      return parseNumeric(field, env, subCtx, 1, false);
    case "s1":
      return parseNumeric(field, env, subCtx, 1, true);
    case "u2":
      return parseNumeric(field, env, subCtx, 2, false);
    case "s2":
      return parseNumeric(field, env, subCtx, 2, true);
    case "u4":
      return parseNumeric(field, env, subCtx, 4, false);
    case "s4":
      return parseNumeric(field, env, subCtx, 4, true);
    case "u8":
      return parseNumeric(field, env, subCtx, 8, false);
    case "s8":
      return parseNumeric(field, env, subCtx, 8, true);
    case "str": {
      const sizeExpr = evaluateExpression(field.size, env, subCtx);
      if (typeof sizeExpr !== "number") {
        throw new Error(`Field ${field.id} requires size for string type`);
      }
      return parseString(field, env, subCtx, sizeExpr);
    }
    case "bytes": {
      const sizeExpr = evaluateExpression(field.size, env, subCtx);
      if (typeof sizeExpr !== "number") {
        throw new Error(`Field ${field.id} requires size for bytes type`);
      }
      return parseBytes(field, env, subCtx, sizeExpr);
    }
    default:
      return parseCustomType(field, env, subCtx, resolvedType);
  }
}

function resolveFieldTypeName(
  field: KaitaiField,
  env: ParseEnv,
  ctx: ParseContext
): string {
  const { type } = field;
  if (typeof type === "string") {
    return type;
  }

  if (isKaitaiTypeSwitch(type)) {
    const switchValue = evaluateExpression(type["switch-on"], env, ctx);
    if (typeof switchValue === "number") {
      for (const [caseKey, caseType] of Object.entries(type.cases)) {
        if (caseKey === "_") {
          continue;
        }
        const resolvedCase = resolveSwitchCaseKey(caseKey, env, ctx);
        if (resolvedCase !== undefined && resolvedCase === switchValue) {
          return caseType;
        }
      }
    }
    if ("_" in type.cases) {
      return type.cases["_"];
    }
    throw new Error(`Unable to resolve switch type for field ${field.id}`);
  }

  throw new Error(`Unsupported type definition for field ${field.id}`);
}

function resolveSwitchCaseKey(
  key: string,
  env: ParseEnv,
  ctx: ParseContext
): number | undefined {
  const trimmed = key.trim();
  if (!trimmed || trimmed === "_") {
    return undefined;
  }
  const evaluated = evaluateExpression(trimmed, env, ctx);
  if (typeof evaluated === "number") {
    return evaluated;
  }
  const numeric = Number(trimmed);
  return Number.isNaN(numeric) ? undefined : numeric;
}

function isKaitaiTypeSwitch(value: unknown): value is KaitaiTypeSwitch {
  if (!value || typeof value !== "object") {
    return false;
  }
  return (
    "switch-on" in (value as Record<string, unknown>) &&
    "cases" in (value as Record<string, unknown>) &&
    typeof (value as { cases: unknown }).cases === "object" &&
    (value as { cases: unknown }).cases !== null
  );
}

function flatten(node: AstNode | null, acc: AstNode[]): void {
  if (!node) return;
  acc.push(node);
  if (node.children) {
    for (const child of node.children) {
      flatten(child, acc);
    }
  }
}

export function parseWithKsy(buffer: Uint8Array, ksySource: string): ParseResult {
  const flatNodes: AstNode[] = [];
  const errors: ParseError[] = [];
  const warnings: string[] = [];

  if (!ksySource.trim()) {
    return { root: null, flatNodes, warnings, errors };
  }

  let schema: KaitaiSchema;
  try {
    const parsed = yaml.load(ksySource);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid KSY content");
    }
    schema = parsed as KaitaiSchema;
  } catch (err) {
    errors.push({ message: err instanceof Error ? err.message : String(err) });
    return { root: null, flatNodes, warnings, errors };
  }

  const env: ParseEnv = {
    buffer,
    defaultEndian: schema.meta?.endian ?? "be",
    schema,
    types: schema.types ?? {},
    values: new Map(),
  };

  const rootSeq = schema.seq ?? env.types[schema.meta?.id ?? ""]?.seq;
  if (!rootSeq) {
    errors.push({ message: "Schema must define top-level seq or type" });
    return { root: null, flatNodes, warnings, errors };
  }

  const rootField: KaitaiField = {
    id: schema.meta?.id ?? "root",
    type: "__root__",
  };

  env.types["__root__"] = {
    seq: rootSeq,
    endian: schema.meta?.endian,
  };

  try {
    const rootCtx: ParseContext = {
      path: [],
      offset: 0,
      endian: env.defaultEndian,
      scopeValues: {},
    };
    const { node } = parseCustomType(rootField, env, rootCtx, "__root__");
    flatten(node, flatNodes);
    return { root: node, flatNodes, warnings, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ message });
    return { root: null, flatNodes, warnings, errors };
  }
}
