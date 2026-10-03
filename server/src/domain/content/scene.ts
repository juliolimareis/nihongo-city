import type { LocationKind } from '../../../../shared/contracts';

export type { LocationKind };

/** Ponto clicável sobre a foto da cena; coordenadas em % da imagem. */
export interface Location {
  readonly id: string;
  readonly sceneId: string;
  readonly nameJp: string;
  readonly namePt: string;
  readonly icon: string;
  readonly kind: LocationKind;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Scene {
  readonly id: string;
  readonly nameJp: string;
  readonly namePt: string;
  readonly imageFile: string;
  readonly width: number;
  readonly height: number;
  readonly sortOrder: number;
  readonly locations: readonly Location[];
}

/** Na rua (kind = street) qualquer convite pode acontecer; nos lugares, só os cenários do local. */
export const isStreet = (location: Location): boolean => location.kind === 'street';
