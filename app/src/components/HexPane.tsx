import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSessionStore } from "../state/sessionStore";
import { useShallow } from "zustand/react/shallow";

const ROW_HEIGHT = 24;
const OVERSCAN = 12;

function formatHex(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function isPrintable(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

export function HexPane() {
  const { buffer, selectedRange, selectRange, hexCols, editByte, caret } = useSessionStore(
    useShallow((state) => ({
      buffer: state.buffer,
      selectedRange: state.selectedRange,
      selectRange: state.selectRange,
      hexCols: state.hexCols,
      editByte: state.editByte,
      caret: state.caret,
    })),
  );
  const [hexInput, setHexInput] = useState("");
  const [asciiInput, setAsciiInput] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!buffer || caret === null) {
      setHexInput("");
      setAsciiInput("");
      return;
    }
    const byte = buffer[caret];
    setHexInput(formatHex(byte));
    setAsciiInput(isPrintable(byte) ? String.fromCharCode(byte) : ".");
  }, [buffer, caret]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setViewportHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    element.scrollTop = 0;
    setScrollTop(0);
  }, [buffer]);

  const rowCount = buffer ? Math.ceil(buffer.length / hexCols) : 0;
  const totalHeight = rowCount * ROW_HEIGHT;
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT);
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endRow = Math.min(rowCount, startRow + visibleRowCount + OVERSCAN * 2);

  const handleByteClick = useCallback(
    (index: number) => {
      selectRange({ start: index, length: 1 });
    },
    [selectRange]
  );

  const commitHexEdit = useCallback(() => {
    if (caret === null) return;
    const parsed = parseInt(hexInput, 16);
    if (Number.isNaN(parsed)) return;
    editByte(caret, parsed);
  }, [caret, editByte, hexInput]);

  const commitAsciiEdit = useCallback(() => {
    if (caret === null || !asciiInput) return;
    editByte(caret, asciiInput.charCodeAt(0));
  }, [asciiInput, caret, editByte]);

  const rangeLabel = useMemo(() => {
    if (!selectedRange) return "";
    const end =
      selectedRange.length > 0
        ? selectedRange.start + selectedRange.length - 1
        : selectedRange.start;
    return `選択: ${selectedRange.start} - ${end} (${selectedRange.length} bytes)`;
  }, [selectedRange]);

  const rows = useMemo(() => {
    if (!buffer) return [] as number[];
    return Array.from({ length: endRow - startRow }, (_, i) => startRow + i);
  }, [buffer, startRow, endRow]);

  return (
    <section className="hex-pane">
      <div className="hex-pane__toolbar">
        <span>{rangeLabel}</span>
        {caret !== null && (
          <div className="hex-pane__editor">
            <label>
              HEX
              <input
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value.toUpperCase())}
                onBlur={commitHexEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitHexEdit();
                  }
                }}
                maxLength={2}
              />
            </label>
            <label>
              ASCII
              <input
                value={asciiInput}
                onChange={(e) => setAsciiInput(e.target.value.slice(0, 1))}
                onBlur={commitAsciiEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitAsciiEdit();
                  }
                }}
                maxLength={1}
              />
            </label>
          </div>
        )}
      </div>
      {buffer ? (
        <div
          ref={containerRef}
          className="hex-pane__list hex-pane__list--virtual"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div style={{ height: totalHeight, position: "relative" }}>
            {rows.map((rowIndex) => {
              const start = rowIndex * hexCols;
              const bytes = buffer.subarray(start, Math.min(buffer.length, start + hexCols));
              return (
                <div
                  key={rowIndex}
                  className="hex-row"
                  style={{
                    position: "absolute",
                    top: rowIndex * ROW_HEIGHT,
                    height: ROW_HEIGHT,
                  }}
                >
                  <span className="hex-row__offset">{formatHex(start).padStart(8, "0")}</span>
                  <div className="hex-row__bytes">
                    {Array.from(bytes).map((byte, i) => {
                      const offset = start + i;
                      const isSelected =
                        selectedRange &&
                        offset >= selectedRange.start &&
                        offset < selectedRange.start + selectedRange.length;
                      const isCaret = caret === offset;
                      const classes = ["hex-byte"];
                      if (isSelected) classes.push("hex-byte--selected");
                      if (isCaret) classes.push("hex-byte--caret");
                      return (
                        <button
                          key={offset}
                          className={classes.join(" ")}
                          onClick={() => handleByteClick(offset)}
                        >
                          {formatHex(byte)}
                        </button>
                      );
                    })}
                  </div>
                  <div className="hex-row__ascii">
                    {Array.from(bytes).map((byte, i) => {
                      const offset = start + i;
                      const isSelected =
                        selectedRange &&
                        offset >= selectedRange.start &&
                        offset < selectedRange.start + selectedRange.length;
                      const isCaret = caret === offset;
                      const classes = ["ascii-byte"];
                      if (isSelected) classes.push("ascii-byte--selected");
                      if (isCaret) classes.push("ascii-byte--caret");
                      return (
                        <button
                          key={offset}
                          className={classes.join(" ")}
                          onClick={() => handleByteClick(offset)}
                        >
                          {isPrintable(byte) ? String.fromCharCode(byte) : "."}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="hex-pane__empty">バイナリを読み込むとダンプが表示されます。</div>
      )}
    </section>
  );
}
