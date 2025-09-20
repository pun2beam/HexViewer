import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
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
  const { buffer, selectedRange, selectRange, hexCols, caret } = useSessionStore(
    useShallow((state) => ({
      buffer: state.buffer,
      selectedRange: state.selectedRange,
      selectRange: state.selectRange,
      hexCols: state.hexCols,
      caret: state.caret,
    })),
  );
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [addressInput, setAddressInput] = useState("");
  const [addressBase, setAddressBase] = useState<"hex" | "dec">("hex");
  const [addressError, setAddressError] = useState<string | null>(null);

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

  useEffect(() => {
    setAddressError(null);
    setAddressInput("");
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

  useEffect(() => {
    if (!selectedRange) {
      setAddressInput("");
      return;
    }
    const value = selectedRange.start;
    setAddressInput(
      addressBase === "hex" ? value.toString(16).toUpperCase() : value.toString(10)
    );
  }, [selectedRange, addressBase]);

  const handleAddressFormatChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value === "dec" ? "dec" : "hex";
    setAddressBase(value);
    setAddressError(null);
  };

  const handleJumpSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!buffer) return;
      const rawValue = addressInput.trim();
      if (!rawValue) {
        setAddressError("アドレスを入力してください");
        return;
      }

      let parsed: number | null = null;
      if (addressBase === "hex") {
        const normalized = rawValue.startsWith("0x") || rawValue.startsWith("0X")
          ? rawValue.slice(2)
          : rawValue;
        if (/^[0-9a-fA-F]+$/.test(normalized)) {
          parsed = parseInt(normalized, 16);
        }
      } else {
        if (/^[0-9]+$/.test(rawValue)) {
          parsed = parseInt(rawValue, 10);
        }
      }

      if (parsed === null || Number.isNaN(parsed)) {
        setAddressError("無効なアドレスです");
        return;
      }

      if (parsed < 0 || parsed >= buffer.length) {
        setAddressError(
          `アドレス範囲外です (0 - ${Math.max(buffer.length - 1, 0)})`
        );
        return;
      }

      setAddressError(null);
      selectRange({ start: parsed, length: 1 });
      const element = containerRef.current;
      if (element) {
        const rowIndex = Math.floor(parsed / hexCols);
        const targetScrollTop = Math.max(
          0,
          rowIndex * ROW_HEIGHT - Math.max((viewportHeight - ROW_HEIGHT) / 2, 0)
        );
        element.scrollTop = targetScrollTop;
        setScrollTop(targetScrollTop);
      }
    },
    [addressInput, addressBase, buffer, hexCols, selectRange, viewportHeight]
  );

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
        {buffer && (
          <form className="hex-pane__jump" onSubmit={handleJumpSubmit}>
            <div className="hex-pane__jump-format">
              <label>
                <input
                  type="radio"
                  name="address-format"
                  value="hex"
                  checked={addressBase === "hex"}
                  onChange={handleAddressFormatChange}
                />
                Hex
              </label>
              <label>
                <input
                  type="radio"
                  name="address-format"
                  value="dec"
                  checked={addressBase === "dec"}
                  onChange={handleAddressFormatChange}
                />
                Dec
              </label>
            </div>
            <input
              type="text"
              value={addressInput}
              onChange={(event) => {
                setAddressInput(event.target.value);
                if (addressError) {
                  setAddressError(null);
                }
              }}
              placeholder={addressBase === "hex" ? "1A" : "26"}
            />
            <button type="submit">ジャンプ</button>
          </form>
        )}
      </div>
      {addressError && <div className="hex-pane__jump-error">{addressError}</div>}
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
