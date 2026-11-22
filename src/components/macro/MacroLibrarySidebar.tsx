import { ListOrdered, Search } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { MacroDefinition } from '../../state/macros';

type MacroLibrarySidebarProps = {
  macros: MacroDefinition[];
  filtered: MacroDefinition[];
  activeMacroId: string | null;
  query: string;
  locked: boolean;
  onQueryChange: (query: string) => void;
  onSelect: (macro: MacroDefinition) => void;
};

export function MacroLibrarySidebar({
  macros,
  filtered,
  activeMacroId,
  query,
  locked,
  onQueryChange,
  onSelect
}: MacroLibrarySidebarProps) {
  const { tr } = useI18n();
  return (
    <aside className="macro-library">
      <div className="macro-section-title">
        <h2>{tr('Your macros')}</h2>
        <span>{macros.length}</span>
      </div>
      <label className="macro-search">
        <Search size={16} />
        <input
          type="search"
          aria-label={tr('Search macros…')}
          placeholder={tr('Search macros…')}
          value={query}
          onChange={event => onQueryChange(event.target.value)}
        />
      </label>
      <div className="macro-library-list">
        {filtered.map(macro => (
          <button
            key={macro.id}
            disabled={locked}
            className={activeMacroId === macro.id ? 'is-active' : ''}
            onClick={() => onSelect(macro)}
          >
            <ListOrdered size={19} />
            <span>
              <strong>{macro.name}</strong>
              <small>
                {tr(macro.events.length === 1 ? '{count} event' : '{count} events', {
                  count: macro.events.length
                })}{' '}
                · {(macro.events.reduce((sum, event) => sum + event.delayMs, 0) / 1000).toFixed(2)}{' '}
                s
              </small>
            </span>
          </button>
        ))}
        {!macros.length && <p>{tr('Create a macro to start your library.')}</p>}
        {!!macros.length && !filtered.length && <p>{tr('No macros match your search.')}</p>}
      </div>
      <p className="macro-local-note">
        {tr('Stored on this computer. Export your library to move it to another device.')}
      </p>
    </aside>
  );
}
