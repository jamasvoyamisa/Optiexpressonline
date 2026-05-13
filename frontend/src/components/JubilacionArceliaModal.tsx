import { useEffect, useMemo, useState } from 'react';
import logoGrupo from '../assets/GPOCristal.png';
import { isJubilacionArceliaVentanaActiva } from '../utils/jubilacionArcelia';
import './JubilacionArceliaModal.css';

type Props = {
  forzar?: boolean;
};

export function JubilacionArceliaModal({ forzar = false }: Props) {
  const enVentana = useMemo(() => isJubilacionArceliaVentanaActiva(forzar), [forzar]);
  const [abierto, setAbierto] = useState(enVentana);

  useEffect(() => {
    setAbierto(enVentana);
  }, [enVentana]);

  if (!enVentana || !abierto) return null;

  const cerrar = () => setAbierto(false);

  return (
    <div
      className="jam-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="jam-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div className="jam-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="jam-cerrar" onClick={cerrar} aria-label="Cerrar mensaje">
          ✕
        </button>
        <div className="jam-festivo" aria-hidden="true">
          <span className="jam-confeti">✨</span>
          <span className="jam-confeti">🎉</span>
          <span className="jam-confeti">⭐</span>
          <span className="jam-confeti">🎊</span>
          <span className="jam-confeti">✨</span>
          <span className="jam-confeti">⭐</span>
          <span className="jam-confeti">🎉</span>
        </div>
        <div className="jam-ornamento" aria-hidden="true">
          ✦
        </div>
        <p className="jam-rubrica">A nombre de Distribuidora Europea</p>
        <h2 id="jam-titulo" className="jam-titulo">
          Gracias por tu legado
        </h2>
        <div className="jam-cuerpo">
          <p>
            Queremos expresar nuestro más sincero{' '}
            <strong>agradecimiento a Arcelia Gómez Ibarra</strong> por su entrega, profesionalismo y dedicación
            ejemplar.
          </p>
          <p>
            Su trabajo ha sido un pilar fundamental para nuestra organización, y su calidad humana, un ejemplo para
            todos los que tuvimos el honor de trabajar a su lado.
          </p>
          <p>
            Le deseamos una <strong>jubilación llena de paz, salud y momentos felices</strong>. Su huella permanece en
            nuestra empresa.
          </p>
          <p className="jam-cierre">¡Gracias por todo, Arcelia!</p>
        </div>
        <footer className="jam-firma">
          <span className="jam-firma-line" />
          <p>Atentamente,</p>
          <p className="jam-firma-bold">Dirección y Personal de Grupo Cristal</p>
        </footer>
        <div className="jam-logo-wrap">
          <img src={logoGrupo} alt="Grupo Cristal" className="jam-logo" width={280} height={80} decoding="async" />
        </div>
      </div>
    </div>
  );
}
