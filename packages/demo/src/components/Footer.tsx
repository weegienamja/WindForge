import Link from 'next/link';
import { version as packageVersion } from '../../package.json';

const REPO_URL = 'https://github.com/jamieblair/wind-site-intelligence';
const NPM_CORE = 'https://www.npmjs.com/package/@jamieblair/windforge-core';
const NPM_MCP = 'https://www.npmjs.com/package/@jamieblair/windforge-mcp';
const ISSUES_URL = `${REPO_URL}/issues`;

const linkStyle = {
  color: 'var(--text-secondary)',
  textDecoration: 'none',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
} as const;

/**
 * Site footer. Three columns on desktop, stacked on tablet/mobile.
 * Mounted on the landing page and the analyse page.
 */
export function Footer() {
  return (
    <footer
      data-testid="site-footer"
      style={{
        background: 'var(--surface-1)',
        borderTop: '1px solid var(--border-subtle)',
        padding: 'var(--space-7) var(--space-5)',
        color: 'var(--text-secondary)',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-6)',
        }}
      >
        <FooterColumn heading="Project">
          <FooterLink href={REPO_URL} external>
            GitHub
          </FooterLink>
          <FooterLink href={NPM_CORE} external>
            npm: @jamieblair/windforge-core
          </FooterLink>
          <FooterLink href={NPM_MCP} external>
            MCP server: @jamieblair/windforge-mcp
          </FooterLink>
          <FooterLink href={ISSUES_URL} external>
            Issues / contact
          </FooterLink>
        </FooterColumn>
        <FooterColumn heading="Data sources">
          <FooterLink href="https://power.larc.nasa.gov" external>
            NASA POWER
          </FooterLink>
          <FooterLink
            href="https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels"
            external
          >
            ERA5 (Copernicus)
          </FooterLink>
          <FooterLink
            href="https://cds.climate.copernicus.eu/datasets/reanalysis-cerra-single-levels"
            external
          >
            CERRA
          </FooterLink>
          <FooterLink href="https://www.openstreetmap.org/copyright" external>
            OpenStreetMap (© contributors)
          </FooterLink>
          <FooterLink href="https://open-elevation.com" external>
            Open-Elevation
          </FooterLink>
        </FooterColumn>
        <FooterColumn heading="About">
          <p style={{ ...linkStyle, margin: 0, lineHeight: 1.6 }}>
            WindForge is built and maintained by{' '}
            <Link
              href="https://jamieblair.co.uk"
              style={{ color: 'var(--accent-cool)', textDecoration: 'none' }}
            >
              Jamie Blair
            </Link>
            .
          </p>
          <span
            className="t-mono-data"
            data-testid="footer-version"
            style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 'var(--space-3)' }}
          >
            v{packageVersion}
          </span>
        </FooterColumn>
      </div>
    </footer>
  );
}

function FooterColumn({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <span className="t-eyebrow" style={{ color: 'var(--text-tertiary)' }}>
        {heading}
      </span>
      {children}
    </div>
  );
}

function FooterLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const props = external ? { target: '_blank', rel: 'noreferrer noopener' } : {};
  return (
    <a href={href} style={linkStyle} {...props}>
      {children}
    </a>
  );
}
