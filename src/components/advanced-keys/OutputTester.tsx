import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { HERO68_KEY_LABEL_BY_ID } from '../../app/helpers';

const label = (key: string) => HERO68_KEY_LABEL_BY_ID[key] ?? key;

export function OutputTester() {
  const { tr } = useI18n();
  const [held, setHeld] = useState<string[]>([]);
  const [released, setReleased] = useState<string[]>([]);
  return (
    <div
      className="ak-tester"
      tabIndex={0}
      aria-label={tr('Advanced Key output tester')}
      onBlur={() => setHeld([])}
      onKeyDown={e => {
        if (e.key === 'Tab') {
          return;
        }
        e.stopPropagation();
        e.preventDefault();
        if (!e.repeat) {
          setHeld(h => [...new Set([...h, e.code])]);
        }
      }}
      onKeyUp={e => {
        if (e.key === 'Tab') {
          return;
        }
        e.stopPropagation();
        e.preventDefault();
        setHeld(h => h.filter(k => k !== e.code));
        setReleased(h => [e.code, ...h.filter(k => k !== e.code)].slice(0, 5));
      }}
    >
      <strong>{tr('Test your binding')}</strong>
      <p>{tr('Save to the keyboard, then click here and press your configured key.')}</p>
      <small>{tr('Pressed keys')}</small>
      <div className="ak-output">
        {held.length ? held.map(k => <kbd key={k}>{label(k)}</kbd>) : <span>—</span>}
      </div>
      <small>{tr('Recently released')}</small>
      <div className="ak-output is-released">
        {released.map(k => (
          <kbd key={k}>{label(k)}</kbd>
        ))}
      </div>
    </div>
  );
}
