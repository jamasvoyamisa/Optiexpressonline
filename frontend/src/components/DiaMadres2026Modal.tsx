import { useEffect, useMemo, useState } from 'react';
import logoGrupo from '../assets/GPOCristal.png';
import { isDiaMadres2026VentanaActiva } from '../utils/diaMadres2026';
import './DiaMadres2026Modal.css';

type Props = {
  forzar?: boolean;
};

export function DiaMadres2026Modal({ forzar = false }: Props) {
  const enVentana = useMemo(() => isDiaMadres2026VentanaActiva(forzar), [forzar]);
  const [abierto, setAbierto] = useState(enVentana);

  useEffect(() => {
    setAbierto(enVentana);
  }, [enVentana]);

  if (!enVentana || !abierto) return null;

  const cerrar = () => setAbierto(false);

  return (
    <div
      className="dmm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dmm-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div className="dmm-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="dmm-cerrar" onClick={cerrar} aria-label="Cerrar mensaje">
          ✕
        </button>
        <div className="dmm-festivo" aria-hidden="true">
          <span className="dmm-petalo">🌸</span>
          <span className="dmm-petalo">🌷</span>
          <span className="dmm-petalo">💖</span>
          <span className="dmm-petalo">🌺</span>
          <span className="dmm-petalo">🌸</span>
          <span className="dmm-petalo">💐</span>
          <span className="dmm-petalo">🌷</span>
          <span className="dmm-petalo">✨</span>
        </div>
        <div className="dmm-ornamento" aria-hidden="true">
          ❀ ❀ ❀
        </div>
        <p className="dmm-rubrica">A todas las madres de Grupo Cristal</p>
        <h2 id="dmm-titulo" className="dmm-titulo">
          Feliz Día de las Madres
        </h2>
        <div className="dmm-cuerpo">
          <p>
            <strong>Ser madre</strong> es transformar el tiempo en abrazos, los sueños en impulso para otros, y cada
            pequeño esfuerzo en amor incondicional. Es estar presente en las risas, en las ausencias, en la calma y en
            la tormenta. Es construir día a día un mundo mejor desde la ternura y la fortaleza.
          </p>
          <p>
            En <strong>Grupo Cristal</strong> reconocemos y admiramos esa fuerza inmensa que llevas dentro. Sabemos que
            detrás de cada logro, de cada trabajo bien hecho, de cada meta alcanzada, hay historias de madres que
            también trasnocharon, madres que también soñaron para sus hijos, madres que supieron equilibrar el corazón
            y la responsabilidad.
          </p>
          <p>
            Este <strong>10 de mayo</strong> no solo celebramos tu día, te agradecemos. Porque tu ejemplo nos recuerda
            que crecer como empresa también significa valorar lo que realmente importa: el amor, la entrega y la
            empatía.
          </p>
          <p>
            Gracias por ser <em>fuente de vida, inspiración y equilibrio</em>. Desde nuestro equipo, te enviamos un
            respetuoso y cálido abrazo.
          </p>
          <p className="dmm-cierre">¡Feliz Día de las Madres!</p>
        </div>
        <footer className="dmm-firma">
          <span className="dmm-firma-line" />
          <p>Atentamente,</p>
          <p className="dmm-firma-bold">Dirección y Personal de Grupo Cristal</p>
        </footer>
        <div className="dmm-logo-wrap">
          <img src={logoGrupo} alt="Grupo Cristal" className="dmm-logo" width={280} height={80} decoding="async" />
        </div>
      </div>
    </div>
  );
}
