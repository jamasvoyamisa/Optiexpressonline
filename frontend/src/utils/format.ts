/**
 * Formatea el nombre de un empleado con apellidos primero.
 * Formato: "Apellido Paterno Apellido Materno, Nombre(s)"
 * Si faltan apellidos devuelve solo lo disponible.
 */
export function fmtNombreEmpleado(emp: {
  nombre?: string | null;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
}): string {
  const ap = (emp.apellido_paterno || '').trim();
  const am = (emp.apellido_materno || '').trim();
  const n = (emp.nombre || '').trim();
  const apellidos = [ap, am].filter(Boolean).join(' ');
  if (!apellidos) return n;
  if (!n) return apellidos;
  return `${apellidos} ${n}`;
}

/** Orden de comparación por apellido paterno → materno → nombre */
export function cmpNombreEmpleado(
  a: { nombre?: string | null; apellido_paterno?: string | null; apellido_materno?: string | null },
  b: { nombre?: string | null; apellido_paterno?: string | null; apellido_materno?: string | null },
): number {
  const ap = (a.apellido_paterno || '').localeCompare(b.apellido_paterno || '', 'es');
  if (ap !== 0) return ap;
  const am = (a.apellido_materno || '').localeCompare(b.apellido_materno || '', 'es');
  if (am !== 0) return am;
  return (a.nombre || '').localeCompare(b.nombre || '', 'es');
}
