import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { SwitchSelectorBoard } from '../app/components/SwitchSelectorBoard';
import { SwitchStemMenuIcon } from '../app/components/SwitchStemMenuIcon';
import { SWITCH_OPTIONS, type SwitchOption, type SwitchTone } from '../app/switchAssets';
import { useT } from '../i18n';
import type { HeroDeviceModelId } from '../keyboard/devices';
export type SwitchSelectorPageProps = {
  model: HeroDeviceModelId;
  selectedKeys: Set<string>;
  hasSelection: boolean;
  allSelected: boolean;
  onToggleKey: (keyId: string) => void;
  onSelectAll: () => void;
  onDiscardSelection: () => void;
  switchPreviewByKey: Record<string, string>;
  selectedSwitch: SwitchOption;
  switchProfileMixed: boolean;
  onAssignSwitchProfile: (switchId: SwitchTone) => void;
  switchSearch: string;
  onSwitchSearchChange: (search: string) => void;
  switchBrandFilter: string;
  onSwitchBrandFilterChange: (brand: string) => void;
  canSave: boolean;
  profileBusy: boolean;
  saveState: 'idle' | 'sent';
  onSave: () => void;
};
export function SwitchSelectorPage({
  model,
  selectedKeys,
  hasSelection,
  allSelected,
  onToggleKey,
  onSelectAll,
  onDiscardSelection,
  switchPreviewByKey,
  selectedSwitch,
  switchProfileMixed,
  onAssignSwitchProfile,
  switchSearch,
  onSwitchSearchChange,
  switchBrandFilter,
  onSwitchBrandFilterChange,
  canSave,
  profileBusy,
  saveState,
  onSave
}: SwitchSelectorPageProps) {
  const tr = useT();
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const brandFilterRef = useRef<HTMLDivElement>(null);
  const filteredSwitchOptions = useMemo(() => SWITCH_OPTIONS.filter(option => {
    const matchesSearch = !switchSearch || option.fullName.toLowerCase().includes(switchSearch.toLowerCase()) || option.name.toLowerCase().includes(switchSearch.toLowerCase());
    const matchesBrand = switchBrandFilter === 'all' || option.brand === switchBrandFilter;
    return matchesSearch && matchesBrand;
  }), [switchSearch, switchBrandFilter]);
  const switchBrands = useMemo(() => Array.from(new Set(SWITCH_OPTIONS.map(option => option.brand))), []);
  const brandFilterLabel = switchBrandFilter === 'all' ? 'Filter by brand' : switchBrandFilter;
  useEffect(() => {
    if (!brandMenuOpen) {
      return;
    }
    const closeBrandMenu = (event: MouseEvent | TouchEvent) => {
      if (!brandFilterRef.current?.contains((event.target as Node))) {
        setBrandMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeBrandMenu);
    document.addEventListener('touchstart', closeBrandMenu);
    return () => {
      document.removeEventListener('mousedown', closeBrandMenu);
      document.removeEventListener('touchstart', closeBrandMenu);
    };
  }, [brandMenuOpen]);
  return <div className="page settings-page switch-selector-page page-enter">
      <div className="switch-page-actions">
        <button className="apply-button" onClick={onSave} disabled={!canSave || profileBusy}>
          {saveState === 'sent' ? tr('Saved') : tr('Save')}
        </button>
      </div>

      <section className="switch-selector-stage">
        <SwitchSelectorBoard model={model} selectedKeys={selectedKeys} onToggleKey={onToggleKey} switchImagesByKey={switchPreviewByKey} />
      </section>

      <div className="selection-instruction switch-selection-instruction">
        {hasSelection ? tr(selectedKeys.size === 1 ? '{count} KEY SELECTED' : '{count} KEYS SELECTED', {
        count: selectedKeys.size
      }) : tr('SELECT ONE OR MORE KEYS FIRST')}
      </div>

      <div className="switch-selector-heading-row">
        <h1>{tr('Switch Selector')}</h1>
        <div className="selection-actions">
          <button type="button" className="secondary-button" disabled={allSelected} aria-pressed={allSelected} onClick={onSelectAll}>
            {tr('Select all keys')}
          </button>
          <button type="button" className={hasSelection ? 'secondary-button' : 'ghost-button'} disabled={!hasSelection} onClick={onDiscardSelection}>
            {tr('Discard selection')}
          </button>
        </div>
      </div>

      <section className="switch-assignment-grid">
        <article className="settings-card switch-assignment-card">
          <div className="settings-card-head">
            <h2>{tr('Assign Switch Profiles')}</h2>
            <p>{tr('Select keys on the keyboard preview, then choose a calibration profile for your installed switches. The keyboard reports its saved profile IDs; it does not detect the physical switch model.')}</p>
          </div>

          <div className="switch-toolbar">
            <label className="switch-search">
              <Search size={16} />
              <input type="text" value={switchSearch} onChange={e => onSwitchSearchChange(e.target.value)} placeholder={tr('Search for a switch profile')} />
            </label>

            <div className="switch-brand-filter" ref={brandFilterRef}>
              <button type="button" className={`brand-filter-trigger ${brandMenuOpen ? 'is-open' : ''}`} aria-haspopup="listbox" aria-expanded={brandMenuOpen} onClick={() => setBrandMenuOpen(open => !open)}>
                <span>{tr(brandFilterLabel)}</span>
                <ChevronDown size={16} />
              </button>

              {brandMenuOpen && <div className="brand-filter-menu" role="listbox" aria-label={tr('Filter switch profiles by brand')}>
                  <button type="button" role="option" aria-selected={switchBrandFilter === 'all'} className={switchBrandFilter === 'all' ? 'is-selected' : ''} onClick={() => {
                onSwitchBrandFilterChange('all');
                setBrandMenuOpen(false);
              }}>
                    {tr('All brands')}
                  </button>
                  {switchBrands.map(brand => <button key={brand} type="button" role="option" aria-selected={switchBrandFilter === brand} className={switchBrandFilter === brand ? 'is-selected' : ''} onClick={() => {
                onSwitchBrandFilterChange(brand);
                setBrandMenuOpen(false);
              }}>
                      {tr(brand)}
                    </button>)}
                </div>}
            </div>
          </div>

          <div className="switch-profile-grid">
            {filteredSwitchOptions.map(option => <button key={option.id} type="button" className={`switch-profile-card ${(!hasSelection || !switchProfileMixed) && option.id === selectedSwitch.id ? 'is-active' : ''}`} disabled={!hasSelection || profileBusy} title={!hasSelection ? tr('Select one or more keys first') : undefined} onClick={() => onAssignSwitchProfile(option.id)}>
                <span className="switch-profile-thumb" style={{
              color: option.accent
            }}>
                  {option.top ? <img src={option.top} alt={option.fullName} /> : <SwitchStemMenuIcon />}
                </span>
                <span className="switch-profile-brand">{tr(option.brand)}</span>
                <strong>{option.fullName}</strong>
              </button>)}
            {!filteredSwitchOptions.length && <div className="switch-profile-empty">{tr('No switch profiles match the current search.')}</div>}
          </div>
        </article>
      </section>
    </div>;
}
export default SwitchSelectorPage;
