import {h} from 'preact'

const paths = {
  select: 'M5 3l14 9-6 1-3 6z',
  pan: 'M8 11V5a2 2 0 014 0v5-4 0m4 0V4a2 2 0 014 0v7m0-3a2 2 0 014 0v5c0 6-3 8-8 8-3 0-4-2-6-5l-2-4c-1-2 1-3 3-1l1 1',
  gate: 'M5 5h14v14H5zM9.5 9v6m5-6v6m-5-3h5',
  control:
    'M2 6h20M2 18h20M12 6v12M12 4.6a1.4 1.4 0 110 2.8 1.4 1.4 0 010-2.8zM12 14a4 4 0 110 8 4 4 0 010-8zM8 18h8',
  measure: 'M3 6h18v12H3zM6.5 15.5a6 6 0 0111 0M12 15.5l4.5-6',
  wire: 'M2 9.5h20M2 14.5h20',
  undo: 'M8 5L3 10l5 5M3 10h11a6 6 0 016 6',
  redo: 'M16 5l5 5-5 5M21 10H10a6 6 0 00-6 6',
  trash: 'M4 7h16M9 7V3h6v4M6 7l1 14h10l1-14M10 11v6m4-6v6',
  copy: 'M8 8h12v13H8zM16 8V3H3v13h5',
  export: 'M12 16V3M7 8l5-5 5 5M4 14v7h16v-7',
  import: 'M12 3v13M7 11l5 5 5-5M4 16v5h16v-5',
  save: 'M4 3h14l3 3v15H3V3zM7 3v6h10V3M7 21v-8h10v8',
  plus: 'M12 4v16M4 12h16',
  minus: 'M4 12h16',
  fit: 'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6M8 12h8m-4-4v8',
  grid: 'M3 3h18v18H3zM9 3v18m6-18v18M3 9h18M3 15h18',
  close: 'M5 5l14 14M19 5L5 19',
  help: 'M9 8a3 3 0 116 0c0 3-3 2-3 5m0 4h.01',
  check: 'M4 12l5 5L20 6',
  library: 'M4 4h6v16H4zM14 4l5-1 3 16-5 1z',
  new: 'M4 3h10l6 6v12H4zM14 3v6h6M8 15h8m-4-4v8',
  rowAbove: 'M3 14h18M3 19h18M12 3v7m-3.5-3.5h7',
  rowBelow: 'M3 5h18M3 10h18M12 14v7m-3.5-3.5h7',
  colBefore: 'M14 3v18M19 3v18M3 12h7M6.5 8.5v7',
  colAfter: 'M5 3v18M10 3v18M14 12h7M17.5 8.5v7',
  duplicate: 'M8 8h12v12H8zM4 16V4h12M14 11v6m-3-3h6',
}
export default function Icon({name, size = 18}) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.65"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.gate} />
    </svg>
  )
}
export function ToolButton({icon, label, shortcut, active, toggle, ...props}) {
  return (
    <button
      type="button"
      class={`tool-button${toggle ? ' toggle' : ''}${active ? ' active' : ''}`}
      title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      {...props}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  )
}
