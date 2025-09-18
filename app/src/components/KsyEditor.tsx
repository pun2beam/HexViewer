import { useSessionStore } from "../state/sessionStore";

export function KsyEditor() {
  const { ksySource, setKsySource, applyKsy } = useSessionStore((state) => ({
    ksySource: state.ksySource,
    setKsySource: state.setKsySource,
    applyKsy: state.applyKsy,
  }));

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
