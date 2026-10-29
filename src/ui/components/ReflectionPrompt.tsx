import { MOTIVATIONS, type Motivation } from '../client/ReflectionJournal';

interface ReflectionPromptProps {
  value: Motivation | null;
  onChange(value: Motivation | null): void;
  onHide(): void;
}

/**
 * Self-inquiry, not diagnosis: optional, private to this browser, and without any effect on the
 * simulation. Confirming the action never requires an answer.
 */
export function ReflectionPrompt({ value, onChange, onHide }: ReflectionPromptProps) {
  return (
    <fieldset className="reflection">
      <legend>Optional reflection: what is driving this decision right now?</legend>
      <p className="hint">Private to this browser tab. It does not affect the simulation and you can skip it.</p>
      <div className="choices">
        {MOTIVATIONS.map((motivation) => (
          <label key={motivation.value} className="choice">
            <input type="radio" name="motivation" value={motivation.value} checked={value === motivation.value} onChange={() => onChange(motivation.value)} />
            {motivation.label}
          </label>
        ))}
        <label className="choice">
          <input type="radio" name="motivation" value="" checked={value === null} onChange={() => onChange(null)} />
          Skip
        </label>
      </div>
      <button type="button" className="link-button" onClick={onHide}>
        Don&apos;t ask me this again this session
      </button>
    </fieldset>
  );
}
