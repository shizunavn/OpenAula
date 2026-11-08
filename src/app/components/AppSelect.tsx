import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './AppSelect.css';
export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
  meta?: string;
  icon?: ReactNode;
  disabled?: boolean;
};
const CLOSE_ANIMATION_MS = 135;
export function AppSelect<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled = false,
  className = ''
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLDivElement | null)[]>([]);
  const closeTimer = useRef<number | null>(null);
  const search = useRef({
    text: '',
    time: 0
  });
  const id = useId();
  const selected = options.find(option => option.value === value);
  const enabled = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter(index => index >= 0);
  const canOpen = !disabled && enabled.length > 0;
  const isExpanded = open && !closing && canOpen;
  const clearCloseTimer = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  useEffect(() => () => clearCloseTimer(), []);
  const openMenu = () => {
    if (!canOpen) {
      return;
    }
    clearCloseTimer();
    search.current.text = '';
    setClosing(false);
    setOpen(true);
  };
  const close = (restoreFocus = false) => {
    if (!open) {
      return;
    }
    if (restoreFocus) {
      trigger.current?.focus();
    }
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      clearCloseTimer();
      setClosing(false);
      setOpen(false);
      return;
    }
    setClosing(true);
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setClosing(false);
      setOpen(false);
    }, CLOSE_ANIMATION_MS);
  };
  const toggleMenu = () => {
    if (!canOpen) {
      return;
    }
    if (open && !closing) {
      close();
    } else {
      openMenu();
    }
  };
  const choose = (index: number) => {
    if (!disabled && !options[index].disabled) {
      onChange(options[index].value);
      close(true);
    }
  };
  useLayoutEffect(() => {
    if (!open || !canOpen) {
      return;
    }
    const place = () => {
      if (!trigger.current || !root.current || !menu.current) {
        return;
      }
      const rect = trigger.current.getBoundingClientRect();
      const style = getComputedStyle(root.current);
      const isModelSelect = root.current.classList.contains('device-model-select');
      const cardRect = isModelSelect
        ? root.current.closest('.device-card')?.getBoundingClientRect()
        : undefined;
      const baseLeft = cardRect ? cardRect.left : rect.left;
      const desiredWidth = cardRect
        ? Math.max(cardRect.width, rect.width, 196)
        : Math.max(rect.width, 148);
      const width = Math.min(desiredWidth, window.innerWidth - 16);
      // Measure wrapped labels at their final width before choosing a direction.
      menu.current.style.width = `${width}px`;
      const below = window.innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const flip = below < Math.min(260, menu.current.scrollHeight) && above > below;
      setFlipped(flip);
      const maxHeight = Math.max(40, Math.min(300, flip ? above : below));
      menu.current.style.maxHeight = `${maxHeight}px`;
      const height = Math.min(maxHeight, menu.current.scrollHeight + 2);
      setPosition({
        left: Math.max(8, Math.min(baseLeft, window.innerWidth - width - 8)),
        top: flip ? rect.top - height - 6 : rect.bottom + 6,
        width,
        maxHeight,
        '--select-accent': style.getPropertyValue('--select-accent').trim() || '#ffd45c',
        '--select-soft':
          style.getPropertyValue('--select-soft').trim() || 'rgba(255, 212, 92, .13)',
        fontSize: getComputedStyle(trigger.current).fontSize
      } as CSSProperties);
    };
    place();
    if (!closing) {
      const selectedIndex = options.findIndex(option => option.value === value && !option.disabled);
      const initial = items.current[selectedIndex < 0 ? enabled[0] : selectedIndex];
      initial?.focus({
        preventScroll: true
      });
      if (initial && menu.current) {
        menu.current.scrollTop = Math.max(0, initial.offsetTop - menu.current.clientHeight / 2);
      }
    }
    const contains = (target: EventTarget | null) =>
      target instanceof Node && (root.current?.contains(target) || menu.current?.contains(target));
    const outside = (event: Event) => {
      if (!contains(event.target)) {
        close();
      }
    };
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) {
        place();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', scroll, true);
    };
    // Focus once when opening; parent rerenders must preserve keyboard navigation.
  }, [open, closing, canOpen]);
  const navigate = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    const key = event.key;
    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (key === 'Tab') {
      // Put focus back into document order before the browser advances it.
      trigger.current?.focus();
      close();
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      choose(index);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      const current = enabled.indexOf(index);
      const next =
        key === 'Home'
          ? enabled[0]
          : key === 'End'
            ? enabled.at(-1)!
            : enabled[(current + (key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length];
      items.current[next]?.focus();
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      search.current.text =
        now - search.current.time > 700
          ? key.toLocaleLowerCase()
          : search.current.text + key.toLocaleLowerCase();
      search.current.time = now;
      const text = search.current.text;
      const prefix = [...text].every(char => char === text[0]) ? text[0] : text;
      const start = enabled.indexOf(index);
      for (let offset = 1; offset <= enabled.length; offset++) {
        const next = enabled[(start + offset) % enabled.length];
        if (options[next].label.toLocaleLowerCase().startsWith(prefix)) {
          items.current[next]?.focus();
          break;
        }
      }
    }
  };
  return (
    <div className={`app-select ${isExpanded ? 'is-open' : ''} ${className}`.trim()} ref={root}>
      <button
        type="button"
        className="app-select-trigger"
        ref={trigger}
        disabled={disabled}
        aria-label={`${label}: ${selected?.label ?? value}`}
        aria-haspopup="listbox"
        aria-expanded={isExpanded}
        aria-controls={isExpanded ? id : undefined}
        title={selected?.label}
        onClick={toggleMenu}
        onKeyDown={event => {
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && canOpen) {
            event.preventDefault();
            openMenu();
          } else if (event.key === 'Escape') {
            close();
          }
        }}
      >
        <span className="app-select-trigger-content">
          {selected?.icon && (
            <span className="app-select-trigger-icon" aria-hidden="true">
              {selected.icon}
            </span>
          )}
          <span className="app-select-trigger-label">{selected?.label ?? value}</span>
          {selected?.meta && <small className="app-select-trigger-meta">{selected.meta}</small>}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open &&
        canOpen &&
        createPortal(
          <div
            className={`app-select-menu ${closing ? 'is-closing' : 'is-opening'} ${flipped ? 'is-flipped' : ''} ${className}`.trim()}
            ref={menu}
            style={position}
            id={id}
            role="listbox"
            aria-label={label}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                ref={element => {
                  items.current[index] = element;
                }}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                tabIndex={-1}
                className={`app-select-option${option.value === value ? ' is-selected' : ''}`}
                onClick={() => choose(index)}
                onKeyDown={event => navigate(event, index)}
              >
                <span className="app-select-option-main">
                  {option.icon && (
                    <span className="app-select-option-icon" aria-hidden="true">
                      {option.icon}
                    </span>
                  )}
                  <span className="app-select-option-label">{option.label}</span>
                  {option.meta && <small className="app-select-option-meta">{option.meta}</small>}
                </span>
                {option.value === value && (
                  <Check size={15} className="app-select-check" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
