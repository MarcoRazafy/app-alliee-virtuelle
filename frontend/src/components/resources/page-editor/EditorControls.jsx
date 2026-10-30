import { useEffect, useRef, useState } from 'react';
import { PALETTE, SIZES } from '../../../utils/pageBlocks';

const keepSelection = (event) => event.preventDefault();

export function ToolButton({ label, active = false, onClick, disabled = false, children }) {
  return (
    <button
      type="button"
      className={`rpe-tool${active ? ' rpe-tool--active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={keepSelection}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export function ColorPicker({ value, onPick, label = 'Couleur' }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <span className="rpe-popover-anchor" ref={ref}>
      <ToolButton label={label} active={open} onClick={() => setOpen((current) => !current)}>
        <span className="rpe-color-dot" style={value ? { background: value } : undefined} aria-hidden="true" />
      </ToolButton>
      {open && (
        <span className="rpe-popover" role="menu" aria-label={label}>
          <button
            type="button"
            role="menuitem"
            className="rpe-swatch rpe-swatch--default"
            aria-label="Couleur par défaut"
            title="Couleur par défaut"
            onMouseDown={keepSelection}
            onClick={() => {
              onPick('');
              setOpen(false);
            }}
          >
            A
          </button>
          {PALETTE.map((color) => (
            <button
              key={color.value}
              type="button"
              role="menuitem"
              className={`rpe-swatch${value === color.value ? ' rpe-swatch--active' : ''}`}
              style={{ background: color.value }}
              aria-label={color.label}
              title={color.label}
              onMouseDown={keepSelection}
              onClick={() => {
                onPick(color.value);
                setOpen(false);
              }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

export function SizePicker({ onPick }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <span className="rpe-popover-anchor" ref={ref}>
      <ToolButton label="Taille du texte" active={open} onClick={() => setOpen((current) => !current)}>
        <span className="rpe-size-glyph" aria-hidden="true">
          A<small>A</small>
        </span>
      </ToolButton>
      {open && (
        <span className="rpe-popover rpe-popover--list" role="menu" aria-label="Taille du texte">
          {SIZES.map((size) => (
            <button
              key={size.label}
              type="button"
              role="menuitem"
              className={`rpe-size-option rp-taille-${size.value || 'normal'}`}
              onMouseDown={keepSelection}
              onClick={() => {
                onPick(size.value);
                setOpen(false);
              }}
            >
              {size.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
