import "./App.css";
import { TopBar } from "./components/TopBar";
import { TreePanel } from "./components/TreePanel";
import { HexPane } from "./components/HexPane";
import { KsyEditor } from "./components/KsyEditor";
import { useSessionStore } from "./state/sessionStore";

function StatusBar() {
  const { selectedRange, fileMeta, buffer, caret } = useSessionStore((state) => ({
    selectedRange: state.selectedRange,
    fileMeta: state.fileMeta,
    buffer: state.buffer,
    caret: state.caret,
  }));

  const selectionText = selectedRange
    ? `${selectedRange.start} (+0x${selectedRange.start.toString(16)}) / ${selectedRange.length} bytes`
    : "-";

  return (
    <footer className="status-bar">
      <span>サイズ: {fileMeta ? `${fileMeta.size.toLocaleString()} bytes` : "-"}</span>
      <span>
        カーソル: {caret !== null ? `${caret} (0x${caret.toString(16)})` : "-"}
      </span>
      <span>選択範囲: {selectionText}</span>
      <span>バッファ: {buffer ? `${buffer.length} bytes` : "なし"}</span>
    </footer>
  );
}

function App() {
  return (
    <div className="app-container">
      <TopBar />
      <main className="app-main">
        <div className="left-pane">
          <TreePanel />
          <KsyEditor />
        </div>
        <div className="right-pane">
          <HexPane />
        </div>
      </main>
      <StatusBar />
    </div>
  );
}

export default App;
