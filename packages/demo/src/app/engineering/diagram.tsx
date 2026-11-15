import type { Model, Part } from '../../lib/engineering/types';
export function Diagram({
  model,
  part,
  select,
}: {
  model: Model;
  part: Part;
  select: (id: string) => void;
}) {
  const key = part.id === 'assembly' ? 'assembly' : (part.path.split('.')[1] ?? part.id);
  const active = (k: string) => (key === k ? '#007a77' : '#526773');
  const hot = (k: string) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': 'Inspect ' + k,
    onClick: () => select(k),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(k);
      }
    },
  });
  return (
    <svg
      className="wf-diagram"
      viewBox="0 0 540 280"
      aria-label="Interactive illustrative turbine elevation and drivetrain"
    >
      <title>Illustrative assembly diagram. Select a part to inspect its source record.</title>
      <defs>
        <pattern id="ground" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8L8 0" stroke="#afc0bc" strokeWidth="1" />
        </pattern>
      </defs>
      <path d="M16 245H281" stroke="#809590" />
      <path d="M16 246H281v9H16z" fill="url(#ground)" />
      <g {...hot('tower')}>
        <path d="M134 243L139 111L147 111L155 243Z" fill={active('tower')} />
        <path d="M145 119L149 238" stroke="white" fill="none" />
      </g>
      <g {...hot('drivetrain')}>
        <path d="M134 100q10-8 38-1l7 8-4 9-36-2z" fill={active('drivetrain')} />
      </g>
      <g {...hot('blade')} fill={active('blade')}>
        {[0, 120, 240].map((deg) => (
          <path
            key={deg}
            transform={'rotate(' + deg + ' 134 106)'}
            d="M132 105Q124 92 124 73L129 12Q132 6 132 19L136 78L138 100Z"
          />
        ))}
      </g>
      <circle
        {...hot('hub')}
        cx="134"
        cy="106"
        r="8"
        fill={active('hub')}
        stroke="white"
        strokeWidth="2"
      />
      <g fill="none" stroke="#889d9a">
        <path d="M47 20v174m-4-174h8m-8 174h8M224 106v137m-4-137h8m-8 137h8" />
        <path d="M177 105h17l23-35h79" strokeDasharray="3 4" />
      </g>
      <text x="57" y="35">
        Ø {model.rotorM.toFixed(1)} m
      </text>
      <text x="232" y="182">
        {model.hubM} m
      </text>
      <g transform="translate(303 60)">
        <text x="0" y="-10">
          Nacelle section
        </text>
        <path d="M0 45q2-27 25-30h136q30 0 38 20l8 37H0z" fill="#e0ebe7" stroke="#829994" />
        <path d="M-7 44h38v12H-7z" fill="#536b6c" {...hot('lss')} />
        {model.drive.toLowerCase() === 'geared' ? (
          <g {...hot('gearbox')}>
            <rect x="32" y="31" width="58" height="35" rx="3" fill="#607d7d" />
            <path d="M42 38l24 22m-8-24l24 22" stroke="#e7f1ed" strokeWidth="4" />
          </g>
        ) : null}
        <g {...hot('generator')}>
          <rect
            x={model.drive.toLowerCase() === 'geared' ? 104 : 39}
            y="26"
            width={model.drive.toLowerCase() === 'geared' ? 60 : 103}
            height="42"
            rx="5"
            fill={part.id === 'generator' ? '#007a77' : '#40595b'}
          />
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={'M' + ((model.drive.toLowerCase() === 'geared' ? 113 : 53) + i * 9) + ' 31v31'}
              stroke="#b8d0cb"
              strokeWidth="2"
            />
          ))}
        </g>
        <path d="M4 74h194" stroke="#435b5c" strokeWidth="4" />
        <text x="0" y="96">
          {model.drive.toLowerCase() === 'geared' ? 'Geared drivetrain' : 'Direct-drive generator'}
        </text>
      </g>
    </svg>
  );
}
