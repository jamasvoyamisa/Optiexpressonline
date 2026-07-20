import { Children, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import api from '../../services/api';
import { cmpNombreEmpleado, fmtNombreEmpleado } from '../../utils/format';
import type { DepartamentoResponse, EmpleadoResponse, EmpresaResponse } from '../../types';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  rhMobileBtnSecondary,
  rhMobileFilterStack,
  rhMobileSelect,
} from './rhMobileStyles';

type NivelEtiqueta = 'Director' | 'Subdirector' | 'Gerente General' | 'Gerente' | 'Supervisor' | 'RH' | 'Empleado';

/** Etiqueta de un hijo: subdepartamento por defecto (uso real); sucursal solo si tipo lo dice. */
function etiquetaHijoDepto(tipo?: string | null): 'Subdepartamento' | 'Sucursal' {
  return (tipo || '').trim().toLowerCase() === 'sucursal' ? 'Sucursal' : 'Subdepartamento';
}

/** Resumen de hijos: "N subdepartamento(s)" / "N sucursal(es)" / mixto. */
function resumenHijos(hijos: { depto: { tipo?: string | null } }[]): string {
  if (hijos.length === 0) return '';
  const nSub = hijos.filter(h => etiquetaHijoDepto(h.depto.tipo) === 'Subdepartamento').length;
  const nSuc = hijos.length - nSub;
  if (nSuc === 0) {
    return `${hijos.length} subdepartamento${hijos.length === 1 ? '' : 's'}`;
  }
  if (nSub === 0) {
    return `${hijos.length} sucursal${hijos.length === 1 ? '' : 'es'}`;
  }
  return `${nSub} sub · ${nSuc} sucursal${nSuc === 1 ? '' : 'es'}`;
}

type VistaModo = 'arbol' | 'interactivo' | 'lista';

type AreaNodo = {
  depto: DepartamentoResponse;
  /** Gerente del departamento raíz (jefe_id). */
  jefe: EmpleadoResponse | null;
  /** Encargados de sucursal/subdepartamento (varios). */
  encargados: EmpleadoResponse[];
  staff: EmpleadoResponse[];
  /** Activos del área + subáreas. */
  total: number;
  hijos: AreaNodo[];
};

function etiquetaNivel(puestoNombre?: string | null): NivelEtiqueta {
  const n = (puestoNombre || '').trim().toLowerCase();
  if (n === 'director') return 'Director';
  if (n === 'subdirector') return 'Subdirector';
  if (n === 'gerente general') return 'Gerente General';
  if (n === 'rh' || n === 'recursos humanos') return 'RH';
  if (n.includes('gerente')) return 'Gerente';
  if (n.includes('supervisor')) return 'Supervisor';
  return 'Empleado';
}

const NIVEL_STYLE: Record<NivelEtiqueta, { bg: string; color: string }> = {
  Director: { bg: '#ede9fe', color: '#5b21b6' },
  Subdirector: { bg: '#f3e8ff', color: '#6b21a8' },
  'Gerente General': { bg: '#e0e7ff', color: '#3730a3' },
  Gerente: { bg: '#e0f2fe', color: '#0369a1' },
  Supervisor: { bg: '#ecfdf5', color: '#047857' },
  RH: { bg: '#fce7f3', color: '#9d174d' },
  Empleado: { bg: '#f1f5f9', color: '#475569' },
};

function relacionadoConEmpresa(
  emp: EmpleadoResponse,
  empresaId: number,
  departamentos: DepartamentoResponse[] = [],
): boolean {
  const eid = Number(empresaId);
  if (Number(emp.empresa_id) === eid) return true;
  const supervisadas = (emp.empresas_supervisadas_ids || []).map(Number);
  if (supervisadas.includes(eid)) return true;
  // Fallback: asignado a un departamento de esa empresa
  if (emp.departamento_id != null) {
    const d = departamentos.find(x => x.id === emp.departamento_id);
    if (d && Number(d.empresa_id) === eid) return true;
  }
  return false;
}

function puestoKey(emp: EmpleadoResponse): string {
  return (emp.puesto?.nombre || '').trim().toLowerCase();
}

function esPuestoLiderazgo(key: string): 'director' | 'subdirector' | 'gerente general' | null {
  if (key === 'director') return 'director';
  if (key === 'subdirector') return 'subdirector';
  if (key === 'gerente general') return 'gerente general';
  return null;
}

const selectStyle: CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: '0.88rem',
  outline: 'none',
  height: 36,
  minWidth: 280,
  backgroundColor: '#fff',
};

const btnSecondary: CSSProperties = {
  padding: '8px 14px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  backgroundColor: '#fff',
  color: '#334155',
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
  height: 36,
};

const btnVista = (active: boolean): CSSProperties => ({
  padding: '7px 14px',
  border: active ? '1px solid #0284c7' : '1px solid #cbd5e1',
  borderRadius: 6,
  backgroundColor: active ? '#e0f2fe' : '#fff',
  color: active ? '#0369a1' : '#334155',
  fontWeight: active ? 700 : 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
  height: 36,
});

function BadgeNivel({ puesto }: { puesto?: string | null }) {
  const nivel = etiquetaNivel(puesto);
  const st = NIVEL_STYLE[nivel];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: '0.72rem',
        fontWeight: 700,
        backgroundColor: st.bg,
        color: st.color,
        whiteSpace: 'nowrap',
      }}
    >
      {nivel}
    </span>
  );
}

function PersonaRow({
  emp,
  destacado,
}: {
  emp: EmpleadoResponse;
  destacado?: boolean;
}) {
  const puesto = emp.puesto?.nombre || null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: destacado ? '10px 12px' : '8px 12px',
        borderRadius: 8,
        backgroundColor: destacado ? '#f0f9ff' : '#fff',
        border: destacado ? '1px solid #bae6fd' : '1px solid #e2e8f0',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: destacado ? 700 : 600,
            fontSize: destacado ? '0.9rem' : '0.85rem',
            color: '#0f172a',
            lineHeight: 1.25,
          }}
        >
          {fmtNombreEmpleado(emp)}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
          #{emp.numero_empleado}
          {puesto ? ` · ${puesto}` : ''}
        </div>
      </div>
      <BadgeNivel puesto={puesto} />
    </div>
  );
}

/** Nodo visual del organigrama en árbol (clicable si tiene hijos). */
function NodoArbol({
  titulo,
  subtitulo,
  badge,
  variante = 'persona',
  ancho,
  expandible,
  abierto,
  onToggle,
}: {
  titulo: string;
  subtitulo?: string;
  badge?: ReactNode;
  variante?: 'empresa' | 'depto' | 'jefe' | 'persona' | 'hueco' | 'direccion';
  ancho?: number;
  expandible?: boolean;
  abierto?: boolean;
  onToggle?: () => void;
}) {
  const styles: Record<string, { bg: string; border: string; title: string }> = {
    empresa: { bg: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 55%, #0ea5e9 100%)', border: 'transparent', title: '#fff' },
    depto: { bg: '#fff', border: '#7dd3fc', title: '#0c4a6e' },
    jefe: { bg: '#f0f9ff', border: '#38bdf8', title: '#0f172a' },
    persona: { bg: '#fff', border: '#e2e8f0', title: '#0f172a' },
    hueco: { bg: '#f8fafc', border: '#cbd5e1', title: '#94a3b8' },
    direccion: { bg: '#faf5ff', border: '#c4b5fd', title: '#5b21b6' },
  };
  const s = styles[variante];
  const clicable = Boolean(expandible && onToggle);

  return (
    <div
      role={clicable ? 'button' : undefined}
      tabIndex={clicable ? 0 : undefined}
      data-org-toggle={clicable ? '1' : undefined}
      onClick={clicable ? (e) => { e.stopPropagation(); onToggle?.(); } : undefined}
      onKeyDown={clicable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle?.();
        }
      } : undefined}
      title={clicable ? (abierto ? 'Clic para contraer' : 'Clic para expandir') : undefined}
      style={{
        width: ancho ?? (variante === 'empresa' ? 260 : variante === 'depto' ? 180 : 150),
        maxWidth: '100%',
        padding: variante === 'empresa' ? '12px 14px' : '10px 11px',
        borderRadius: 10,
        background: s.bg,
        border: `1px solid ${s.border}`,
        boxShadow: clicable && abierto === false
          ? '0 0 0 2px rgba(14,165,233,0.25), 0 1px 3px rgba(15,23,42,0.06)'
          : '0 1px 3px rgba(15,23,42,0.06)',
        textAlign: 'center',
        boxSizing: 'border-box',
        cursor: clicable ? 'pointer' : 'inherit',
        userSelect: 'none',
        transition: 'box-shadow 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {clicable && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 800,
              color: variante === 'empresa' ? 'rgba(255,255,255,0.9)' : '#0369a1',
              lineHeight: 1,
            }}
          >
            {abierto ? '▾' : '▸'}
          </span>
        )}
        <div style={{ fontWeight: 700, fontSize: variante === 'empresa' ? '0.92rem' : '0.8rem', color: s.title, lineHeight: 1.25 }}>
          {titulo}
        </div>
      </div>
      {subtitulo && (
        <div
          style={{
            fontSize: '0.7rem',
            marginTop: 3,
            color: variante === 'empresa' ? 'rgba(255,255,255,0.85)' : '#64748b',
            lineHeight: 1.25,
          }}
        >
          {subtitulo}
        </div>
      )}
      {badge && <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>{badge}</div>}
      {clicable && abierto === false && (
        <div
          style={{
            marginTop: 6,
            fontSize: '0.68rem',
            fontWeight: 600,
            color: variante === 'empresa' ? 'rgba(255,255,255,0.75)' : '#0284c7',
          }}
        >
          Clic para expandir
        </div>
      )}
    </div>
  );
}

/** Línea vertical corta bajo un nodo. */
function ConectorVertical() {
  return <div style={{ width: 2, height: 18, backgroundColor: '#94a3b8', flexShrink: 0 }} />;
}

/**
 * Contenedor de hijos en fila (hermanos) con línea horizontal y bajantes.
 * Aplana arrays anidados para que sucursales/hermanos no se apilen en una sola columna.
 */
function RamaHijos({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  const unico = items.length === 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <ConectorVertical />
      <ul
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: 0,
          margin: 0,
          padding: 0,
          listStyle: 'none',
          position: 'relative',
        }}
      >
        {items.map((child, idx) => {
          const esPrimero = idx === 0;
          const esUltimo = idx === items.length - 1;
          return (
            <li
              key={(child as { key?: string | number })?.key ?? idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
                padding: '0 10px',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: esPrimero ? '50%' : 0,
                  right: esUltimo ? '50%' : 0,
                  height: 2,
                  backgroundColor: unico ? 'transparent' : '#94a3b8',
                }}
              />
              <div style={{ width: 2, height: 16, backgroundColor: '#94a3b8' }} />
              {child}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NivelLiderazgo({
  etiqueta,
  personas,
  interactivo,
  abierto,
  onToggle,
}: {
  etiqueta: string;
  personas: EmpleadoResponse[];
  interactivo: boolean;
  abierto: boolean;
  onToggle?: () => void;
}) {
  if (personas.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      {interactivo && onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#64748b',
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            cursor: 'pointer',
            marginBottom: 6,
            marginTop: 4,
          }}
        >
          {abierto ? '▾' : '▸'} {etiqueta}
        </button>
      ) : (
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, marginTop: 4 }}>
          {etiqueta}
        </div>
      )}
      {(!interactivo || abierto) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
          {personas.map(emp => (
            <NodoArbol
              key={emp.id}
              variante="direccion"
              titulo={fmtNombreEmpleado(emp)}
              subtitulo={emp.puesto?.nombre || undefined}
              badge={<BadgeNivel puesto={emp.puesto?.nombre} />}
              ancho={170}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VistaArbol({
  empresa,
  areas,
  sinDepartamento,
  totalActivos,
  directores,
  subdirectores,
  gerentesGenerales,
  interactivo = false,
  abiertos = {},
  onToggle,
}: {
  empresa: EmpresaResponse;
  areas: AreaNodo[];
  sinDepartamento: EmpleadoResponse[];
  totalActivos: number;
  directores: EmpleadoResponse[];
  subdirectores: EmpleadoResponse[];
  gerentesGenerales: EmpleadoResponse[];
  interactivo?: boolean;
  abiertos?: Record<string, boolean>;
  onToggle?: (key: string) => void;
}) {
  const estaAbierto = (key: string) => !interactivo || abiertos[key] !== false;
  const puedeToggle = interactivo && typeof onToggle === 'function';
  const empresaAbierta = estaAbierto('empresa');
  const dirsAbiertos = estaAbierto('dirs');
  const subsAbiertos = estaAbierto('subs');
  const ggAbiertos = estaAbierto('gg');

  const ramasDepto: ReactNode[] = [];

  const renderArea = (
    area: AreaNodo,
    jefeSuperior: EmpleadoResponse | null = null,
    jefeSuperiorNombre: string | null = null,
  ): ReactNode => {
    const { depto, jefe, encargados, staff, total, hijos } = area;
    const keyDepto = `d-${depto.id}`;
    const keyJefe = `j-${depto.id}`;
    const deptoAbierto = estaAbierto(keyDepto);
    const jefeAbierto = estaAbierto(keyJefe);
    const tieneStaff = staff.length > 0;
    const tieneHijos = hijos.length > 0;
    const esSub = !!depto.padre_id;
    const etiquetaTipo = esSub ? etiquetaHijoDepto(depto.tipo) : null;

    // Raíz: gerente (jefe_id). Hijo: encargados (varios). Sin encargados → hereda gerente padre.
    const tieneEncargados = esSub && encargados.length > 0;
    const jefePropio = !esSub ? jefe : null;
    const nombreJefePropio = !esSub ? (depto.jefe_nombre || null) : null;
    const heredaJefe = esSub && !tieneEncargados && (!!jefeSuperior || !!jefeSuperiorNombre);
    const dibujarGerenteRaiz = !esSub && (!!jefePropio || !!nombreJefePropio || true);
    const tieneBajoLiderazgo = tieneStaff || tieneHijos;
    const tieneContenido = (esSub ? (tieneEncargados || heredaJefe || tieneStaff || tieneHijos) : true)
      || tieneStaff || tieneHijos;

    const hojasStaff = staff.map(emp => (
      <NodoArbol
        key={emp.id}
        variante="persona"
        titulo={fmtNombreEmpleado(emp)}
        subtitulo={emp.puesto?.nombre || (emp.numero_empleado?.startsWith('ESP-') ? undefined : `#${emp.numero_empleado}`)}
        badge={<BadgeNivel puesto={emp.puesto?.nombre} />}
        ancho={148}
      />
    ));

    const liderParaHijos = esSub
      ? (encargados[0] || jefeSuperior)
      : (jefePropio || jefeSuperior);
    const nombreLiderHijos = esSub
      ? (encargados[0] ? fmtNombreEmpleado(encargados[0]) : jefeSuperiorNombre)
      : (nombreJefePropio || jefeSuperiorNombre);

    const ramasHijos = hijos.map(h =>
      renderArea(h, liderParaHijos, nombreLiderHijos),
    );

    const extrasGerente: string[] = [];
    if (tieneHijos) extrasGerente.push(resumenHijos(hijos));
    if (tieneStaff) extrasGerente.push(`${staff.length} en equipo`);

    const nodoGerenteRaiz = !dibujarGerenteRaiz || esSub ? null : jefePropio ? (
      <NodoArbol
        variante="jefe"
        titulo={fmtNombreEmpleado(jefePropio)}
        subtitulo={['Gerente de área', ...extrasGerente].join(' · ')}
        badge={<BadgeNivel puesto={jefePropio.puesto?.nombre} />}
        ancho={168}
        expandible={puedeToggle && tieneBajoLiderazgo}
        abierto={jefeAbierto}
        onToggle={puedeToggle && tieneBajoLiderazgo ? () => onToggle!(keyJefe) : undefined}
      />
    ) : nombreJefePropio ? (
      <NodoArbol
        variante="hueco"
        titulo={nombreJefePropio}
        subtitulo={['Gerente de área', ...extrasGerente].join(' · ')}
        ancho={168}
        expandible={puedeToggle && tieneBajoLiderazgo}
        abierto={jefeAbierto}
        onToggle={puedeToggle && tieneBajoLiderazgo ? () => onToggle!(keyJefe) : undefined}
      />
    ) : (
      <NodoArbol
        variante="hueco"
        titulo="Sin gerente de área"
        subtitulo={extrasGerente.join(' · ') || undefined}
        ancho={168}
        expandible={puedeToggle && tieneBajoLiderazgo}
        abierto={jefeAbierto}
        onToggle={puedeToggle && tieneBajoLiderazgo ? () => onToggle!(keyJefe) : undefined}
      />
    );

    const nodosEncargados = tieneEncargados
      ? encargados.map((enc, idx) => (
          <NodoArbol
            key={`enc-${enc.id}`}
            variante="jefe"
            titulo={fmtNombreEmpleado(enc)}
            subtitulo={
              [
                encargados.length > 1 ? `Encargado ${idx + 1}` : 'Encargado',
                enc.puesto?.nombre,
                idx === 0 && tieneStaff ? `${staff.length} en equipo` : null,
              ].filter(Boolean).join(' · ')
            }
            badge={<BadgeNivel puesto={enc.puesto?.nombre} />}
            ancho={168}
            expandible={puedeToggle && idx === 0 && tieneBajoLiderazgo}
            abierto={idx === 0 ? jefeAbierto : true}
            onToggle={puedeToggle && idx === 0 && tieneBajoLiderazgo ? () => onToggle!(keyJefe) : undefined}
          />
        ))
      : null;

    const subtituloDepto = [
      etiquetaTipo,
      `${total} activo${total === 1 ? '' : 's'}`,
      tieneHijos ? resumenHijos(hijos) : null,
      tieneEncargados ? `${encargados.length} encargado${encargados.length === 1 ? '' : 's'}` : null,
      heredaJefe
        ? (jefeSuperior
          ? `Gerente: ${fmtNombreEmpleado(jefeSuperior)}`
          : `Gerente: ${jefeSuperiorNombre}`)
        : null,
    ].filter(Boolean).join(' · ');

    return (
      <div key={depto.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <NodoArbol
          variante="depto"
          titulo={depto.nombre}
          subtitulo={subtituloDepto}
          ancho={170}
          expandible={puedeToggle && tieneContenido}
          abierto={deptoAbierto}
          onToggle={puedeToggle && tieneContenido ? () => onToggle!(keyDepto) : undefined}
        />
        {deptoAbierto && tieneContenido && (
          <RamaHijos>
            {!esSub && nodoGerenteRaiz && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {nodoGerenteRaiz}
                {/* Equipo del departamento arriba; sucursales/subs abajo (no en la misma fila). */}
                {jefeAbierto && tieneStaff && (
                  <RamaHijos>{hojasStaff}</RamaHijos>
                )}
                {jefeAbierto && tieneHijos && (
                  <RamaHijos>{ramasHijos}</RamaHijos>
                )}
              </div>
            )}
            {esSub && tieneEncargados && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
                  {nodosEncargados}
                </div>
                {jefeAbierto && tieneStaff && (
                  <RamaHijos>{hojasStaff}</RamaHijos>
                )}
                {jefeAbierto && tieneHijos && (
                  <RamaHijos>{ramasHijos}</RamaHijos>
                )}
              </div>
            )}
            {esSub && heredaJefe && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {tieneStaff && <RamaHijos>{hojasStaff}</RamaHijos>}
                {tieneHijos && <RamaHijos>{ramasHijos}</RamaHijos>}
              </div>
            )}
            {esSub && !tieneEncargados && !heredaJefe && (tieneStaff || tieneHijos) && (
              <>
                {tieneStaff && <RamaHijos>{hojasStaff}</RamaHijos>}
                {tieneHijos && <RamaHijos>{ramasHijos}</RamaHijos>}
              </>
            )}
          </RamaHijos>
        )}
      </div>
    );
  };

  for (const area of areas) {
    ramasDepto.push(renderArea(area));
  }

  if (sinDepartamento.length > 0) {
    const sinAbierto = estaAbierto('sin-depto');
    ramasDepto.push(
      <div key="sin-depto" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <NodoArbol
          variante="hueco"
          titulo="Sin departamento"
          subtitulo={`${sinDepartamento.length} persona${sinDepartamento.length === 1 ? '' : 's'}`}
          ancho={170}
          expandible={puedeToggle}
          abierto={sinAbierto}
          onToggle={puedeToggle ? () => onToggle!('sin-depto') : undefined}
        />
        {sinAbierto && (
          <RamaHijos>
            {sinDepartamento.map(emp => (
              <NodoArbol
                key={emp.id}
                variante="persona"
                titulo={fmtNombreEmpleado(emp)}
                subtitulo={emp.puesto?.nombre || undefined}
                badge={<BadgeNivel puesto={emp.puesto?.nombre} />}
                ancho={148}
              />
            ))}
          </RamaHijos>
        )}
      </div>,
    );
  }

  const hayContenido =
    directores.length > 0 ||
    subdirectores.length > 0 ||
    gerentesGenerales.length > 0 ||
    ramasDepto.length > 0;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const empresaNodoRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
    fromToggle: boolean;
  } | null>(null);

  /** Centra el viewport en el banner de la empresa (arriba + horizontal). */
  const centrarEnEmpresa = useCallback((opts?: { resetZoom?: boolean }) => {
    const resetZoom = opts?.resetZoom !== false;
    if (resetZoom) setZoom(1);
    setPan({ x: 0, y: 0 });
    // Doble rAF: esperar layout tras reset de pan/zoom
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        const nodo = empresaNodoRef.current;
        if (!viewport || !nodo) return;
        const vp = viewport.getBoundingClientRect();
        const nd = nodo.getBoundingClientRect();
        const dx = Math.round(vp.left + vp.width / 2 - (nd.left + nd.width / 2));
        // Banner cerca del borde superior del canvas
        const dy = Math.round(vp.top + 24 - nd.top);
        setPan({ x: dx, y: dy });
      });
    });
  }, []);

  useEffect(() => {
    // Al cambiar de empresa (o al montar), enfocar el banner
    const t = window.setTimeout(() => centrarEnEmpresa(), 80);
    return () => window.clearTimeout(t);
  }, [empresa.id, centrarEnEmpresa]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => {
        const next = Math.round((z + step) * 10) / 10;
        return Math.min(2.5, Math.max(0.5, next));
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const iniciarArrastre = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('button')) return;
    const fromToggle = Boolean(t.closest('[data-org-toggle="1"]'));
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
      moved: false,
      fromToggle,
    };
  };

  const moverArrastre = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const umbral = d.fromToggle ? 10 : 5;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && (Math.abs(dx) > umbral || Math.abs(dy) > umbral)) {
      d.moved = true;
      setArrastrando(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (d.moved) {
      setPan({
        x: Math.round(d.origX + dx),
        y: Math.round(d.origY + dy),
      });
    }
  };

  const soltarArrastre = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.moved) {
      const bloquearClic = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        document.removeEventListener('click', bloquearClic, true);
      };
      document.addEventListener('click', bloquearClic, true);
    }
    dragRef.current = null;
    setArrastrando(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 10,
          zIndex: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px',
          borderRadius: 8,
          backgroundColor: 'rgba(255,255,255,0.92)',
          border: '1px solid #e2e8f0',
          fontSize: '0.75rem',
          color: '#475569',
          fontWeight: 600,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <span title="Arrastra el fondo para mover · clic en nodos para expandir · rueda para zoom">
          Zoom {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => centrarEnEmpresa()}
          style={{
            border: 'none',
            background: '#e0f2fe',
            color: '#0369a1',
            borderRadius: 5,
            padding: '2px 8px',
            fontSize: '0.72rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Centrar
        </button>
      </div>
      <div
        ref={viewportRef}
        onPointerDown={iniciarArrastre}
        onPointerMove={moverArrastre}
        onPointerUp={soltarArrastre}
        onPointerCancel={soltarArrastre}
        style={{
          overflow: 'hidden',
          height: 'calc(100vh - 220px)',
          minHeight: 420,
          cursor: arrastrando ? 'grabbing' : 'grab',
          userSelect: arrastrando ? 'none' : 'auto',
          touchAction: 'none',
          position: 'relative',
        }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: '0 0',
            willChange: arrastrando ? 'transform' : undefined,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: 'max-content',
              minWidth: '100%',
              padding: '20px 48px 28px',
              boxSizing: 'border-box',
              zoom,
            } as CSSProperties}
          >
          <div ref={empresaNodoRef} data-org-empresa="1">
            <NodoArbol
              variante="empresa"
              titulo={empresa.nombre}
              subtitulo={`${totalActivos} colaborador${totalActivos === 1 ? '' : 'es'} en estructura${empresa.siglas ? ` · ${empresa.siglas}` : ''}`}
              ancho={280}
              expandible={puedeToggle && hayContenido}
              abierto={empresaAbierta}
              onToggle={puedeToggle && hayContenido ? () => onToggle!('empresa') : undefined}
            />
          </div>
          {empresaAbierta && hayContenido ? (
            <RamaHijos>
              {(directores.length > 0 || subdirectores.length > 0 || gerentesGenerales.length > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <NivelLiderazgo
                    etiqueta={directores.length > 1 ? 'Directores' : 'Director'}
                    personas={directores}
                    interactivo={!!puedeToggle}
                    abierto={dirsAbiertos}
                    onToggle={puedeToggle ? () => onToggle!('dirs') : undefined}
                  />
                  <NivelLiderazgo
                    etiqueta={subdirectores.length > 1 ? 'Subdirectores' : 'Subdirector'}
                    personas={subdirectores}
                    interactivo={!!puedeToggle}
                    abierto={subsAbiertos}
                    onToggle={puedeToggle ? () => onToggle!('subs') : undefined}
                  />
                  <NivelLiderazgo
                    etiqueta="Gerente General"
                    personas={gerentesGenerales}
                    interactivo={!!puedeToggle}
                    abierto={ggAbiertos}
                    onToggle={puedeToggle ? () => onToggle!('gg') : undefined}
                  />
                  {ramasDepto.length > 0 && <RamaHijos>{ramasDepto}</RamaHijos>}
                </div>
              )}
              {directores.length === 0 &&
                subdirectores.length === 0 &&
                gerentesGenerales.length === 0 &&
                ramasDepto.length > 0 &&
                ramasDepto}
            </RamaHijos>
          ) : interactivo && !empresaAbierta ? (
            <div style={{ marginTop: 12, color: '#64748b', fontSize: '0.82rem' }}>
              Empresa contraída · clic en el nodo para ver la cadena
            </div>
          ) : (
            <div style={{ marginTop: 16, color: '#94a3b8', fontSize: '0.9rem' }}>
              No hay estructura para mostrar en esta empresa.
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VistaLista({
  areas,
  sinDepartamento,
  abiertos,
  toggle,
  directores,
  subdirectores,
  gerentesGenerales,
}: {
  areas: AreaNodo[];
  sinDepartamento: EmpleadoResponse[];
  abiertos: Record<string, boolean>;
  toggle: (key: string) => void;
  directores: EmpleadoResponse[];
  subdirectores: EmpleadoResponse[];
  gerentesGenerales: EmpleadoResponse[];
}) {
  return (
    <div style={{ padding: '14px 16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {(directores.length > 0 || subdirectores.length > 0 || gerentesGenerales.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
          {directores.length > 0 && (
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#5b21b6', marginBottom: 6, textTransform: 'uppercase' }}>
                Directores
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {directores.map(e => <PersonaRow key={e.id} emp={e} destacado />)}
              </div>
            </div>
          )}
          {subdirectores.length > 0 && (
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b21a8', marginBottom: 6, textTransform: 'uppercase' }}>
                Subdirector
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {subdirectores.map(e => <PersonaRow key={e.id} emp={e} destacado />)}
              </div>
            </div>
          )}
          {gerentesGenerales.length > 0 && (
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#3730a3', marginBottom: 6, textTransform: 'uppercase' }}>
                Gerente General
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {gerentesGenerales.map(e => <PersonaRow key={e.id} emp={e} destacado />)}
              </div>
            </div>
          )}
        </div>
      )}

      {areas.length === 0 && sinDepartamento.length === 0 && directores.length === 0 && (
        <div style={{ color: '#94a3b8', fontSize: '0.9rem', padding: '12px 4px' }}>
          No hay departamentos ni personal activo en esta empresa.
        </div>
      )}

      {areas.map(area => {
        const renderAreaLista = (
          a: AreaNodo,
          nivel: number,
          jefeSuperior: EmpleadoResponse | null = null,
          jefeSuperiorNombre: string | null = null,
        ): ReactNode => {
          const { depto, jefe, encargados, staff, total, hijos } = a;
          const key = `d-${depto.id}`;
          const open = abiertos[key] !== false;
          const tieneHijos = hijos.length > 0;
          const esSub = nivel > 0 || !!depto.padre_id;
          const heredaJefe = esSub && encargados.length === 0 && (!!jefeSuperior || !!jefeSuperiorNombre);
          const textoJefe = !esSub
            ? (jefe
              ? `Gerente: ${fmtNombreEmpleado(jefe)}`
              : depto.jefe_nombre
                ? `Gerente: ${depto.jefe_nombre}`
                : 'Sin gerente de área')
            : encargados.length > 0
              ? `Encargados: ${encargados.map(fmtNombreEmpleado).join(', ')}`
              : heredaJefe
                ? `Gerente: ${jefeSuperior ? fmtNombreEmpleado(jefeSuperior) : jefeSuperiorNombre}`
                : 'Sin encargados';
          const tipoLabel = esSub ? etiquetaHijoDepto(depto.tipo) : 'Departamento';          return (
            <div
              key={depto.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                backgroundColor: nivel > 0 ? '#fff' : '#f8fafc',
                overflow: 'hidden',
                marginLeft: nivel > 0 ? 12 : 0,
              }}
            >
              <button
                type="button"
                onClick={() => toggle(key)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ color: '#0369a1', fontWeight: 800, fontSize: '0.85rem', width: 16 }}>
                  {open ? '▾' : '▸'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>
                    {depto.nombre}
                    <span style={{ marginLeft: 8, fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>
                      {tipoLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                    {textoJefe}
                    {tieneHijos ? ` · ${resumenHijos(hijos)}` : ''}
                  </div>
                </div>
                <span
                  style={{
                    padding: '3px 9px',
                    borderRadius: 999,
                    backgroundColor: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  {total}
                </span>
              </button>

              {open && (
                <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {jefe && (
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0369a1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        Gerente de área
                      </div>
                      <PersonaRow emp={jefe} destacado />
                    </div>
                  )}
                  {encargados.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0369a1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        Encargados
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {encargados.map(enc => <PersonaRow key={enc.id} emp={enc} destacado />)}
                      </div>
                    </div>
                  )}

                  {staff.length > 0 ? (
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        Equipo ({staff.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {staff.map(emp => (
                          <PersonaRow key={emp.id} emp={emp} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    !jefe && !tieneHijos && !heredaJefe && (
                      <div style={{ fontSize: '0.82rem', color: '#94a3b8', padding: '4px 2px' }}>
                        Sin personal activo en esta área.
                      </div>
                    )
                  )}

                  {jefe && staff.length === 0 && !tieneHijos && (
                    <div style={{ fontSize: '0.82rem', color: '#94a3b8', padding: '2px 2px 0' }}>
                      Solo el jefe de área está activo en este departamento.
                    </div>
                  )}

                  {tieneHijos && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        Subdepartamentos a su cargo
                      </div>
                      {hijos.map(h =>
                        renderAreaLista(
                          h,
                          nivel + 1,
                          encargados[0] || jefe || jefeSuperior,
                          encargados[0]
                            ? fmtNombreEmpleado(encargados[0])
                            : (depto.jefe_nombre || jefeSuperiorNombre),
                        ),
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        };
        return renderAreaLista(area, 0);
      })}

      {sinDepartamento.length > 0 && (
        <div
          style={{
            border: '1px dashed #cbd5e1',
            borderRadius: 10,
            backgroundColor: '#fff',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={() => toggle('sin-depto')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ color: '#94a3b8', fontWeight: 800, fontSize: '0.85rem', width: 16 }}>
              {abiertos['sin-depto'] !== false ? '▾' : '▸'}
            </span>
            <div style={{ flex: 1, fontWeight: 700, color: '#475569', fontSize: '0.95rem' }}>
              Sin departamento
            </div>
            <span
              style={{
                padding: '3px 9px',
                borderRadius: 999,
                backgroundColor: '#f1f5f9',
                color: '#64748b',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              {sinDepartamento.length}
            </span>
          </button>
          {abiertos['sin-depto'] !== false && (
            <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sinDepartamento.map(emp => (
                <PersonaRow key={emp.id} emp={emp} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const OrganigramaPage = () => {
  const isMobile = useIsMobile();

  const [empresas, setEmpresas] = useState<EmpresaResponse[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartamentoResponse[]>([]);
  const [empleados, setEmpleados] = useState<EmpleadoResponse[]>([]);
  const [empresaId, setEmpresaId] = useState<string>('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [vista, setVista] = useState<VistaModo>('arbol');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [emprsRes, deptosRes, empsRes] = await Promise.all([
        api.get<EmpresaResponse[]>('/personal/empresas', { params: { limit: 500 } }),
        api.get<DepartamentoResponse[]>('/personal/departamentos', { params: { limit: 1000 } }),
        // incluir_exentos: Directores/GG suelen ser usuarios especiales
        api.get<EmpleadoResponse[]>('/personal/empleados', {
          // string 'true': mismo criterio que Personal (Directores suelen ser exentos)
          params: { estado: 'activo', limit: 5000, incluir_exentos: 'true' },
        }),
      ]);
      const emprs = Array.isArray(emprsRes.data) ? emprsRes.data.filter(e => e.activo) : [];
      const deptos = Array.isArray(deptosRes.data) ? deptosRes.data.filter(d => d.activo) : [];
      const emps = Array.isArray(empsRes.data) ? empsRes.data : [];
      setEmpresas(emprs);
      setDepartamentos(deptos);
      setEmpleados(emps);
      setEmpresaId(prev => {
        if (prev && emprs.some(e => String(e.id) === prev)) return prev;
        return emprs[0] ? String(emprs[0].id) : '';
      });
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'No se pudo cargar el organigrama');
      setEmpresas([]);
      setDepartamentos([]);
      setEmpleados([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const empresaSeleccionada = useMemo(
    () => empresas.find(e => String(e.id) === empresaId) || null,
    [empresas, empresaId],
  );

  const activosEmpresa = useMemo(() => {
    if (!empresaId) return [];
    const id = Number(empresaId);
    const deptoIds = new Set(
      departamentos.filter(d => Number(d.empresa_id) === id && d.activo).map(d => d.id),
    );
    return empleados
      .filter(e => {
        if (Number(e.empresa_id) === id) return true;
        if (e.departamento_id != null && deptoIds.has(e.departamento_id)) return true;
        return false;
      })
      .sort(cmpNombreEmpleado);
  }, [empleados, empresaId, departamentos]);

  /** Conteo operativo: sin usuarios especiales (exentos). La dirección sigue en el bloque de liderazgo. */
  const totalActivosOperativos = useMemo(
    () => activosEmpresa.filter(e => !e.exento_incidencias).length,
    [activosEmpresa],
  );

  const liderazgo = useMemo(() => {
    if (!empresaId) {
      return {
        directores: [] as EmpleadoResponse[],
        subdirectores: [] as EmpleadoResponse[],
        gerentesGenerales: [] as EmpleadoResponse[],
      };
    }
    const id = Number(empresaId);
    const enAlcance = empleados.filter(e => relacionadoConEmpresa(e, id, departamentos));
    const directores = enAlcance
      .filter(e => esPuestoLiderazgo(puestoKey(e)) === 'director')
      .sort(cmpNombreEmpleado);
    const subdirectores = enAlcance
      .filter(e => esPuestoLiderazgo(puestoKey(e)) === 'subdirector')
      .sort(cmpNombreEmpleado);
    const gerentesGenerales = enAlcance
      .filter(e => esPuestoLiderazgo(puestoKey(e)) === 'gerente general')
      .sort(cmpNombreEmpleado);
    return { directores, subdirectores, gerentesGenerales };
  }, [empleados, empresaId, departamentos]);

  const idsLiderazgo = useMemo(() => {
    const s = new Set<number>();
    for (const e of [...liderazgo.directores, ...liderazgo.subdirectores, ...liderazgo.gerentesGenerales]) {
      s.add(e.id);
    }
    return s;
  }, [liderazgo]);

  const deptosEmpresa = useMemo(() => {
    if (!empresaId) return [];
    const id = Number(empresaId);
    return departamentos
      .filter(d => d.empresa_id === id)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [departamentos, empresaId]);

  const areas = useMemo(() => {
    const porId = new Map(empleados.map(e => [e.id, e]));
    const idsDeptoEmpresa = new Set(deptosEmpresa.map(d => d.id));

    const buildArea = (d: DepartamentoResponse): AreaNodo => {
      const esHijo = !!d.padre_id;
      const encIds = new Set((d.encargados_ids || []).map(Number));
      const delArea = activosEmpresa.filter(
        e => e.departamento_id === d.id && !idsLiderazgo.has(e.id) && !e.exento_incidencias,
      );
      const jefeEmp = !esHijo && d.jefe_id ? porId.get(d.jefe_id) || null : null;
      const jefe =
        jefeEmp && !idsLiderazgo.has(jefeEmp.id) && !jefeEmp.exento_incidencias ? jefeEmp : null;
      const encargados = esHijo
        ? (d.encargados_ids || [])
            .map(id => porId.get(id))
            .filter(
              (e): e is EmpleadoResponse =>
                !!e && !idsLiderazgo.has(e.id) && !e.exento_incidencias,
            )
            .sort(cmpNombreEmpleado)
        : [];
      const idsExcluirStaff = new Set<number>();
      if (d.jefe_id) idsExcluirStaff.add(d.jefe_id);
      encIds.forEach(id => idsExcluirStaff.add(id));
      const staff = delArea
        .filter(e => !idsExcluirStaff.has(e.id))
        .sort(cmpNombreEmpleado);
      const hijos = deptosEmpresa
        .filter(h => h.padre_id === d.id)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        .map(buildArea);
      const totalHijos = hijos.reduce((s, h) => s + h.total, 0);
      return {
        depto: d,
        jefe,
        encargados,
        staff,
        hijos,
        total: delArea.length + totalHijos,
      };
    };

    // Solo raíces (cuelgan de la empresa). Huérfanos sin padre activo también como raíz.
    return deptosEmpresa
      .filter(d => !d.padre_id || !idsDeptoEmpresa.has(d.padre_id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(buildArea);
  }, [deptosEmpresa, activosEmpresa, empleados, idsLiderazgo]);

  const visitarAreas = (lista: AreaNodo[], fn: (a: AreaNodo) => void) => {
    for (const a of lista) {
      fn(a);
      if (a.hijos.length) visitarAreas(a.hijos, fn);
    }
  };

  const sinDepartamento = useMemo(
    () => activosEmpresa
      .filter(e => !e.departamento_id && !idsLiderazgo.has(e.id) && !e.exento_incidencias)
      .sort(cmpNombreEmpleado),
    [activosEmpresa, idsLiderazgo],
  );

  useEffect(() => {
    setAbiertos(prev => {
      const next: Record<string, boolean> = {
        empresa: prev.empresa ?? true,
        dirs: prev.dirs ?? true,
        subs: prev.subs ?? true,
        gg: prev.gg ?? true,
      };
      visitarAreas(areas, a => {
        next[`d-${a.depto.id}`] = prev[`d-${a.depto.id}`] ?? true;
        next[`j-${a.depto.id}`] = prev[`j-${a.depto.id}`] ?? true;
      });
      if (sinDepartamento.length) {
        next['sin-depto'] = prev['sin-depto'] ?? true;
      }
      return next;
    });
  }, [empresaId, areas, sinDepartamento.length]);

  const toggle = (key: string) => {
    setAbiertos(prev => ({ ...prev, [key]: !(prev[key] !== false) }));
  };

  const expandirTodo = () => {
    const next: Record<string, boolean> = { empresa: true, dirs: true, subs: true, gg: true };
    visitarAreas(areas, a => {
      next[`d-${a.depto.id}`] = true;
      next[`j-${a.depto.id}`] = true;
    });
    if (sinDepartamento.length) next['sin-depto'] = true;
    setAbiertos(next);
  };

  const colapsarTodo = () => {
    const next: Record<string, boolean> = { empresa: true, dirs: false, subs: false, gg: false };
    visitarAreas(areas, a => {
      next[`d-${a.depto.id}`] = false;
      next[`j-${a.depto.id}`] = false;
    });
    if (sinDepartamento.length) next['sin-depto'] = false;
    setAbiertos(next);
  };

  const selectorVista = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" style={btnVista(vista === 'arbol')} onClick={() => setVista('arbol')}>
        Árbol
      </button>
      <button type="button" style={btnVista(vista === 'interactivo')} onClick={() => setVista('interactivo')}>
        Interactivo
      </button>
      <button type="button" style={btnVista(vista === 'lista')} onClick={() => setVista('lista')}>
        Lista
      </button>
    </div>
  );

  const mostrarExpandir = vista === 'interactivo' || vista === 'lista';

  const toolbar = isMobile ? (
    <div style={rhMobileFilterStack}>
      <select
        value={empresaId}
        onChange={e => setEmpresaId(e.target.value)}
        style={rhMobileSelect}
        aria-label="Empresa"
      >
        {empresas.length === 0 && <option value="">Sin empresas</option>}
        {empresas.map(e => (
          <option key={e.id} value={e.id}>{e.nombre}</option>
        ))}
      </select>
      {selectorVista}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={{ ...rhMobileBtnSecondary, flex: 1 }} onClick={() => void cargar()} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
        {mostrarExpandir && (
          <>
            <button type="button" style={rhMobileBtnSecondary} onClick={expandirTodo}>Abrir</button>
            <button type="button" style={rhMobileBtnSecondary} onClick={colapsarTodo}>Cerrar</button>
          </>
        )}
      </div>
      {empresaSeleccionada && (
        <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
          {totalActivosOperativos} activo{totalActivosOperativos === 1 ? '' : 's'} · {areas.length} área{areas.length === 1 ? '' : 's'}
        </div>
      )}
    </div>
  ) : (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
        marginBottom: 16,
        padding: '14px 16px',
        backgroundColor: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
      }}
    >
      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Empresa</label>
      <select
        value={empresaId}
        onChange={e => setEmpresaId(e.target.value)}
        style={selectStyle}
      >
        {empresas.length === 0 && <option value="">Sin empresas</option>}
        {empresas.map(e => (
          <option key={e.id} value={e.id}>{e.nombre}</option>
        ))}
      </select>
      {selectorVista}
      <button type="button" style={btnSecondary} onClick={() => void cargar()} disabled={cargando}>
        {cargando ? 'Cargando…' : 'Actualizar'}
      </button>
      {mostrarExpandir && (
        <>
          <button type="button" style={btnSecondary} onClick={expandirTodo}>Expandir todo</button>
          <button type="button" style={btnSecondary} onClick={colapsarTodo}>Colapsar todo</button>
        </>
      )}
      {empresaSeleccionada && (
        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
          {totalActivosOperativos} activo{totalActivosOperativos === 1 ? '' : 's'} · {areas.length} área{areas.length === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );

  return (
    <div style={{ padding: isMobile ? '14px 12px 32px' : '20px 24px 40px' }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? '1.15rem' : '1.25rem', color: '#0f172a', fontWeight: 700 }}>Organigrama</h2>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.88rem' }}>
          Vista dinámica por empresa: solo personal activo. En árbol/interactivo, usa la rueda del mouse para hacer zoom.
        </p>
      </div>

      {toolbar}

      {error && (
        <div style={{ padding: 12, borderRadius: 8, backgroundColor: '#fef2f2', color: '#991b1b', marginBottom: 12, fontSize: '0.88rem' }}>
          {error}
        </div>
      )}

      {cargando && !empresaSeleccionada && (
        <div style={{ color: '#64748b', fontSize: '0.9rem', padding: 20 }}>Cargando organigrama…</div>
      )}

      {empresaSeleccionada && (
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            // Árbol: visible para no recortar Directores/GG ni ramas anchas
            overflow: vista === 'lista' ? 'hidden' : 'visible',
          }}
        >
          {vista === 'lista' ? (
            <>
              <div
                style={{
                  padding: isMobile ? '14px 14px' : '16px 18px',
                  background: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 50%, #0ea5e9 100%)',
                  color: '#fff',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: isMobile ? '1rem' : '1.1rem', lineHeight: 1.3 }}>
                  {empresaSeleccionada.nombre}
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: 4 }}>
                  {totalActivosOperativos} colaborador{totalActivosOperativos === 1 ? '' : 'es'} activo{totalActivosOperativos === 1 ? '' : 's'}
                  {empresaSeleccionada.siglas ? ` · ${empresaSeleccionada.siglas}` : ''}
                </div>
              </div>
              <VistaLista
                areas={areas}
                sinDepartamento={sinDepartamento}
                abiertos={abiertos}
                toggle={toggle}
                directores={liderazgo.directores}
                subdirectores={liderazgo.subdirectores}
                gerentesGenerales={liderazgo.gerentesGenerales}
              />
            </>
          ) : (
            <VistaArbol
              empresa={empresaSeleccionada}
              areas={areas}
              sinDepartamento={sinDepartamento}
              totalActivos={totalActivosOperativos}
              directores={liderazgo.directores}
              subdirectores={liderazgo.subdirectores}
              gerentesGenerales={liderazgo.gerentesGenerales}
              interactivo={vista === 'interactivo'}
              abiertos={abiertos}
              onToggle={toggle}
            />
          )}
        </div>
      )}
    </div>
  );
};
