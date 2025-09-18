import { useSessionStore } from "../state/sessionStore";
import { useShallow } from "zustand/react/shallow";

export function KsyEditor() {
  const { ksySource, setKsySource, applyKsy } = useSessionStore(
    useShallow((state) => ({
      ksySource: state.ksySource,
      setKsySource: state.setKsySource,
      applyKsy: state.applyKsy,
    })),
  );

  return (
    <section className="ksy-editor">
      <h2>KSY エディタ</h2>
      <textarea
        value={ksySource}
        onChange={(e) => setKsySource(e.target.value)}
        spellCheck={false}
        placeholder="KSY (YAML) を貼り付けてください"
      />
      <button onClick={() => applyKsy()} disabled={!ksySource.trim()}>
        再パース
      </button>
    </section>
  );
}
