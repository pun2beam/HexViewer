import yaml from "js-yaml";
import KaitaiStructCompiler from "kaitai-struct-compiler";

export interface KaitaiImporter {
  importYaml(name: string, mode: string): Promise<unknown>;
}

export interface KaitaiSchema {
  meta?: {
    id?: string;
    endian?: "le" | "be";
    encoding?: string;
  };
  seq?: KaitaiFieldSpec[];
  types?: Record<string, KaitaiTypeSpec>;
}

export interface KaitaiFieldSpec {
  id: string;
  type?: string | KaitaiTypeSwitch;
  repeat?: string;
  "repeat-expr"?: number | string;
  [key: string]: unknown;
}

export interface KaitaiTypeSwitch {
  "switch-on": unknown;
  cases: Record<string, string>;
}

export interface KaitaiTypeSpec {
  seq?: KaitaiFieldSpec[];
  types?: Record<string, KaitaiTypeSpec>;
}

export interface CompilationResult {
  schema: KaitaiSchema;
  files: Record<string, string>;
}

export class KaitaiCompilationError extends Error {
  public readonly original: unknown;

  constructor(message: string, original: unknown) {
    super(message);
    this.original = original;
  }
}

const defaultImporter: KaitaiImporter = {
  importYaml(name: string) {
    return Promise.reject(new Error(`Import '${name}' not provided`));
  },
};

export async function compileKsySource(
  source: string,
  importer: KaitaiImporter = defaultImporter
): Promise<CompilationResult> {
  const parsed = yaml.load(source);
  if (!parsed || typeof parsed !== "object") {
    throw new KaitaiCompilationError("Invalid KSY content", null);
  }

  const schema = parsed as KaitaiSchema;

  try {
    const files = (await KaitaiStructCompiler.compile(
      "javascript",
      schema,
      importer,
      true
    )) as Record<string, string>;
    return { schema, files };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new KaitaiCompilationError(message, err);
  }
}
