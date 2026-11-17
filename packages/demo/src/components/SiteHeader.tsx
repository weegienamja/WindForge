import Link from 'next/link';

const destinations = [
  { href: '/', label: 'Engineering' },
  { href: '/analyse', label: 'Site analysis' },
  { href: '/map', label: 'UK map' },
];

export function WindMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 36 36" width="36" height="36" fill="none">
      <g stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
        <path d="M3 15c7 1 9-8 18-8 4 0 6 1 9 3" />
        <path d="M3 21c7 1 10-9 20-9 4 0 7 1 10 4" />
        <path d="M5 27c7 0 12-10 21-10 3 0 5 1 7 2" />
        <path d="M17 27c4-5 9-7 14-5" />
      </g>
    </svg>
  );
}

export function SiteHeader({ active }: { active?: string }) {
  return (
    <header className="site-mast">
      <div className="mast-inner">
        <Link className="mast-brand" href="/">
          <WindMark />
          WindForge
        </Link>
        <nav className="mast-links" aria-label="Site tools">
          {destinations.map(({ href, label }) => (
            <Link href={href} key={href} aria-current={href === active ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <a className="mast-source" href="https://github.com/weegienamja/WindForge">
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </div>
    </header>
  );
}
