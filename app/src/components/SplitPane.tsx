import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

type SplitPaneProps = {
  direction: "horizontal" | "vertical";
  children: [ReactNode, ReactNode];
  /** 最初のペインの比率 (0-1) */
  initialRatio?: number;
  /** 最初のペインの最小比率 */
  min?: number;
  /** 最初のペインの最大比率 */
  max?: number;
  className?: string;
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

export function SplitPane({
  direction,
  children,
  initialRatio = 0.5,
  min = 0.2,
  max = 0.8,
  className,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ratio, setRatio] = useState(() => clamp(initialRatio, min, max));
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setRatio(clamp(initialRatio, min, max));
  }, [direction, initialRatio, min, max]);

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(event: MouseEvent) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      const nextRatio = clamp(
        direction === "horizontal"
          ? (event.clientX - rect.left) / rect.width
          : (event.clientY - rect.top) / rect.height,
        min,
        max,
      );

      setRatio(nextRatio);
      event.preventDefault();
    }

    function handleMouseUp() {
      setIsDragging(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [direction, isDragging, min, max]);

  const dividerSize = useMemo(() => (direction === "horizontal" ? 8 : 6), [direction]);

  const templateStyle = useMemo(() => {
    const first = Math.max(ratio, 0.0001);
    const second = Math.max(1 - ratio, 0.0001);

    if (direction === "horizontal") {
      return { gridTemplateColumns: `${first}fr ${dividerSize}px ${second}fr` };
    }
    return { gridTemplateRows: `${first}fr ${dividerSize}px ${second}fr` };
  }, [direction, dividerSize, ratio]);

  const paneClass = `split-pane split-pane--${direction} ${isDragging ? "split-pane--dragging" : ""} ${
    className ?? ""
  }`;

  const dividerClass = `split-pane__divider split-pane__divider--${direction === "horizontal" ? "vertical" : "horizontal"} ${
    isDragging ? "split-pane__divider--dragging" : ""
  }`;

  return (
    <div ref={containerRef} className={paneClass.trim()} style={templateStyle}>
      <div className="split-pane__pane">{children[0]}</div>
      <div
        className={dividerClass.trim()}
        onMouseDown={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
      />
      <div className="split-pane__pane">{children[1]}</div>
    </div>
  );
}
