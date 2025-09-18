import { useEffect, useState } from "react";
import "./App.css";
import { TopBar } from "./components/TopBar";
import { TreePanel } from "./components/TreePanel";
import { HexPane } from "./components/HexPane";
import { KsyEditor } from "./components/KsyEditor";
import { SplitPane } from "./components/SplitPane";
import { useSessionStore } from "./state/sessionStore";
import { useShallow } from "zustand/react/shallow";

function StatusBar() {
  const { selectedRange, fileMeta, buffer, caret } = useSessionStore(
    useShallow((state) => ({
      selectedRange: state.selectedRange,
      fileMeta: state.fileMeta,
      buffer: state.buffer,
      caret: state.caret,
    })),
  );

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

function useMediaQuery(query: string) {
  const getMatches = () =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false;

  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(mediaQueryList.matches);
    mediaQueryList.addEventListener("change", listener);

    return () => mediaQueryList.removeEventListener("change", listener);
  }, [query]);

  return matches;
}

function App() {
  const isNarrow = useMediaQuery("(max-width: 960px)");
  const mainSplitDirection = isNarrow ? "vertical" : "horizontal";
  const leftPaneClassName = `left-pane${isNarrow ? " left-pane--stacked" : ""}`;

  return (
    <div className="app-container">
      <TopBar />
      <main className="app-main">
        <SplitPane
          direction={mainSplitDirection}
          initialRatio={isNarrow ? 0.52 : 0.38}
          min={0.22}
          max={0.78}
        >
          <div className={leftPaneClassName}>
            <SplitPane direction="vertical" initialRatio={0.6} min={0.2} max={0.8}>
              <TreePanel />
              <KsyEditor />
            </SplitPane>
          </div>
          <div className="right-pane">
            <HexPane />
          </div>
        </SplitPane>
      </main>
      <StatusBar />
    </div>
  );
}

export default App;
