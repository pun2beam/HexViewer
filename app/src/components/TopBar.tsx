import { useRef } from "react";
import { useSessionStore } from "../state/sessionStore";

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
  const sessionInputRef = useRef<HTMLInputElement | null>(null);
  const {
    loadFile,
    applyKsy,
    undo,
    redo,
    saveSession,
    restoreSession,
    setBuffer,
    setKsySource,
    ksySource,
    hexCols,
    setHexCols,
    fileMeta,
    errors,
  } = useSessionStore((state) => ({
    loadFile: state.loadFile,
    applyKsy: state.applyKsy,
    undo: state.undo,
    redo: state.redo,
    saveSession: state.saveSession,
    restoreSession: state.restoreSession,
    setBuffer: state.setBuffer,
    setKsySource: state.setKsySource,
    ksySource: state.ksySource,
    hexCols: state.hexCols,
    setHexCols: state.setHexCols,
    fileMeta: state.fileMeta,
    errors: state.errors,
  }));

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await loadFile(file);
  };

  const handleSessionSave = () => {
    const session = saveSession();
    if (!session) return;
    const blob = new Blob([JSON.stringify(session, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${session.fileMeta?.name ?? "session"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleSessionLoad = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const session = JSON.parse(text);
    await restoreSession(session);
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
        <button onClick={undo}>Undo</button>
        <button onClick={redo}>Redo</button>
      </div>
      <div className="top-bar__section">
        <button onClick={handleSessionSave}>セッション保存</button>
        <button onClick={() => sessionInputRef.current?.click()}>セッション読込</button>
        <input
          ref={sessionInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={handleSessionLoad}
        />
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
