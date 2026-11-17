import { evaluateLayout } from '../../lib/designer/evaluate';
import type { Project } from '../../lib/designer/project';
self.onmessage = ({ data }: MessageEvent<Project>) => {
  const results = data.layouts.map((layout) => evaluateLayout(data, layout));
  self.postMessage(results);
};
