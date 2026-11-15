import type { Answer, Report } from '../../lib/engineering/types';
export function download(name: string, body: string, mime: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function markdown(r: Report, answers: Answer[]) {
  return [
    '# WindForge configuration investigation',
    r.created,
    'Screening only. No planning, acoustic, suitability or maintenance approval.',
    'Engine: ' + r.engine + ' · knowledge ' + r.release,
    '## Site',
    JSON.stringify(r.site.coordinate),
    r.site.metadata.completeness.detail,
    'Site score: ' + (r.site.compositeScore ?? 'withheld'),
    'Site setting (user input): ' + r.setting,
    '## Comparison',
    'B minus A: ' + (r.deltaMwh === null ? 'withheld' : r.deltaMwh.toFixed(2) + ' net MWh/year'),
    ...r.cases.flatMap((c, i) => [
      '## ' + (i ? 'B' : 'A') + ' · ' + c.label,
      'Inputs: ' + JSON.stringify(c.config),
      'Installed: ' + c.capacityMw + ' MW',
      'Net annual output: ' + (c.energy?.netTotalAepMwh ?? 'withheld') + ' MWh/year',
      'Receptor noise: ' + (c.noiseDba ?? 'withheld') + ' dBA',
      'Flicker: ' + (c.shadowHours ?? 'withheld') + ' theoretical hours/year',
      'LCOE: ' + (c.lcoe ?? 'withheld') + ' GBP/MWh',
      'Calculation assumptions: ' + JSON.stringify(c.energy?.assumptions ?? null),
      'Loss stack: ' + JSON.stringify(c.energy?.losses ?? null),
      'Finance inputs: ' + JSON.stringify(c.finance),
      'Basis: ' + c.basis.join(' '),
      'Evidence gaps: ' + c.gaps.join(' '),
    ]),
    '## Site evidence',
    JSON.stringify(r.site.metadata, null, 2),
    '## Boundary and receptor',
    JSON.stringify({ geometry: r.geometry, receptor: r.receptor }, null, 2),
    '## Sources',
    ...r.sources.map(
      (s) => s.title + ' — ' + s.url + ' · ' + s.revision + ' · SHA-256 ' + s.sha256,
    ),
    '## Questions and evidence',
    ...answers.map((a) =>
      [
        a.type,
        a.text,
        ...a.citations.map(
          (c) => c.title + ' · ' + c.locator + ' · ' + c.url + (c.text ? '\n' + c.text : ''),
        ),
        ...a.gaps,
        a.record ?? '',
      ].join('\n'),
    ),
  ].join('\n\n');
}
