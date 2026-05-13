/**
 * Módulo nómina: activo por defecto. Ocultar en build con VITE_NOMINA_ENABLED=false.
 * La ruta /nomina y las APIs quedan restringidas a administrador en app y backend.
 */
const v = import.meta.env.VITE_NOMINA_ENABLED;

export const isNominaEnabled = v !== 'false';

/** Botón de cálculo experimental: requiere VITE_NOMINA_CALC_PRUEBAS=true y NOMINA_CALCULO_PRUEBAS=true en backend. */
export const isNominaCalculoPruebas = import.meta.env.VITE_NOMINA_CALC_PRUEBAS === 'true';
