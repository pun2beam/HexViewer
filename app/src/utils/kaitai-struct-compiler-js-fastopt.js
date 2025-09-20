const MainJs = globalThis.MainJs;

if (!MainJs) {
  throw new Error(
    "Kaitai compiler runtime (MainJs) is not loaded. Ensure 'kaitai-struct-compiler-js-fastopt.js' bundle is included before using Kaitai compilation."
  );
}

export { MainJs };
