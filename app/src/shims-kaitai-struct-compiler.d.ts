declare module "kaitai-struct-compiler" {
  interface KaitaiStructCompilerImporter {
    importYaml(name: string, mode: string): Promise<unknown>;
  }

  interface KaitaiStructCompilerApi {
    compile(
      target: string,
      schema: unknown,
      importer: KaitaiStructCompilerImporter,
      includeDebugInfo: boolean
    ): Promise<Record<string, string>>;
  }

  const compiler: KaitaiStructCompilerApi;
  export default compiler;
}
