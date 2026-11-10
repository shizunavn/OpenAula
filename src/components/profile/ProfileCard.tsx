import { useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import {
  Copy,
  Download,
  Edit3,
  Link2,
  Link2Off,
  MoreHorizontal,
  Share2,
  Star,
  Trash2,
  Upload
} from 'lucide-react';
import { useI18n } from '../../i18n';
import {
  resolveWootProfileIconUrl,
  type WootProfileMetadata
} from '../../state/profileTypes';

export interface ProfileCardProps {
  profile: WootProfileMetadata;
  onboardIndex?: number; // 0..2 or 0..3 when inside Onboard section
  isSelected: boolean;
  isDragSource?: boolean;
  isDropTarget?: boolean;
  draggable?: boolean;
  shortcutKeys?: string[];
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onShare?: () => void;
  onMoveToInactive?: () => void;
  onMoveToOnboard?: () => void;
  onCopyToOnboard?: () => void;
  onCopyToInactive?: () => void;
  onLinkToApp?: () => void;
  onUnlinkProfile?: () => void;
  onSetAsDefault?: () => void;
  onDelete?: () => void;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLDivElement>) => void;
}

export function renderProfileAvatarIcon(iconId: string, _size = 18) {
  const src = resolveWootProfileIconUrl(iconId);
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: '50%',
        display: 'block'
      }}
    />
  );
}

export function ProfileCard({
  profile,
  onboardIndex,
  isSelected,
  isDragSource = false,
  isDropTarget = false,
  draggable = false,
  shortcutKeys,
  onSelect,
  onEdit,
  onDuplicate,
  onExport,
  onShare,
  onMoveToInactive,
  onMoveToOnboard,
  onCopyToOnboard,
  onCopyToInactive,
  onLinkToApp,
  onUnlinkProfile,
  onSetAsDefault,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd
}: ProfileCardProps) {
  const { language, tr } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  // Equivalent to u20 in I3 (wootility.readable.js L62386-L62394)
  const linkedSummary = useMemo(() => {
    const apps = profile.linkedApps ?? [];
    if (apps.length === 0) {
      return null;
    }
    const first = apps[0].name || 'Unknown App';
    if (apps.length === 1) {
      return first;
    }
    const extra = apps.length - 1;
    if (language === 'vi') {
      return `${first} + ${extra} ứng dụng`;
    }
    return `${first} + ${extra} ${extra === 1 ? 'app' : 'apps'}`;
  }, [language, profile.linkedApps]);

  const accentColor = profile.color || '#ffd45c';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      draggable={draggable}
      onClick={onSelect}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={[
        'woot-profile-card',
        isSelected ? 'is-selected' : '',
        isDragSource ? 'is-drag-source' : '',
        isDropTarget ? 'is-drop-target' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Top-left Onboard Slot index badge (L62474-L62483) */}
      {typeof onboardIndex === 'number' && (
        <span className="woot-profile-slot-badge">{onboardIndex + 1}</span>
      )}

      <div className="woot-profile-card-main">
        {/* Circular Wootility SVG Avatar inside profile.color ring (h4, L62486) */}
        <div
          className="woot-profile-avatar"
          style={
            {
              '--profile-color': accentColor,
              borderColor: accentColor
            } as CSSProperties
          }
        >
          {renderProfileAvatarIcon(profile.icon, 18)}
        </div>

        <div className="woot-profile-copy">
          <div className="woot-profile-title-row">
            <strong className="woot-profile-name">{profile.name}</strong>
            {onboardIndex === 0 && (
              <span
                className="woot-badge-default"
                title="This profile activates automatically when your PC starts. Any profile saved to the first onboard slot becomes your default."
              >
                {tr('DEFAULT')}
              </span>
            )}
            {shortcutKeys && shortcutKeys.length > 0 && (
              <kbd className="woot-shortcut-pill">{shortcutKeys.join(' + ')}</kbd>
            )}
          </div>

          {linkedSummary && (
            <div className="woot-profile-linked-sub">
              <Link2 size={13} />
              <span>{linkedSummary}</span>
            </div>
          )}
        </div>
      </div>

      {/* 11-action context menu matching Wootility v5 (C4, L62395-L62449) */}
      <div className="woot-profile-actions" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          className="icon-button compact"
          aria-label="Profile options"
          onClick={() => setMenuOpen(prev => !prev)}
        >
          <MoreHorizontal size={16} />
        </button>

        {menuOpen && (
          <div className="woot-context-menu" onMouseLeave={() => setMenuOpen(false)}>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onEdit();
              }}
            >
              <Edit3 size={14} /> {tr('Edit Profile')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onDuplicate();
              }}
            >
              <Copy size={14} /> {tr('Duplicate')}
            </button>
            {onMoveToInactive && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onMoveToInactive();
                }}
              >
                <Download size={14} /> {tr('Move to Inactive')}
              </button>
            )}
            {onMoveToOnboard && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onMoveToOnboard();
                }}
              >
                <Upload size={14} /> {tr('Move to Onboard')}
              </button>
            )}
            {onCopyToOnboard && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onCopyToOnboard();
                }}
              >
                <Copy size={14} /> {tr('Copy to Onboard')}
              </button>
            )}
            {onLinkToApp && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onLinkToApp();
                }}
              >
                <Link2 size={14} /> {tr('Link to App')}
              </button>
            )}
            {onUnlinkProfile && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onUnlinkProfile();
                }}
              >
                <Link2Off size={14} /> {tr('Unlink Profile')}
              </button>
            )}
            {onCopyToInactive && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onCopyToInactive();
                }}
              >
                <Copy size={14} /> {tr('Copy to Inactive Profiles')}
              </button>
            )}
            {onSetAsDefault && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onSetAsDefault();
                }}
              >
                <Star size={14} /> {tr('Set as Default')}
              </button>
            )}
            {onShare && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onShare();
                }}
              >
                <Share2 size={14} /> {tr('Export / Share')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onExport();
              }}
            >
              <Download size={14} /> {tr('Export JSON')}
            </button>
            {onDelete && onboardIndex !== 0 && (
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                <Trash2 size={14} /> {tr('Delete...')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
export default ProfileCard;
