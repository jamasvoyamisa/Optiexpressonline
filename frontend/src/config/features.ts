/**
 * Módulo nómina: activo por defecto. Ocultar en build con VITE_NOMINA_ENABLED=false.
 * Visible y usable solo por administrador (is_superuser), no por RH ni otros roles.
 */
const v = import.meta.env.VITE_NOMINA_ENABLED;

export const isNominaEnabled = v !== 'false';

/** Menú /nomina, pestaña nómina en Personal y APIs: solo administrador con módulo activo. */
export function canAccessNomina(isSuperuser: boolean | undefined): boolean {
  return isNominaEnabled && isSuperuser === true;
}

/** Botón de cálculo experimental: requiere VITE_NOMINA_CALC_PRUEBAS=true y NOMINA_CALCULO_PRUEBAS=true en backend. */
export const isNominaCalculoPruebas = import.meta.env.VITE_NOMINA_CALC_PRUEBAS === 'true';
