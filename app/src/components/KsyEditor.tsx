import { useSessionStore } from "../state/sessionStore";
import { useShallow } from "zustand/react/shallow";

export function KsyEditor() {
  const { ksySource, setKsySource } = useSessionStore(
    useShallow((state) => ({
      ksySource: state.ksySource,
      setKsySource: state.setKsySource,
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
    </section>
  );
}
