const photo =
  'https://commons.wikimedia.org/wiki/File:Block_Island_offshore_wind_farm_P6290638m.jpg';

export function PhotoCredit() {
  return (
    <span className="wf-photo-credit">
      Block Island photograph by <a href={photo}>Ionna22</a>, cropped and colour graded under{' '}
      <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.
    </span>
  );
}

export function WorkspaceHero() {
  return (
    <section className="wf-hero" aria-labelledby="engineering-title">
      <div className="wf-hero-photo" aria-hidden="true" />
      <svg
        className="wf-airflow"
        viewBox="0 0 820 360"
        preserveAspectRatio="none"
        aria-hidden="true"
        fill="none"
      >
        {Array.from({ length: 15 }, (_, i) => (
          <path
            key={i}
            d={`M-35 ${195 + i * 9} C145 ${154 + i * 7}, 161 ${406 - i * 2}, 341 ${290 + i * 5} S503 ${113 + i * 9}, 608 ${163 + i * 6} S743 ${215 + i * 8}, 851 ${103 + i * 9}`}
          />
        ))}
      </svg>
      <div className="wf-hero-inner">
        <h1 id="engineering-title">
          Wind turbine <em>engineering</em>
        </h1>
        <p>
          Explore reference turbines, trace their components and compare the evidence for a site.
        </p>
      </div>
      <a className="wf-photo-caption" href={photo}>
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M13 6.6c0 3.2-5 7.7-5 7.7S3 9.8 3 6.6a5 5 0 1 1 10 0Z" />
          <circle cx="8" cy="6.6" r="1.5" />
        </svg>
        Block Island Wind Farm
      </a>
    </section>
  );
}
