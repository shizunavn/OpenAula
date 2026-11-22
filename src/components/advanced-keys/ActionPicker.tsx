import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { REMAP_CATEGORIES, remapLabel } from '../../protocol/hero68/remap';

export function ActionPicker({
  value,
  onChange,
  title,
  onSelectSlot
}: {
  value: number;
  onChange: (v: number) => void;
  title: string;
  onSelectSlot?: () => void;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({
    left: 0,
    top: 0
  });
  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (e: PointerEvent) => {
      if (
        !container.current?.contains(e.target as Node) &&
        !popup.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const move = (e: Event) => {
      if (!(e.target instanceof Node) || !popup.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', move);
    window.addEventListener('scroll', move, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', move);
      window.removeEventListener('scroll', move, true);
    };
  }, [open]);
  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const categories = REMAP_CATEGORIES.map(c => ({
    ...c,
    actions: c.actions.filter(a =>
      normalize(`${a.label} ${a.description}`).includes(normalize(query))
    )
  })).filter(c => c.actions.length);
  return (
    <div className="ak-action-picker" ref={container}>
      <button
        type="button"
        className="ak-action-key"
        aria-label={`${title}: ${remapLabel(value)}`}
        aria-expanded={open}
        onClick={() => {
          onSelectSlot?.();
          const rect = container.current!.getBoundingClientRect();
          setPosition({
            left: Math.max(
              18,
              Math.min(rect.left, window.innerWidth - Math.min(440, window.innerWidth - 36) - 18)
            ),
            top: Math.max(18, Math.min(rect.bottom + 8, window.innerHeight - 420))
          });
          setOpen(!open);
        }}
      >
        {remapLabel(value)}
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            className="ak-action-popover"
            style={{
              position: 'fixed',
              left: position.left,
              top: position.top
            }}
            role="dialog"
            aria-label={tr('Choose {action}', {
              action: title
            })}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
              }
            }}
          >
            <div className="ak-picker-head">
              <strong>{title}</strong>
              <button
                className="icon-button"
                aria-label={tr('Close action picker')}
                onClick={() => setOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <label className="ak-search">
              <Search size={16} />
              <input
                autoFocus
                type="search"
                placeholder={tr('Search actions…')}
                aria-label={tr('Search actions')}
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </label>
            <div className="ak-action-results">
              {categories.map(c => (
                <section key={c.id}>
                  <h4>{tr(c.label)}</h4>
                  <div>
                    {c.actions.map((a, i) => (
                      <button
                        key={`${a.value}:${i}`}
                        className={a.value === value ? 'is-active' : ''}
                        onClick={() => {
                          onChange(a.value);
                          setOpen(false);
                          setQuery('');
                          container.current?.querySelector('button')?.focus();
                        }}
                      >
                        {tr(a.label)}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {!categories.length && <p>{tr('No actions match your search.')}</p>}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
