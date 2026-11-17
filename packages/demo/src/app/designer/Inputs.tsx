'use client';
import type { LatLng } from '@jamieblair/windforge-core';
import { designerTurbines, designerTurbine } from '../../lib/designer/turbines';
import type { Layout } from '../../lib/designer/project';
export function Coordinates({
  point,
  action,
  onApply,
}: {
  point: LatLng;
  action: string;
  onApply: (p: LatLng) => void;
}) {
  return (
    <form
      className="farm-form"
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        onApply({ lat: Number(f.get('lat')), lng: Number(f.get('lng')) });
      }}
    >
      <div className="farm-pair">
        <label>
          Latitude
          <input
            name="lat"
            type="number"
            step="any"
            min="-85"
            max="85"
            defaultValue={point.lat}
            required
          />
        </label>
        <label>
          Longitude
          <input
            name="lng"
            type="number"
            step="any"
            min="-180"
            max="180"
            defaultValue={point.lng}
            required
          />
        </label>
      </div>
      <button type="submit">{action}</button>
    </form>
  );
}
export function LayoutInputs({
  layout,
  price,
  onApply,
}: {
  layout: Layout;
  price: number;
  onApply: (patch: Partial<Layout>, price: number) => void;
}) {
  const turbine = designerTurbine(layout.turbineId)!;
  return (
    <div className="farm-settings">
      <label>
        Turbine model
        <select
          value={layout.turbineId}
          onChange={(e) => {
            const m = designerTurbine(e.target.value)!;
            onApply({ turbineId: m.id, hub: m.hubHeightOptionsM[0]! }, price);
          }}
        >
          {designerTurbines.map((t) => (
            <option key={t.id} value={t.id}>
              {t.manufacturer} {t.model}
            </option>
          ))}
        </select>
      </label>
      <label>
        Hub height
        <select
          value={layout.hub}
          onChange={(e) => onApply({ hub: Number(e.target.value) }, price)}
        >
          {turbine.hubHeightOptionsM.map((h) => (
            <option key={h} value={h}>
              {h} m
            </option>
          ))}
        </select>
      </label>
      <details>
        <summary>Layout name &amp; costs</summary>
        <form
          className="farm-form"
          key={[layout.id, layout.name, layout.capex, layout.opex, price].join('/')}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const name = String(f.get('name')).trim();
            if (!name) {
              const input = e.currentTarget.elements.namedItem('name') as HTMLInputElement;
              input.setCustomValidity('Enter a layout name.');
              input.reportValidity();
              return;
            }
            onApply(
              { name, capex: Number(f.get('capex')), opex: Number(f.get('opex')) },
              Number(f.get('price')),
            );
          }}
        >
          <label>
            Layout name
            <input
              name="name"
              defaultValue={layout.name}
              maxLength={50}
              required
              onInput={(e) => e.currentTarget.setCustomValidity('')}
            />
          </label>
          <label>
            Capital cost (£/MW)
            <input
              name="capex"
              type="number"
              step="any"
              min="1"
              max="50000000"
              required
              defaultValue={layout.capex}
            />
          </label>
          <label>
            Annual operating cost (£/MW)
            <input
              name="opex"
              type="number"
              step="any"
              min="0"
              max="5000000"
              required
              defaultValue={layout.opex}
            />
          </label>
          <label>
            Shared electricity price (£/MWh)
            <input
              name="price"
              type="number"
              step="any"
              min="0"
              max="2000"
              required
              defaultValue={price}
            />
          </label>
          <button type="submit">Save settings</button>
        </form>
      </details>
    </div>
  );
}
