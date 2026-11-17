import { getAllTurbines, type TurbineModel } from '@jamieblair/windforge-core';
import catalogue from '../../../../../engineering/catalogue.json';
import { referenceTurbine } from '../engineering/calculate';
type DesignTurbine = Omit<TurbineModel, 'cutInSpeedMs' | 'cutOutSpeedMs' | 'ratedSpeedMs'> & {
  basis: string;
};
const references = catalogue.models.flatMap((m) => {
  const curve = m.curve.filter(
    (row): row is [number, number, number] => row.length === 3 && row.every(Number.isFinite),
  );
  if (!m.fullCurve || !curve.length || curve.length !== m.curve.length) return [];
  return [
    {
      ...referenceTurbine({ ...m, curve }),
      basis: 'Published ' + m.setting + ' reference design · ' + m.curveLocator,
    },
  ];
});
export const designerTurbines: DesignTurbine[] = [
  ...references,
  ...getAllTurbines().map((m) => ({
    ...m,
    basis: 'Illustrative library power curve and rated sound level.',
  })),
];
export const designerTurbine = (id: string) => designerTurbines.find((t) => t.id === id);
