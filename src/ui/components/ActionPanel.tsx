import { useEffect, useState, type FormEvent } from 'react';
import type { ActionOptionDTO, ActionOptionKey, PlayerActionDTO } from '../../contracts/views';
import type { Motivation } from '../client/ReflectionJournal';
import type { ReflectionsApi } from '../hooks/useGameClient';
import { ReflectionPrompt } from './ReflectionPrompt';

export interface ActionPanelProps {
  turn: number;
  options: ActionOptionDTO[];
  pendingAction: PlayerActionDTO | null;
  pendingLabel: string | null;
  waitingFor: string[];
  canResolveNow: boolean;
  busy: boolean;
  reflections: ReflectionsApi;
  onSubmit(action: PlayerActionDTO): void;
  onCancel(): void;
  onResolveNow(): void;
}

export function ActionPanel(props: ActionPanelProps) {
  const { turn, options, pendingAction, pendingLabel, waitingFor, canResolveNow, busy, reflections } = props;
  const [selectedKey, setSelectedKey] = useState<ActionOptionKey | null>(null);
  const [amount, setAmount] = useState('');
  const [motivation, setMotivation] = useState<Motivation | null>(null);
  const selected = options.find((option) => option.key === selectedKey) ?? null;

  useEffect(() => {
    setSelectedKey(null);
    setMotivation(null);
  }, [turn]);

  if (pendingAction) {
    return (
      <section className="panel actions" id="actions" aria-labelledby="actions-title">
        <h2 id="actions-title">Your action for turn {turn}</h2>
        <p>
          You chose <strong>{pendingLabel}</strong>.
        </p>
        {waitingFor.length > 0 ? (
          <p>
            Waiting for: {waitingFor.join(', ')}. The turn resolves when every connected player has chosen; choices stay hidden until
            then.
          </p>
        ) : (
          <p>Resolving the turn…</p>
        )}
        <div className="button-row">
          <button type="button" onClick={props.onCancel} disabled={busy}>
            Change my choice
          </button>
          {canResolveNow && waitingFor.length > 0 && (
            <button type="button" onClick={props.onResolveNow} disabled={busy}>
              Resolve turn now
            </button>
          )}
        </div>
        {canResolveNow && waitingFor.length > 0 && (
          <p className="hint">Resolving now treats anyone who has not chosen as waiting this turn.</p>
        )}
      </section>
    );
  }

  const parsedAmount = Number(amount);
  const maxAmount = selected?.maxAmount ?? 0;
  const amountInvalid =
    selected?.key === 'contribute' && (!Number.isInteger(parsedAmount) || parsedAmount < 1 || parsedAmount > maxAmount);
  const showReflection = Boolean(selected?.reflective) && !reflections.hidden;

  const choose = (option: ActionOptionDTO) => {
    setSelectedKey(option.key);
    if (option.template.type === 'CONTRIBUTE_TO_PROJECT') setAmount(String(option.template.amount));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !selected.available || amountInvalid) return;
    const action: PlayerActionDTO =
      selected.template.type === 'CONTRIBUTE_TO_PROJECT' ? { ...selected.template, amount: parsedAmount } : selected.template;
    if (showReflection && motivation) reflections.record({ turn, decision: selected.label, motivation });
    props.onSubmit(action);
  };

  return (
    <section className="panel actions" id="actions" aria-labelledby="actions-title">
      <h2 id="actions-title">Choose your action for turn {turn}</h2>
      <form onSubmit={submit}>
        <fieldset>
          <legend>One action per turn. Costs and known consequences are shown before you confirm.</legend>
          <ul className="action-list">
            {options.map((option) => (
              <li key={option.key}>
                <label className={`action-option${option.available ? '' : ' unavailable'}${selectedKey === option.key ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="action"
                    value={option.key}
                    checked={selectedKey === option.key}
                    disabled={!option.available}
                    onChange={() => choose(option)}
                  />
                  <span className="action-name">{option.label}</span>
                  <span className="action-cost">{option.costLabel}</span>
                  {!option.available && option.unavailableReason && <span className="action-reason">Unavailable: {option.unavailableReason}</span>}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        {selected && (
          <div className="action-details" aria-live="polite">
            <h3>{selected.label}</h3>
            <p>
              <strong>Cost:</strong> {selected.costLabel}
            </p>
            {selected.key === 'contribute' && (
              <p>
                <label htmlFor="contribution-amount">Credits to contribute (1–{maxAmount})</label>{' '}
                <input
                  id="contribution-amount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={maxAmount}
                  step={1}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-invalid={amountInvalid}
                />
                {amountInvalid && <span className="action-reason"> Enter a whole number from 1 to {maxAmount}.</span>}
              </p>
            )}
            <h4>Now</h4>
            <ul>
              {selected.immediate.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {selected.delayed.length > 0 && (
              <>
                <h4>Later (delayed effects)</h4>
                <ul>
                  {selected.delayed.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}
            <h4>Known risks</h4>
            <ul>
              {selected.risks.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {showReflection && <ReflectionPrompt value={motivation} onChange={setMotivation} onHide={() => reflections.setHidden(true)} />}
          </div>
        )}

        <button type="submit" className="primary" disabled={!selected || !selected.available || busy || amountInvalid}>
          {selected ? `Confirm: ${selected.label}` : 'Select an action'}
        </button>
      </form>
    </section>
  );
}
