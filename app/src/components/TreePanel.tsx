import { useEffect, useMemo, useRef, useState } from "react";
import type { AstNode } from "../types";
import { useSessionStore } from "../state/sessionStore";
import { useShallow } from "zustand/react/shallow";

function NodeItem({ node, depth }: { node: AstNode; depth: number }) {
  const { selectedNodeId, selectNode } = useSessionStore(
    useShallow((state) => ({
      selectedNodeId: state.selectedNodeId,
      selectNode: state.selectNode,
    })),
  );
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isSelected = selectedNodeId === node.id;

  return (
    <div className="tree-node" style={{ paddingLeft: depth * 12 }}>
      {hasChildren && (
        <button className="tree-node__toggle" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "▼" : "▶"}
        </button>
      )}
      {!hasChildren && <span className="tree-node__toggle" />}
      <button
        className={`tree-node__label ${isSelected ? "tree-node__label--selected" : ""}`}
        onClick={() => selectNode(node)}
      >
        {node.name} <span className="tree-node__type">({node.typeName})</span>
      </button>
      {hasChildren && expanded && (
        <div className="tree-node__children">
          {node.children?.map((child) => (
            <NodeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeDetails({ node }: { node: AstNode }) {
  const valueText = useMemo(() => {
    if (node.value === undefined || node.value === null) return "";
    if (typeof node.value === "object") {
      return JSON.stringify(node.value, null, 2);
    }
    return String(node.value);
  }, [node.value]);

  return (
    <div className="node-details">
      <h3>{node.name}</h3>
      <div className="node-details__grid">
        <span>型</span>
        <span>{node.typeName}</span>
        <span>オフセット</span>
        <span>{node.range.start} (0x{node.range.start.toString(16)})</span>
        <span>サイズ</span>
        <span>{node.range.length} bytes</span>
        {node.endian && (
          <>
            <span>エンディアン</span>
            <span>{node.endian}</span>
          </>
        )}
      </div>
      {valueText && (
        <div className="node-details__value">
          <h4>値</h4>
          <pre>{valueText}</pre>
        </div>
      )}
      {node.attributes && Object.keys(node.attributes).length > 0 && (
        <div className="node-details__value">
          <h4>属性</h4>
          <pre>{JSON.stringify(node.attributes, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export function TreePanel() {
  const { parseResult, selectedNodeId } = useSessionStore(
    useShallow((state) => ({
      parseResult: state.parseResult,
      selectedNodeId: state.selectedNodeId,
    })),
  );
  const [treeRatio, setTreeRatio] = useState(0.6);
  const [isDragging, setIsDragging] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedNode = useMemo(() => {
    if (!parseResult?.root) return null;
    const stack: AstNode[] = [parseResult.root];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.id === selectedNodeId) return node;
      if (node.children) stack.push(...node.children);
    }
    return null;
  }, [parseResult, selectedNodeId]);

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(event: MouseEvent) {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const relativeY = event.clientY - rect.top;
      const ratio = relativeY / rect.height;
      const clampedRatio = Math.min(Math.max(ratio, 0.2), 0.8);
      setTreeRatio(clampedRatio);
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
  }, [isDragging]);

  const gridTemplateRows = selectedNode ? `${treeRatio}fr 6px ${1 - treeRatio}fr` : "1fr";

  return (
    <section className="tree-panel">
      <h2>構造ツリー</h2>
      <div
        ref={splitContainerRef}
        className={`tree-panel__content${isDragging ? " tree-panel__content--dragging" : ""}`}
        style={{ gridTemplateRows }}
      >
        <div className="tree-panel__tree">
          {parseResult?.root ? (
            <NodeItem node={parseResult.root} depth={0} />
          ) : (
            <p className="tree-panel__empty">ファイルとKSYを読み込むと構造が表示されます。</p>
          )}
        </div>
        {selectedNode && (
          <>
            <div
              className="tree-panel__divider"
              onMouseDown={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
            />
            <div className="tree-panel__details">
              <NodeDetails node={selectedNode} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
