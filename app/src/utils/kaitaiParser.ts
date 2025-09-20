import { KaitaiStream } from "kaitai-struct";
import type { AstNode, ParseError, ParseResult, Range } from "../types";
import {
  KaitaiCompilationError,
  type KaitaiFieldSpec,
  type KaitaiSchema,
  type KaitaiTypeSpec,
  compileKsySource,
} from "./kaitaiCompiler";

type DebugEntry = {
  start?: number;
  end?: number;
  ioOffset?: number;
  arr?: DebugEntry[];
};

type DebugMap = Record<string, DebugEntry>;

type ParsedInstance = {
  _debug?: DebugMap;
  [key: string]: unknown;
};

function toCamelCase(name: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) {
    return name;
  }
  return parts
    .map((part, index) => {
      if (index === 0) {
        const lower = part.toLowerCase();
        return lower.charAt(0) + lower.slice(1);
      }
      const normalized = part.toLowerCase();
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join("");
}

type TypeInfo = {
  spec?: KaitaiTypeSpec;
  display: string;
};

interface ModuleCache {
  require(name: string): unknown;
}

function toPascalCase(name: string): string {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function makeNodeId(path: string[]): string {
  return path.filter(Boolean).join(".") || "root";
}

function normalizeModuleName(from: string, request: string): string {
  if (!request.startsWith(".")) {
    return request;
  }
  const baseParts = from.split("/");
  baseParts.pop();
  const requestParts = request.split("/");
  for (const part of requestParts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  return baseParts.join("/");
}

function createModuleCache(files: Record<string, string>): ModuleCache {
  const cache = new Map<string, unknown>();

  function requireModule(name: string, from = ""): unknown {
    if (name === "kaitai-struct/KaitaiStream") {
      return KaitaiStream;
    }

    let resolved = name;
    if (resolved.startsWith(".")) {
      resolved = normalizeModuleName(from, name);
    }
    if (!resolved.endsWith(".js")) {
      resolved = `${resolved}.js`;
    }

    if (cache.has(resolved)) {
      return cache.get(resolved);
    }

    const code = files[resolved];
    if (!code) {
      throw new Error(`Generated module '${resolved}' not found`);
    }

    const module = { exports: {} as Record<string, unknown> };
    const exportsObj = module.exports;
    const define = (deps: string[], factory: (...args: unknown[]) => void) => {
      const args = deps.map((dep) =>
        dep === "exports" ? exportsObj : requireModule(dep, resolved)
      );
      factory(...args);
    };
    (define as unknown as { amd: boolean }).amd = true;

    const fn = new Function("module", "exports", "require", "define", code);
    fn(
      module,
      exportsObj,
      (dep: string) => requireModule(dep, resolved),
      define
    );
    cache.set(resolved, module.exports);
    return module.exports;
  }

  return {
    require(name: string) {
      return requireModule(name);
    },
  };
}

function toRange(entry: DebugEntry | undefined): Range {
  const base = entry?.ioOffset ?? 0;
  const relativeStart = entry?.start ?? 0;
  const relativeEnd = entry?.end ?? relativeStart;
  const start = base + relativeStart;
  const end = base + relativeEnd;
  const length = Math.max(0, end - start);
  return { start, length };
}

function normalizeValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Uint8Array) {
    return Array.from(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (typeof value === "object") {
    if (isComplexValue(value)) {
      return undefined;
    }
    return value;
  }
  return value;
}

function isComplexValue(value: unknown): value is ParsedInstance {
  return Boolean(
    value &&
      typeof value === "object" &&
      "_debug" in (value as Record<string, unknown>)
  );
}

function buildTypeRegistry(
  schema: KaitaiSchema,
  rootSpec: KaitaiTypeSpec
): Map<string, KaitaiTypeSpec> {
  const registry = new Map<string, KaitaiTypeSpec>();

  function visit(name: string, spec: KaitaiTypeSpec | undefined): void {
    if (!spec) return;
    registry.set(toPascalCase(name), spec);
    if (spec.types) {
      for (const [childName, childSpec] of Object.entries(spec.types)) {
        visit(childName, childSpec);
      }
    }
  }

  if (schema.meta?.id) {
    registry.set(toPascalCase(schema.meta.id), rootSpec);
  }

  if (rootSpec.types) {
    for (const [childName, childSpec] of Object.entries(rootSpec.types)) {
      visit(childName, childSpec);
    }
  }

  return registry;
}

function resolveTypeByName(
  typeName: string,
  contextStack: KaitaiTypeSpec[],
  schema: KaitaiSchema
): KaitaiTypeSpec | undefined {
  for (let i = contextStack.length - 1; i >= 0; i -= 1) {
    const spec = contextStack[i];
    if (spec.types && spec.types[typeName]) {
      return spec.types[typeName];
    }
  }
  return schema.types?.[typeName];
}

function guessPrimitiveType(value: unknown): string {
  if (value instanceof Uint8Array) return "bytes";
  if (typeof value === "string") return "str";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (typeof value === "bigint") return "bigint";
  if (typeof value === "boolean") return "bool";
  if (value === null) return "null";
  if (value === undefined) return "void";
  return typeof value;
}

function resolveNodeType(
  field: KaitaiFieldSpec | undefined,
  value: unknown,
  contextStack: KaitaiTypeSpec[],
  schema: KaitaiSchema,
  registry: Map<string, KaitaiTypeSpec>
): TypeInfo {
  const sample = Array.isArray(value) ? value[0] : value;

  if (field && typeof field.type === "string") {
    const spec = resolveTypeByName(field.type, contextStack, schema);
    return { spec, display: field.type };
  }

  if (field && typeof field.type === "object") {
    if (sample && typeof sample === "object") {
      const className = (sample as ParsedInstance)?.constructor?.name;
      if (className) {
        const spec = registry.get(className);
        return { spec, display: className };
      }
    }
    return { spec: undefined, display: "switch" };
  }

  if (sample && typeof sample === "object") {
    const className = (sample as ParsedInstance)?.constructor?.name;
    if (className) {
      const spec = registry.get(className);
      return { spec, display: className };
    }
  }

  if (field && typeof field.type === "string") {
    return { spec: undefined, display: field.type };
  }

  return { spec: undefined, display: guessPrimitiveType(sample) };
}

function mergeAttributes(
  node: AstNode,
  field?: KaitaiFieldSpec
): void {
  if (!field) return;
  const attrs: Record<string, unknown> = {};
  if (typeof field.doc === "string") {
    attrs.doc = field.doc;
  }
  if (field.encoding) {
    attrs.encoding = field.encoding;
  }
  if (field.repeat) {
    attrs.repeat = field.repeat;
  }
  const repeatExpr = field["repeat-expr"];
  if (repeatExpr !== undefined) {
    attrs["repeat-expr"] = repeatExpr;
  }
  if (Object.keys(attrs).length > 0) {
    node.attributes = { ...(node.attributes ?? {}), ...attrs };
  }
}

function buildFallbackChildren(
  value: ParsedInstance,
  debug: DebugMap | undefined,
  path: string[],
  schema: KaitaiSchema,
  contextStack: KaitaiTypeSpec[],
  registry: Map<string, KaitaiTypeSpec>
): AstNode[] {
  if (!debug) return [];
  const nodes: AstNode[] = [];
  for (const [key, entry] of Object.entries(debug)) {
    const childValue = value[key];
    const childPath = [...path, key];
    nodes.push(
      buildNode(
        key,
        childValue,
        entry,
        childPath,
        schema,
        contextStack,
        registry
      )
    );
  }
  return nodes;
}

function buildNode(
  name: string,
  value: unknown,
  entry: DebugEntry,
  path: string[],
  schema: KaitaiSchema,
  contextStack: KaitaiTypeSpec[],
  registry: Map<string, KaitaiTypeSpec>,
  field?: KaitaiFieldSpec,
  overrideName?: string,
  presetType?: TypeInfo
): AstNode {
  const typeInfo = presetType ?? resolveNodeType(field, value, contextStack, schema, registry);
  const node: AstNode = {
    id: makeNodeId(path),
    name: overrideName ?? name,
    typeName: typeInfo.display,
    range: toRange(entry),
  };

  const normalized = normalizeValue(value);
  if (normalized !== undefined) {
    node.value = normalized;
  }

  mergeAttributes(node, field);

  if (isComplexValue(value)) {
    const childDebug = value._debug ?? {};
    const nextContext = typeInfo.spec ? [...contextStack, typeInfo.spec] : contextStack;
    node.children = typeInfo.spec
      ? buildFields(
          typeInfo.spec,
          value,
          childDebug,
          path,
          schema,
          nextContext,
          registry
        )
      : buildFallbackChildren(value, childDebug, path, schema, nextContext, registry);
  }

  return node;
}

function buildFields(
  typeSpec: KaitaiTypeSpec,
  instance: ParsedInstance,
  debug: DebugMap | undefined,
  path: string[],
  schema: KaitaiSchema,
  contextStack: KaitaiTypeSpec[],
  registry: Map<string, KaitaiTypeSpec>
): AstNode[] {
  const nodes: AstNode[] = [];
  const seq = typeSpec.seq ?? [];
  const debugMap = debug ?? {};

  for (const field of seq) {
    const entryKey = resolveDebugKey(field.id, debugMap);
    if (!entryKey) {
      continue;
    }
    const entry = debugMap[entryKey];
    if (!entry) {
      continue;
    }
    const value = resolveInstanceValue(instance, field.id, entryKey);

    if (Array.isArray(value) && Array.isArray(entry.arr)) {
      const parentPath = [...path, field.id];
      const typeInfo = resolveNodeType(field, value, contextStack, schema, registry);
      const childContext = typeInfo.spec ? [...contextStack, typeInfo.spec] : contextStack;
      const children: AstNode[] = [];
      entry.arr.forEach((elementEntry, index) => {
        const elementValue = value[index];
        const elementPath = [...parentPath, `${field.id}[${index}]`];
        children.push(
          buildNode(
            `${field.id}[${index}]`,
            elementValue,
            elementEntry,
            elementPath,
            schema,
            childContext,
            registry,
            field,
            `${field.id}[${index}]`,
            resolveNodeType(field, elementValue, childContext, schema, registry)
          )
        );
      });

      const parentNode: AstNode = {
        id: makeNodeId(parentPath),
        name: field.id,
        typeName: `${typeInfo.display}[]`,
        range: toRange(entry),
        value: value.map((item) => normalizeValue(item)),
        children,
      };
      mergeAttributes(parentNode, field);
      nodes.push(parentNode);
    } else {
      nodes.push(
        buildNode(
          field.id,
          value,
          entry,
          [...path, field.id],
          schema,
          contextStack,
          registry,
          field
        )
      );
    }
  }

  return nodes;
}

function resolveDebugKey(fieldId: string, debugMap: DebugMap): string | undefined {
  if (Object.prototype.hasOwnProperty.call(debugMap, fieldId)) {
    return fieldId;
  }
  const camel = toCamelCase(fieldId);
  if (Object.prototype.hasOwnProperty.call(debugMap, camel)) {
    return camel;
  }
  return undefined;
}

function resolveInstanceValue(
  instance: ParsedInstance,
  originalId: string,
  resolvedKey: string
): unknown {
  if (Object.prototype.hasOwnProperty.call(instance, resolvedKey)) {
    return instance[resolvedKey];
  }
  return instance[originalId];
}

function collectRangeFromChildren(children: AstNode[], fallbackLength: number): Range {
  if (!children.length) {
    return { start: 0, length: fallbackLength };
  }
  let start = Number.POSITIVE_INFINITY;
  let end = 0;
  for (const child of children) {
    start = Math.min(start, child.range.start);
    end = Math.max(end, child.range.start + child.range.length);
  }
  if (!Number.isFinite(start)) {
    return { start: 0, length: fallbackLength };
  }
  return { start, length: Math.max(0, end - start) };
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

function formatCompilationProblem(err: unknown): string {
  const problem =
    (err as { Lio_kaitai_struct_problems_CompilationProblemException__f_problem?: unknown })
      ?.Lio_kaitai_struct_problems_CompilationProblemException__f_problem;
  if (problem && typeof problem === "object") {
    const coords = (problem as { coords__Lio_kaitai_struct_problems_ProblemCoords?: () => unknown })
      .coords__Lio_kaitai_struct_problems_ProblemCoords?.();
    const severity = (problem as { severity__Lio_kaitai_struct_problems_ProblemSeverity?: () => unknown })
      .severity__Lio_kaitai_struct_problems_ProblemSeverity?.();
    const text = (problem as { text__T?: () => string }).text__T?.();
    const coordMessage = (coords as { message__T?: () => string })?.message__T?.();
    const severityText = (severity as { message__T?: () => string })?.message__T?.();
    const parts = [coordMessage, severityText, text].filter(Boolean);
    if (parts.length) {
      return parts.join(": ");
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export async function parseWithKsy(
  buffer: Uint8Array,
  ksySource: string
): Promise<ParseResult> {
  const flatNodes: AstNode[] = [];
  const errors: ParseError[] = [];
  const warnings: string[] = [];

  if (!ksySource.trim()) {
    return { root: null, flatNodes, warnings, errors };
  }

  let compilation;
  try {
    compilation = await compileKsySource(ksySource);
  } catch (err) {
    if (err instanceof KaitaiCompilationError) {
      const formatted = formatCompilationProblem(err.original ?? err);
      errors.push({ message: formatted || err.message || "Compilation failed" });
    } else {
      errors.push({ message: formatCompilationProblem(err) });
    }
    return { root: null, flatNodes, warnings, errors };
  }

  const { schema, files } = compilation;
  const rootSpec: KaitaiTypeSpec = {
    seq: schema.seq ?? [],
    types: schema.types ?? {},
  };
  const className = toPascalCase(schema.meta?.id ?? "root");
  const moduleName = `${className}.js`;

  const loader = createModuleCache(files);
  let rootNode: AstNode | null = null;

  try {
    const exportsObj = loader.require(moduleName) as Record<string, unknown>;
    const RootClass = exportsObj?.[className] as
      | (new (io: KaitaiStream) => ParsedInstance & { _read?: () => void })
      | undefined;
    if (!RootClass) {
      throw new Error(`Root class '${className}' not found in generated output`);
    }

    const stream = new KaitaiStream(buffer);
    const instance = new RootClass(stream);
    instance._read?.();

    const registry = buildTypeRegistry(schema, rootSpec);
    const contextStack: KaitaiTypeSpec[] = [rootSpec];
    const children = buildFields(
      rootSpec,
      instance,
      instance._debug ?? {},
      [schema.meta?.id ?? "root"],
      schema,
      contextStack,
      registry
    );
    const range = collectRangeFromChildren(children, buffer.length);
    rootNode = {
      id: makeNodeId([schema.meta?.id ?? "root"]),
      name: schema.meta?.id ?? "root",
      typeName: className,
      range,
      children,
    };
  } catch (err) {
    errors.push({ message: err instanceof Error ? err.message : String(err) });
    return { root: null, flatNodes, warnings, errors };
  }

  flatten(rootNode, flatNodes);
  return { root: rootNode, flatNodes, warnings, errors };
}
