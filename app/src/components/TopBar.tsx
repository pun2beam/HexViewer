import { type ChangeEvent, useRef } from "react";
import { useSessionStore } from "../state/sessionStore";
import { useShallow } from "zustand/react/shallow";

const SAMPLE_HEX = "4865585612340000000000000000000000000000000000000000000000000000";
const SAMPLE_BYTES = Uint8Array.from(
  SAMPLE_HEX.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
);

const SAMPLE_KSY = `meta:
  id: demo_container
  endian: be
seq:
  - id: magic
    type: str
    size: 4
    encoding: ASCII
  - id: version
    type: u2
  - id: flags
    type: u2
  - id: payload_len
    type: u4
  - id: payload
    size: payload_len
`;

export function TopBar() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ksyInputRef = useRef<HTMLInputElement | null>(null);
  const {
    loadFile,
    applyKsy,
    setBuffer,
    setKsySource,
    ksySource,
    hexCols,
    setHexCols,
    fileMeta,
    errors,
  } = useSessionStore(
    useShallow((state) => ({
      loadFile: state.loadFile,
      applyKsy: state.applyKsy,
      setBuffer: state.setBuffer,
      setKsySource: state.setKsySource,
      ksySource: state.ksySource,
      hexCols: state.hexCols,
      setHexCols: state.setHexCols,
      fileMeta: state.fileMeta,
      errors: state.errors,
    })),
  );

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await loadFile(file);
  };

  const handleLoadSample = async () => {
    await setBuffer(new Uint8Array(SAMPLE_BYTES), {
      name: "sample.bin",
      size: SAMPLE_BYTES.length,
      sha256: "",
    });
    setKsySource(SAMPLE_KSY);
    applyKsy(SAMPLE_KSY);
  };

  const handleKsyFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setKsySource(text);
      await applyKsy(text);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <header className="top-bar">
      <div className="top-bar__section">
        <button onClick={() => fileInputRef.current?.click()}>ファイルを開く</button>
        <button onClick={handleLoadSample}>サンプル読み込み</button>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button onClick={() => ksyInputRef.current?.click()}>KSYを読み込む</button>
        <input
          ref={ksyInputRef}
          type="file"
          accept=".ksy,.yaml,.yml,text/yaml,application/x-yaml"
          style={{ display: "none" }}
          onChange={handleKsyFileChange}
        />
      </div>
      <div className="top-bar__section">
        <button onClick={() => applyKsy()} disabled={!ksySource.trim()}>
          KSY適用
        </button>
        <label>
          Hex列:
          <select value={hexCols} onChange={(e) => setHexCols(Number(e.target.value) as 16 | 24 | 32)}>
            <option value={16}>16</option>
            <option value={24}>24</option>
            <option value={32}>32</option>
          </select>
        </label>
      </div>
      <div className="top-bar__meta">
        {fileMeta ? (
          <span>
            {fileMeta.name} / {fileMeta.size.toLocaleString()} bytes
          </span>
        ) : (
          <span>ファイル未読込</span>
        )}
        {errors.length > 0 && <span className="top-bar__error">{errors[0]}</span>}
      </div>
    </header>
  );
}
