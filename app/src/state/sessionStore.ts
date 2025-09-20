import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Annotation, AstNode, ParseResult, Range, SessionFileMeta } from "../types";
import { parseWithKsy } from "../utils/kaitaiParser";

interface SessionState {
  buffer: Uint8Array | null;
  fileMeta: SessionFileMeta | null;
  ksySource: string;
  parseResult: ParseResult | null;
  annotations: Annotation[];
  hexCols: 16 | 24 | 32;
  caret: number | null;
  selectedNodeId: string | null;
  selectedRange: Range | null;
  isParsing: boolean;
  parseToken: symbol | null;
  errors: string[];
  loadFile: (file: File) => Promise<void>;
  setBuffer: (data: Uint8Array, meta?: SessionFileMeta | null) => Promise<void>;
  setKsySource: (source: string) => void;
  applyKsy: (source?: string) => Promise<void>;
  selectNode: (node: AstNode | null) => void;
  selectRange: (range: Range | null) => void;
  setHexCols: (cols: 16 | 24 | 32) => void;
  editByte: (offset: number, value: number) => void;
}

async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cloneBuffer(buf: Uint8Array): Uint8Array {
  return new Uint8Array(buf);
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      buffer: null,
      fileMeta: null,
      ksySource: "",
      parseResult: null,
      annotations: [],
      hexCols: 16,
      caret: null,
      selectedNodeId: null,
      selectedRange: null,
      isParsing: false,
      errors: [],
      parseToken: null,

      loadFile: async (file: File) => {
        const buffer = new Uint8Array(await file.arrayBuffer());
        const sha256 = await hashBuffer(buffer.buffer);
        const meta: SessionFileMeta = {
          name: file.name,
          size: buffer.length,
          sha256,
        };
        await get().setBuffer(buffer, meta);
      },

      setBuffer: async (data: Uint8Array, meta?: SessionFileMeta | null) => {
        const cloned = cloneBuffer(data);
        set({ buffer: cloned, fileMeta: meta ?? get().fileMeta });
        if (get().ksySource.trim()) {
          await get().applyKsy();
        } else {
          set({ parseResult: null });
        }
      },

      setKsySource: (source: string) => {
        set({ ksySource: source });
      },

      applyKsy: async (source?: string) => {
        const currentSource = source ?? get().ksySource;
        const token = Symbol("parse");
        set({ ksySource: currentSource, isParsing: true, parseToken: token });
        const buffer = get().buffer;
        if (!buffer) {
          set({ parseResult: null, errors: [], isParsing: false, parseToken: null });
          return;
        }
        try {
          const result = await parseWithKsy(buffer, currentSource);
          if (get().parseToken !== token) {
            return;
          }
          set({
            parseResult: result,
            errors: result.errors.map((e) => e.message),
          });
          if (result.root) {
            set({
              selectedNodeId: result.root.id,
              selectedRange: result.root.range,
              caret: result.root.range.start,
            });
          }
        } catch (err) {
          if (get().parseToken !== token) {
            return;
          }
          set({
            parseResult: null,
            errors: [err instanceof Error ? err.message : String(err)],
          });
        } finally {
          if (get().parseToken === token) {
            set({ isParsing: false, parseToken: null });
          }
        }
      },

      selectNode: (node: AstNode | null) => {
        if (!node) {
          set({ selectedNodeId: null, selectedRange: null, caret: null });
          return;
        }
        set({ selectedNodeId: node.id, selectedRange: node.range, caret: node.range.start });
      },

      selectRange: (range: Range | null) => {
        if (!range) {
          set({ selectedRange: null, caret: null });
          return;
        }
        const result = get().parseResult;
        let bestNodeId: string | null = null;
        if (result) {
          const candidates = result.flatNodes.filter((node) => {
            const withinStart = range.start >= node.range.start;
            const withinEnd =
              range.start + range.length <= node.range.start + node.range.length;
            return withinStart && withinEnd;
          });
          candidates.sort(
            (a, b) => a.range.length - b.range.length || a.range.start - b.range.start
          );
          bestNodeId = candidates[0]?.id ?? null;
        }
        set({
          selectedRange: range,
          caret: range.start,
          selectedNodeId: bestNodeId,
        });
      },

      setHexCols: (cols: 16 | 24 | 32) => set({ hexCols: cols }),

      editByte: (offset: number, value: number) => {
        const buffer = get().buffer;
        if (!buffer || offset < 0 || offset >= buffer.length) {
          return;
        }
        const clamped = value & 0xff;
        const newBuffer = cloneBuffer(buffer);
        newBuffer[offset] = clamped;
        set({ buffer: newBuffer });
        if (get().ksySource.trim()) {
          void get().applyKsy();
        }
      },
    }),
    {
      name: "hex-viewer-session",
      partialize: (state) => ({
        ksySource: state.ksySource,
        hexCols: state.hexCols,
      }),
    }
  )
);
