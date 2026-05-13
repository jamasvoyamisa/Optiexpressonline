import { ChecadasEspecialesEditor } from '../mi-area/ChecadasEspecialesPage';

export interface ChecadasEspecialesPageProps {
  embedded?: boolean;
}

/** Misma UI que Mi Área: día, horario, 2/4 checadas, empresas incluidas/excluidas. */
export const ChecadasEspecialesPage = ({ embedded = false }: ChecadasEspecialesPageProps) => (
  <ChecadasEspecialesEditor embedded={embedded} />
);
