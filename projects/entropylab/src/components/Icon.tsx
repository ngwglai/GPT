export type IconName =
  | 'diffusion'
  | 'walk'
  | 'life'
  | 'ising'
  | 'play'
  | 'pause'
  | 'reset'
  | 'step'
  | 'sun'
  | 'moon'
  | 'arrow'
  | 'sliders'
  | 'info'
  | 'draw'
  | 'erase';
const paths: Record<IconName, React.ReactNode> = {
  diffusion: (
    <>
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="6" r="1.5" />
      <circle cx="12" cy="13" r="2" />
      <circle cx="5" cy="18" r="1.5" />
      <circle cx="19" cy="18" r="2" />
    </>
  ),
  walk: (
    <>
      <path d="M3 18h5v-7h6V5h7" />
      <path d="m17 2 4 3-4 3" />
    </>
  ),
  life: (
    <>
      <rect x="4" y="4" width="5" height="5" rx="1" />
      <rect x="15" y="4" width="5" height="5" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="4" y="15" width="5" height="5" rx="1" />
      <rect x="15" y="15" width="5" height="5" rx="1" />
    </>
  ),
  ising: (
    <>
      <path d="M6 19V5m-3 3 3-3 3 3M18 5v14m-3-3 3 3 3-3M12 17V7" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7Z" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  reset: (
    <>
      <path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" />
    </>
  ),
  step: (
    <>
      <path d="m5 6 9 6-9 6ZM18 5v14" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
    </>
  ),
  moon: <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" />,
  arrow: <path d="m9 5 7 7-7 7" />,
  sliders: (
    <>
      <path d="M5 3v18M12 3v18M19 3v18M2 8h6m1 8h6m1-10h6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-11v1" />
    </>
  ),
  draw: (
    <>
      <path d="m4 16 12-12 4 4L8 20H4ZM13 7l4 4" />
    </>
  ),
  erase: (
    <>
      <path d="m4 13 9-9 7 7-9 9H7l-3-3ZM9 8l7 7M11 20h10" />
    </>
  ),
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
