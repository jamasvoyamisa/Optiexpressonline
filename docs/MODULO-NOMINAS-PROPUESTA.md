# Módulo de Nóminas — Propuesta Técnica y Comparativa

**Proyecto:** Optiexpress  
**Fecha:** Marzo 2026 (actualizado julio 2026)  
**Objetivo:** Documentar la implementación de un módulo de nóminas con timbrado SAT y su comparativa con CONTPAQ Nóminas.  
**PAC / timbrado:** **FiscalAPI** (sandbox `test.fiscalapi.com` y producción `live.fiscalapi.com`). Facturama quedó descartado como proveedor.

---

## 1. Resumen Ejecutivo

Este documento describe qué se requiere para integrar un módulo de nóminas en Optiexpress que permita emitir recibos de nómina timbrados ante el SAT, los beneficios que aportaría a la aplicación, y una comparativa con CONTPAQ Nóminas como referencia del mercado.

---

## 2. Estado Actual de Optiexpress

### 2.1 Datos ya disponibles

| Entidad | Campos relevantes para nómina |
|---------|--------------------------------|
| **Empleado** | RFC, CURP, NSS, nombre completo, fecha_ingreso, departamento, puesto, empresa |
| **Empresa** | RFC, nombre, domicilio fiscal |
| **Asistencia** | Checadas (entrada, salida, comida), incidencias (retardos, faltas) |
| **Vacaciones** | Días de derecho, días tomados, periodos por antigüedad |
| **Incapacidades** | Tipo IMSS, fechas, folio |
| **Préstamos** | Montos, deducciones quincenales |

### 2.2 Lo que falta para nómina

- Salario base y Salario Diario Integrado (SDI)
- Tipo de contrato (indeterminado, obra determinada, etc.)
- Régimen fiscal del empleado
- Banco y cuenta para depósito
- Registro patronal (IMSS)
- Cálculo de percepciones y deducciones (ISR, IMSS obrero, INFONAVIT)
- Periodos de pago (quincenal, semanal, mensual)
- Integración con **FiscalAPI** para timbrado CFDI de nómina (sandbox y, con opt-in, live)

### 2.3 Inventario de requisitos en México (normativa y operación)

Esta lista orienta el diseño funcional del módulo; no todo debe implementarse en el primer sprint. Prioridad habitual: **ISR + IMSS + percepciones base + deducciones legales**, luego **INFONAVIT / FONACOT**, luego **CFDI / timbrado**, luego **SUA / IDSE** y conciliaciones.

#### Comprobante fiscal (SAT)

- **CFDI 4.0 tipo N (Nómina)** + **Complemento de Nómina** (versión y revisión vigentes; el SAT publica revisiones del complemento; en fechas recientes existen validaciones más estrictas de importes gravado/exento).
- Catálogos oficiales (actualizarlos periódicamente desde el SAT): tipo de nómina (ordinaria/extraordinaria), periodicidad de pago, régimen de contratación, **tipos de percepción y deducción**, otros pagos, bancos, etc.
- **Timbrado** vía **FiscalAPI** (PAC) con **CSD** del emisor; almacenamiento de XML/PDF, UUID y estatus.
- Datos mínimos emisor/receptor: RFC, nombre o razón social, código postal del trabajador alineado al catálogo del SAT; uso de CFDI (p. ej. CN01 para salarios), según catálogo vigente.

#### ISR (impuesto sobre la renta del trabajador)

- Tablas del art. 96 LISR según periodicidad (semanal, quincenal, mensual).
- **Subsidio para el empleo** cuando aplique.
- Roadmap típico: **ajuste anual**, acumulados de ISR retenido, **finiquitos y liquidaciones** (tablas y reglas distintas a nómina ordinaria).

#### IMSS (cuotas obrero-patronales y seguridad social)

- **Salario Base de Cotización (SBC)** y **Salario Diario Integrado (SDI)**; límites con **UMA** y salario mínimo general por zona.
- **Días cotizados** por periodo (incapacidades, faltas injustificadas pueden reducir días).
- Ramos: enfermedades y maternidad, invalidez y vida, riesgos de trabajo (clase de prima), guarderías, retiro/cesantía (cuotas tripartitas), etc.
- **Aportación patronal al esquema de vivienda (INFONAVIT)**: en el esquema clásico suele asociarse al porcentaje sobre SBC; validar siempre contra normativa y tablas del ejercicio al implementar.

#### INFONAVIT (vivienda)

- **Cuota patronal** al esquema de vivienda (parametrizar por año y normativa vigente).
- **Descuentos al trabajador por crédito INFONAVIT**: factor de descuento, número de crédito, límites (tope respecto al salario pagado; reglas especiales para trabajadores con salario mínimo).
- **Reformas**: pueden existir reglas sobre suspensión o continuidad de descuentos ante faltas o incapacidades; deben **parametrizarse** según la norma aplicable en cada momento.

#### INFONACOT (crédito de consumo)

- Descuentos con porcentaje o monto según convenio; registro de préstamo y saldos (similar en concepto a un préstamo interno, pero con reglas propias).

#### Préstamos y cargas sobre nómina

- **Préstamos al personal**: Optiexpress ya cuenta con módulo de préstamos; la nómina debe poder integrarlos como deducciones por periodo y límites.
- **INFONAVIT / FONACOT** deben modelarse como tipos de deducción distintos del préstamo interno (no mezclar sin clasificar el origen).

#### Otras deducciones y retenciones frecuentes

| Tipo | Notas |
|------|--------|
| **Pensión alimenticia** | Orden judicial; porcentaje o monto; límites legales sobre el neto; reflejo en CFDI como deducción. |
| **Cuotas sindicales** | Monto o porcentaje según contrato. |
| **Fondo de ahorro** | Topes y tratamiento fiscal (exención hasta límites; validar por ejercicio). |
| **Seguros** (vida, gastos médicos mayores) | Deducción voluntaria. |
| **Cooperativas / caja de ahorro** | Según política interna. |

#### Percepciones laborales y prestaciones (LFT y práctica común)

- Salario base, **horas extra** (límites LFT), **aguinaldo**, **prima vacacional**, **PTU** (cuando aplique), **vacaciones** y días festivos pagados, **bonos**, **viáticos** (tratamiento fiscal específico si aplica).
- Integración con **asistencia**, **vacaciones** e **incapacidades** ya existentes en Optiexpress para alimentar días pagados, faltas o subsidios.

#### IMSS digital: SUA e IDSE

- **IDSE**: movimientos afiliatorios (altas, bajas, modificaciones de salario); suele requerir **e.firma** del patrón.
- **SUA**: cálculo de cuotas obrero-patronales y archivos de pago; la información correcta en IDSE es prerequisito para que SUA cuadre.
- Una aplicación de nómina **no sustituye** los portales del IMSS, pero puede **exportar** datos o **conciliar** totales calculados internamente vs. lo reportable en SUA.

#### Parámetros legales que cambian cada año

- **Salario mínimo** por zona, **UMA**, tablas ISR, cuotas IMSS: deben ser **tablas parametrizables por ejercicio**, no valores fijos en código.

#### Integración con los módulos actuales de Optiexpress

- Reutilizar datos de **Empresa** y **Empleado** (RFC, CURP, NSS, fechas de ingreso y baja).
- Enlazar el **módulo de préstamos** como fuente de deducciones cuando exista política definida.
- Usar **asistencia**, **vacaciones** e **incapacidades** como insumos de cálculo o validación.

#### Resumen ejecutivo (México)

- **Obligatorio ante el SAT** para la mayoría de empleadores: nómina electrónica (CFDI de tipo nómina).
- **Núcleo de cálculo típico**: ISR + IMSS + aportaciones/descuentos INFONAVIT + percepciones y deducciones según contrato y ley.
- **Operación**: periodicidad configurable, cierre de periodo, recibos, cumplimiento de obligaciones bimestrales/mensuales según aplique.
- **Mayor complejidad** en: timbrado, catálogos SAT, conciliación con IMSS, reformas anuales; se recomienda validación con **contador o fiscalista** antes de producción.

---

## 3. Qué se tendría que hacer

### 3.1 Fase 1: Modelo de datos y catálogos

#### 3.1.1 Nuevas tablas

```
empresa_nomina_config
├── empresa_id (FK)
├── registro_patronal
├── regimen_fiscal_sat
├── codigo_postal_expedicion
├── prima_vacacional_pct   # % a pagar (LFT mín. 25; editable si la empresa paga más)
├── aguinaldo_dias         # default 15 (ver §3.2.8)
└── (credenciales FiscalAPI van en backend/.env, no en BD: API key, tenant, CSD opcional)

empleado_nomina
├── empleado_id (FK, único)
├── salario_base
├── salario_diario_integrado
├── tipo_contrato (01, 02, 03... catálogo SAT)
├── regimen_tipo (02 Sueldos, etc.)
├── banco_clave (catálogo SAT)
├── cuenta_bancaria
├── entidad_federativa_clave (SLP, CDMX...)
├── riesgo_puesto (1-5, catálogo)
├── tipo_jornada (01 Diurna, etc.)
├── sindicalizado (bool)
└── fecha_actualizacion

# Historial de cambios de salario (ver §3.2.7)
empleado_salario_historial
├── id
├── empleado_id (FK)
├── salario_anterior
├── salario_nuevo
├── sdi_anterior / sdi_nuevo (opcional)
├── motivo (inflacion | merito | convenio | otro)
├── porcentaje_aplicado (nullable; p. ej. inflación anual)
├── referencia_inflacion (nullable; ej. “INPC 2025 4.2%”)
├── vigencia_desde (date)
├── aplicado_por (empleado_id usuario RH)
└── created_at

periodo_nomina
├── empresa_id
├── fecha_inicio
├── fecha_fin
├── tipo (ordinaria O, extraordinaria E)
├── estado (borrador, calculada, timbrada, pagada)
├── total_percepciones
├── total_deducciones
└── created_at

detalle_nomina_empleado
├── periodo_nomina_id
├── empleado_id
├── dias_pagados
├── percepciones_json (o tabla normalizada)
├── deducciones_json
├── total_gravado
├── total_exento
├── cfdi_uuid (después de timbrar)
├── cfdi_xml_url
└── cfdi_pdf_url
```

#### 3.1.2 Catálogos SAT necesarios

- Tipos de contrato (c_ TipoContrato)
- Regímenes de contratación (c_TipoRegimen)
- Percepciones (c_TipoPercepcion)
- Deducciones (c_TipoDeduccion)
- Bancos (c_Banco)
- Entidades federativas
- Riesgos de puesto (c_RiesgoPuesto)
- Tipos de jornada (c_TipoJornada)

### 3.2 Fase 2: Cálculos fiscales

#### 3.2.1 ISR (Impuesto Sobre la Renta)

- Tabla mensual del SAT (LISR)
- Subsidio al empleo (tabla anexa)
- Cálculo sobre ingreso gravado

#### 3.2.2 IMSS (cuota obrera)

- Enfermedad y maternidad
- Invalidez y vida
- Cesantía y vejez
- Tabulador vigente según SDI

#### 3.2.3 Otras deducciones

- INFONAVIT (si aplica)
- Préstamos (ya existentes en el sistema)
- Faltas, retardos (descuentos por incidencias)

#### 3.2.4 Percepciones

- Sueldo (base)
- Horas extra (de asistencia si se registran)
- Bonos, premios y otras prestaciones (ver **3.2.6**)
- Vacaciones (proporcional)
- Aguinaldo (ver **3.2.8**)
- Reparto de utilidades / PTU (ver **3.2.9**)
- Prima vacacional (ver **3.2.5** — pendiente de implementación cercana)

#### 3.2.5 Prima vacacional — pendiente (implementar en el futuro cercano)

**Estado actual (jul 2026):** el módulo de vacaciones solo gestiona **días** (LFT). El motor de nómina **no calcula** prima vacacional ni guarda el **porcentaje** a pagar. En catálogo SAT existe la percepción `021` (Prima vacacional), pero no se usa en el cálculo. (Nota: en deducciones internas la clave `021` hoy se usa para IMSS cuota obrera; al timbrar se mapea a seguridad social — no confundir con la percepción `021`.)

**Marco legal (referencia):** LFT — prima vacacional mínima del **25 %** sobre los salarios correspondientes a los días de vacaciones. La empresa puede pactar un porcentaje **mayor**.

**Qué implementar:**

1. **Configuración — porcentaje**
   - Campo en `empresa_nomina_config`: `prima_vacacional_pct` (Numeric, default **25.00**).
   - UI: Configuración → Empresa → Nómina / Timbrado (o pantalla de config nómina): “Prima vacacional (%)”.
   - Validar `>= 25` (mínimo legal) salvo excepción documentada con contador.
   - Opcional a futuro: override por empleado si algún contrato paga distinto.

2. **Cálculo del monto** (cuando corresponda pagar en un periodo)
   - Fórmula base sugerida:
     `prima = salario_diario × días_vacaciones_del_hecho × (prima_vacacional_pct / 100)`
   - `salario_diario` = `salario_base / dias_base_mes` (misma base que el motor actual).
   - `días_vacaciones_del_hecho`: según política a definir con RH/contador, por ejemplo:
     - al **gozar** vacaciones (días de la solicitud aprobada en el periodo), o
     - al **aniversario** / generación del derecho, o
     - proporcional según política interna.
   - Integrar con el módulo de vacaciones existente (solicitudes / saldos) como fuente de días.

3. **Dónde se agrega el monto en nómina**
   - Al calcular el periodo, añadir una **percepción** en `detalle_nomina_empleado.percepciones_json`:
     - `clave`: `021` (TipoPercepción SAT — Prima vacacional)
     - `concepto`: “Prima vacacional”
     - `importe_gravado` / `importe_exento` según reglas ISR vigentes (validar exención art. 93 LISR con contador)
   - Sumar a `total_percepciones` y al neto del empleado.
   - En timbrado FiscalAPI: mapear esa línea al complemento de nómina (earning `021`).

4. **UI / operación**
   - Mostrar el % configurado en la ficha de empresa.
   - En preview del recibo: línea visible “Prima vacacional” cuando aplique.
   - No mezclar con el pago de los días de vacaciones propiamente dichos (percepción de sueldo/vacaciones aparte si aplica).

**Checklist de implementación cercana:**

- [ ] Columna `prima_vacacional_pct` en `empresa_nomina_config` (+ migración Alembic, default 25)
- [ ] Campo en UI de configuración nómina por empresa
- [ ] Regla de cuándo se dispara el pago (goce / aniversario / manual en periodo)
- [ ] Cálculo en `calculo_nomina.py` → percepción SAT `021`
- [ ] Preview + validación antes de timbrar
- [ ] Revisión con contador (exento vs gravado, tope LISR)

#### 3.2.6 Prestaciones y bonos (asistencia, puntualidad, etc.) — pendiente

**Estado actual (jul 2026):** el catálogo SAT en código ya incluye claves como `049` (Premios por asistencia), `010` (Premios por puntualidad) y `038` (Otros ingresos por salarios). El motor de nómina **solo genera** la percepción de sueldo `001`. No hay catálogo de prestaciones por empresa ni reglas automáticas.

**Enfoque:** las prestaciones **no son un módulo aparte**; son **líneas de percepción** adicionales en el mismo recibo. Se suman a `percepciones_json`, aumentan `total_percepciones` y (si son gravadas) la base del ISR; luego se restan ISR, IMSS y demás descuentos para obtener el neto. El `cfdi_builder` ya recorre todas las líneas de `percepciones_json`, así que una vez calculadas salen en el timbrado.

**Claves SAT de referencia (ejemplos):**

| Clave | Concepto SAT | Uso típico en Optiexpress |
|-------|--------------|---------------------------|
| `049` | Premios por asistencia | Bono si no hay faltas / cumple asistencia del periodo |
| `010` | Premios por puntualidad | Bono ligado a retardos / % puntualidad |
| `038` | Otros ingresos por salarios | Prestaciones internas sin clave específica |
| `029`–`036` | Vales / ayudas | Despensa, transporte, etc. (si aplican) |

**Qué implementar:**

1. **Catálogo de prestaciones por empresa** (tabla sugerida `nomina_concepto_empresa` o equivalente)
   - `empresa_id`, `clave_sat`, `nombre` (etiqueta RH), `activo`
   - Monto: fijo (`monto`) **o** fórmula simple (`pct_sueldo`, `monto_por_dia`, etc.)
   - `es_gravado` (default true; exenciones / topes LISR con contador)
   - `modo_pago`: `automatico` | `manual`
   - `regla` (JSON o campos): p. ej. bono asistencia → `max_faltas=0`, `max_incompletas=0` en el periodo

2. **Reglas automáticas (fase siguiente al catálogo)**
   - **Bono de asistencia:** leer incidencias / faltas del periodo (módulo asistencia ya existente). Si cumple la regla → agregar percepción `049` (o la clave configurada).
   - **Bono de puntualidad:** similar con retardos o % de puntualidad del reporte.
   - Otras prestaciones fijas (transporte, despensa): si `modo_pago=automatico` y sin condición → siempre en el periodo.

3. **Carga manual (fase rápida / primer entregable)**
   - En el detalle del periodo, RH puede agregar una línea de percepción (clave + concepto + importe) sin automatizar.
   - Sirve para probar timbrado y operación mientras se definen reglas.

4. **En el motor (`calculo_nomina.py`)**
   ```
   1. Percepción sueldo 001
   2. Por cada prestación activa de la empresa:
        si modo manual → omitir (ya capturada) o merge
        si automático y cumple_regla(empleado, periodo):
           calcular importe
           append { clave, concepto, importe_gravado, importe_exento }
   3. Recalcular base gravable → ISR + subsidio
   4. IMSS (base SBC; efecto de bonos en SDI → validar con contador)
   5. Otras deducciones → neto
   ```

5. **UI**
   - Configuración → Nómina: listar / editar prestaciones de la empresa.
   - Preview del recibo: mostrar cada bono como línea aparte.
   - Periodo: opción de agregar percepción manual.

**Orden sugerido de implementación:**

1. Tabla + UI de prestaciones por empresa (clave SAT, monto, activo).  
2. Inserción **manual** en periodo → preview / timbrar.  
3. Regla automática **bono asistencia** (`049`) ligada a faltas del periodo.  
4. Bono puntualidad y demás conceptos.  
5. Gravado/exento e impacto en SDI con contador.

**Checklist:**

- [ ] Tabla `nomina_concepto_empresa` (o extensión de config) + migración
- [ ] UI CRUD de prestaciones por empresa
- [ ] Agregar percepción manual en detalle de periodo
- [ ] Hook en `calculo_nomina.py` para conceptos automáticos
- [ ] Regla bono asistencia (`049`) usando incidencias del periodo
- [ ] Regla bono puntualidad (`010`) (opcional, siguiente)
- [ ] Preview + timbrado con líneas nuevas
- [ ] Validación fiscal (gravado / SDI) con contador

#### 3.2.7 Incrementos salariales (inflación anual y otros) — pendiente

**Contexto de negocio:** en esta empresa los aumentos de sueldo se hacen **de forma habitual según la inflación anual** (p. ej. aplicar el % de inflación del año al `salario_base`). También pueden existir aumentos por mérito, convenio o ajuste puntual.

**Estado actual (jul 2026):** el salario vive en `empleado_nomina.salario_base` (y opcionalmente `salario_diario_integrado`). Se puede editar a mano en la ficha de nómina del empleado, pero **no hay**:
- flujo de “aplicar incremento %”,
- historial de salarios anteriores,
- vigencia desde una fecha,
- ni lote masivo por empresa / departamento.

El cálculo de nómina siempre usa el `salario_base` vigente al momento de calcular el periodo; no versiona el sueldo por quincena histórica.

**Qué implementar:**

1. **Incremento individual**
   - En ficha de empleado (datos nómina): acción “Aplicar incremento”.
   - Entradas: `%` **o** monto nuevo; motivo (`inflacion` | `merito` | `convenio` | `otro`); `vigencia_desde`.
   - Para inflación: campo opcional de referencia (texto o % INPC del año que RH captura; **no** se requiere API externa al inicio).
   - Resultado: `salario_nuevo = salario_base × (1 + pct/100)` (o monto directo); actualizar `empleado_nomina.salario_base`.
   - Recalcular / pedir confirmación de **SDI** (`salario_diario_integrado`) — suele moverse con el sueldo; validar con contador / política IMSS.

2. **Incremento masivo por inflación (caso típico de la empresa)**
   - Pantalla RH: “Incremento anual por inflación”.
   - Filtros: empresa, departamento (opcional), solo activos.
   - Entrada: `%` de inflación a aplicar (ej. 4.2) + vigencia + referencia (ej. “Ajuste inflación 2026”).
   - Vista previa: lista empleado / salario actual / salario propuesto / diferencia.
   - Confirmar → aplica a todos los seleccionados y genera un registro de historial por empleado.
   - Excluir o marcar excepciones (quien ya tuvo aumento ese año, salarios congelados, etc.).

3. **Historial (`empleado_salario_historial`)**
   - Guardar anterior / nuevo, %, motivo, vigencia, quién aplicó.
   - Consulta en ficha del empleado: línea de tiempo de sueldos.
   - Auditoría y soporte ante reclamos (“¿cuánto ganaba antes del aumento?”).

4. **Efecto en nómina y timbrado**
   - Los periodos **ya calculados/timbrados no se reescriben** automáticamente.
   - A partir de `vigencia_desde`, el siguiente cálculo usa el nuevo `salario_base` → sueldo `001`, bases ISR/IMSS y (si aplica) prestaciones % del sueldo.
   - Si un periodo cruza la vigencia a mitad, política a definir: prorrateo o aplicar el nuevo sueldo solo desde la quincena siguiente (recomendado: **siguiente periodo** completo para simplicidad).

5. **UI sugerida**
   - Empleado → Nómina: salario actual + botón incremento + historial.
   - RH → Nómina (o Personal): “Incremento masivo (inflación)”.
   - Opcional en config empresa: `% inflación sugerido` del ejercicio (solo ayuda; no obliga).

**Orden sugerido:**

1. Historial + incremento individual (% o monto).  
2. Incremento masivo por % inflación con preview.  
3. Aviso / flujo para actualizar SDI.  
4. (Opcional) Importar % inflación desde fuente oficial o captura anual en parámetros fiscales.

**Checklist:**

- [ ] Tabla `empleado_salario_historial` + migración
- [ ] API: aplicar incremento individual (actualiza `salario_base` + historial)
- [ ] UI en ficha nómina del empleado
- [ ] API + UI incremento masivo por % (inflación) con preview y confirmación
- [ ] Política de vigencia vs periodos abiertos / ya timbrados
- [ ] Recálculo o recordatorio de SDI tras el aumento
- [ ] Permisos: solo RH / Admin

#### 3.2.8 Aguinaldo — pendiente

**Marco legal (referencia LFT):** el aguinaldo es una percepción anual; mínimo **15 días de salario** (o la parte proporcional si no se trabajó el año completo). Suele pagarse en diciembre (o antes, según política/convenio). Clave SAT de percepción: **`002`** — Gratificación Anual (Aguinaldo).

**Estado actual (jul 2026):** no hay cálculo ni periodo especial de aguinaldo. El catálogo SAT ya lista `002`.

**Cómo se manejaría:**

1. **Periodo de nómina extraordinario (tipo `E`) o etiqueta “Aguinaldo”**
   - Crear un periodo dedicado (p. ej. 1–20 dic) o marcar un periodo ordinario que incluya la línea de aguinaldo.
   - Alternativa: percepción `002` dentro de la última quincena del año + sueldo `001` en el mismo recibo (común en la práctica).

2. **Cálculo del monto**
   - `salario_diario = salario_base / dias_base_mes`
   - Año completo: `aguinaldo = salario_diario × dias_aguinaldo` (default **15**; configurable por empresa si pagan más).
   - Proporcional:  
     `aguinaldo = salario_diario × dias_aguinaldo × (días_trabajados_en_el_ejercicio / 365)`  
     (o 365/366; política a fijar con contador: altas/bajas, faltas injustificadas, etc.).
   - Fuente de días: `fecha_ingreso` / `fecha_baja` del empleado + reglas RH.

3. **Configuración**
   - En `empresa_nomina_config`: `aguinaldo_dias` (default 15), opcional fecha límite de pago / ejercicio.
   - UI: “Días de aguinaldo” + botón “Generar cálculo aguinaldo {ejercicio}” con preview por empleado.

4. **ISR / exención**
   - Parte del aguinaldo puede ser **exenta** hasta el tope LISR (en UMA; validar tabla del ejercicio con contador).
   - En `percepciones_json`: `clave: "002"`, `importe_gravado` + `importe_exento` separados.
   - El ISR del periodo se calcula sobre la base gravable (sueldo + parte gravada del aguinaldo + otras).

5. **Timbrado y recibo**
   - Misma vía FiscalAPI / CFDI tipo N; el empleado ve el recibo en **Mis recibos de nómina** (§3.4.3) tras timbrar.
   - Puede ser un recibo solo de aguinaldo o combinado con la quincena.

6. **Checklist**
   - [ ] `aguinaldo_dias` en config empresa (default 15)
   - [ ] Cálculo proporcional por antigüedad en el ejercicio
   - [ ] Separación gravado/exento (tope LISR del ejercicio)
   - [ ] Periodo o línea `002` + preview masivo
   - [ ] Timbrar + visible en Mis recibos

#### 3.2.9 Reparto de utilidades (PTU) — pendiente

**Marco legal (referencia):** la Participación de los Trabajadores en las Utilidades (PTU) se paga cuando la empresa tiene obligación según LFT / resultado fiscal. Suele repartirse en el ejercicio siguiente (plazos legales típicos: alrededor de mayo–junio para personas morales; confirmar vigencia con contador). Clave SAT: **`003`** — PTU.

**Estado actual (jul 2026):** no hay módulo PTU ni captura de utilidad repartible.

**Cómo se manejaría (enfoque práctico, no contabilidad completa):**

1. **Entrada de datos (RH / contador)**
   - Optiexpress **no sustituye** la contabilidad fiscal de la utilidad.
   - Pantalla “PTU {ejercicio}”: capturar **monto total a repartir** (o importar) y parámetros de prorrateo.
   - Opcional: adjuntar referencia / folio del cálculo externo del contador.

2. **Prorrateo entre empleados (LFT — lógica estándar a implementar con validación legal)**
   - Reglas típicas (simplificadas; validar con contador):
     - 50 % del monto se reparte en partes iguales entre trabajadores con derecho.
     - 50 % se reparte en proporción a los salarios percibidos en el año.
   - Exclusiones / topes: directores, administradores, gerentes generales según ley; días trabajados; salarios tope (p. ej. no más de X veces el salario del trabajador de planta mejor pagado — confirmar regla vigente).
   - Fuente: empleados activos en el ejercicio, días laborados (asistencia / calendario), suma de sueldos del año (desde historial de periodos o `salario_base` × días — definir fuente confiable).

3. **Periodo y percepción**
   - Periodo extraordinario “PTU {ejercicio}” o línea en un periodo de mayo/junio.
   - Percepción `clave: "003"`, concepto “PTU”, gravado/exento según LISR del ejercicio.
   - Preview: lista empleado → monto PTU → confirmar → calcular ISR del periodo → timbrar.

4. **Flujo sugerido**
   ```
   Contador define monto total PTU
        → RH captura en Optiexpress
        → Sistema prorratea (o importa montos por empleado desde Excel)
        → Preview y ajustes manuales puntuales
        → Periodo extraordinario / timbrar
        → Empleado ve recibo en Mis recibos de nómina
   ```
   - Importación Excel de montos por empleado es un buen MVP si el prorrateo legal lo hace el contador fuera del sistema.

5. **Checklist**
   - [ ] Pantalla PTU por ejercicio (monto total + parámetros)
   - [ ] MVP: importar montos por empleado (Excel) → percepción `003`
   - [ ] (Siguiente) Prorrateo automático 50/50 con exclusiones LFT
   - [ ] Gravado/exento ISR del ejercicio
   - [ ] Periodo extraordinario + timbrado + Mis recibos
   - [ ] Revisión obligatoria con contador antes de producción

### 3.3 Fase 3: Integración con FiscalAPI (timbrado)

> **Decisión (2026):** el PAC / API de timbrado es **FiscalAPI**, no Facturama. En código ya existen `fiscalapi_client.py`, `cfdi_builder.py`, `timbrado_service.py` y endpoints `…/timbrar-prueba` orientados a sandbox.

#### 3.3.1 Configuración

- Cuenta en FiscalAPI (**sandbox** primero: [test.fiscalapi.com](https://test.fiscalapi.com); producción: `live.fiscalapi.com`).
- Variables en `backend/.env` (ver también `backend/.env.example` y `docs/FISCALAPI-NOMINA-MAPEO.txt`):
  - `NOMINA_FISCALAPI_ENABLED=true`
  - `FISCALAPI_API_URL=https://test.fiscalapi.com` (o live solo con `FISCALAPI_ALLOW_LIVE=true`)
  - `FISCALAPI_API_KEY` y `FISCALAPI_TENANT` (obligatorios)
  - CSD opcional en base64 (`FISCALAPI_CSD_*`) o emisor registrado en el portal FiscalAPI
- En Optiexpress: registro patronal, CP de expedición y datos fiscales de empresa/empleado (Configuración / Personal).

#### 3.3.2 Flujo de timbrado

1. El usuario genera el periodo de nómina en Optiexpress  
2. El sistema calcula percepciones y deducciones por empleado  
3. Validación / preview (`validacion_timbrado`, `preview_service`)  
4. Por cada detalle → `build_payroll_invoice(...)` (Invoice tipo **N**)  
5. `FiscalApiClient.invoices.create(invoice)`  
6. Se guarda `cfdi_uuid`, error si aplica, y enlace/archivo XML-PDF en `detalle_nomina_empleado`  
7. Si todo OK → periodo puede pasar a estado `timbrada`  
8. El empleado consulta el recibo en **Mis recibos de nómina** (§3.4.3)

#### 3.3.3 Superficie técnica en Optiexpress (ya iniciada)

| Pieza | Rol |
|-------|-----|
| `app/modules/nomina/fiscalapi_client.py` | Credenciales, sandbox vs live, status para UI |
| `app/modules/nomina/cfdi_builder.py` | Arma Invoice nómina desde periodo + detalle |
| `app/modules/nomina/timbrado_service.py` | Timbrar empleado o periodo completo |
| `GET /nomina/fiscalapi/status` | Estado sin secretos (habilitado, modo, tiene_csd) |
| `POST …/timbrar-prueba` | Timbrado sandbox desde la UI de nómina |
| SDK | Paquete Python `fiscalapi` en `requirements.txt` |

#### 3.3.4 Costos y planes FiscalAPI

Los precios y paquetes de timbres dependen del plan contratado en FiscalAPI (sandbox de prueba vs producción). **No** se usan los listados antiguos de Facturama.

- Confirmar en el dashboard / comercial de FiscalAPI: suscripción, timbres incluidos y costo por folio adicional.  
- Sandbox: recibos **sin validez fiscal** ante el SAT (ideal para desarrollo).  
- Producción: requiere `FISCALAPI_ALLOW_LIVE=true` + CSD válido y datos fiscales correctos.

#### 3.3.5 Integración técnica (resumen)

| Aspecto | Enfoque |
|---------|---------|
| **Protocolo** | API FiscalAPI vía SDK Python (`FiscalApiClient`) |
| **Ambientes** | Sandbox `https://test.fiscalapi.com` · Live `https://live.fiscalapi.com` (bloqueado por defecto) |
| **Autenticación** | API Key + Tenant Key en `.env` (nunca en el repo) |
| **CSD** | Portal FiscalAPI y/o `FISCALAPI_CSD_CER_BASE64` + KEY + password |
| **Flujo** | Calcular → validar → `build_payroll_invoice` → `invoices.create` → guardar UUID |
| **Riesgos** | Dependencia del proveedor; cambios de API; reintentos e idempotencia por empleado; no mezclar sandbox y live |

**Resumen:** el armado del CFDI de nómina y el cliente FiscalAPI ya están encaminados; falta cerrar datos fiscales, CSD, almacenamiento PDF/XML para el portal del empleado y el paso a live con contador.

### 3.4 Fase 4: Módulo de nómina en el frontend

#### 4.1 Pantallas necesarias

| Pantalla | Quién | Descripción |
|----------|--------|-------------|
| **Nómina (RH)** `/nomina` | RH / Admin / roles autorizados | Periodos: crear, calcular, validar, timbrar; historial por ejercicio |
| **Configuración nómina** | RH / Admin | Registro patronal, CP expedición, % prima vacacional, prestaciones, etc. |
| **Datos nómina por empleado** | RH | Salario, SDI, banco, cuenta, tipo contrato; incrementos (§3.2.7) |
| **Detalle de periodo** | RH | Lista de empleados, preview, timbrar uno o todos |
| **Mis recibos de nómina** `/mis-recibos-nomina` (o bajo Mi área) | **Cada empleado** | Solo sus recibos **ya timbrados**; ver, imprimir y descargar |

#### 4.2 Permisos

- Solo RH / Administrador (y roles que se definan) pueden crear periodos, calcular y timbrar.
- El empleado **solo ve sus propios** recibos timbrados (nunca el detalle de otros ni periodos en borrador/calculada sin timbrar).
- Backend: endpoints filtrados por `empleado_id` del JWT; RH puede consultar cualquier recibo desde el módulo de nómina.

#### 4.3 Recibos para el empleado (ver / imprimir / descargar) — requisito de producto

**Objetivo:** una vez timbrado el CFDI de nómina, **cada usuario empleado** debe poder consultarlo en la aplicación, **imprimirlo** o **descargarlo** (PDF y, si aplica, XML) según lo necesite, sin pedir el archivo a RH.

**Dónde se ve en la app (propuesta alineada al menú actual):**

| Ubicación | Rol |
|-----------|-----|
| Menú empleado (junto a Mis asistencias, Mis vacaciones, Mis préstamos, Mis datos) → **“Mis recibos de nómina”** | Empleado operativo |
| Misma ruta para usuarios especiales / RH que también son empleados: ven **sus** recibos personales; el timbrado masivo sigue en `/nomina` | RH / Director como persona |
| RH → Nómina → periodo → empleado: vista/descarga del recibo (soporte, reenvío, auditoría) | RH |

Patrón UI: misma familia que `MisVacacionesPage` / `MisAsistenciasPage` / `MisPrestamosPage` bajo `frontend/src/modules/empleado/`.

**Qué se muestra (solo timbrados):**

- Lista por periodo / quincena: fechas, empresa, neto, UUID, estado (timbrado).
- Detalle: percepciones, deducciones, neto (lectura amigable).
- Acciones por recibo:
  - **Ver** en pantalla (preview HTML o PDF embebido).
  - **Imprimir** (`window.print` sobre vista limpia o abrir PDF e imprimir).
  - **Descargar PDF** (recibo / representación del CFDI).
  - **Descargar XML** (opcional pero recomendable; el empleado a menudo lo pide para su contador).
- Filtros: ejercicio, mes / número de quincena.
- Historial de periodos anteriores (no solo la última quincena).

**Cuándo aparece el recibo:**

- **No** visible al empleado mientras el periodo esté en borrador o solo calculado.
- **Sí** visible cuando `detalle_nomina_empleado` tenga `cfdi_uuid` (timbrado OK) y sin error pendiente.
- Si el timbrado falla, el empleado no ve recibo; RH corrige y retimbra.

**Datos / archivos:**

- Guardar tras timbrar: `cfdi_uuid`, URL o blob PDF, URL o blob XML (completar almacenamiento local o enlace FiscalAPI).
- Descarga autenticada (JWT en header), no URL pública sin control.
- Impresión: misma fuente que el PDF para no divergir del timbrado.

**Checklist UI empleado:**

- [ ] Ruta y ítem de menú **Mis recibos de nómina**
- [ ] API `GET` recibos del empleado autenticado (solo timbrados)
- [ ] Lista + detalle
- [ ] Descargar PDF
- [ ] Descargar XML (recomendado)
- [ ] Imprimir desde vista o PDF
- [ ] RH: acceso al mismo recibo desde detalle de periodo
- [ ] No exponer borradores ni datos de otros empleados

### 3.5 Fase 5: Integración con datos existentes

- **Asistencia → Nómina:** Faltas y retardos como descuentos; horas extra si se registran
- **Vacaciones → Nómina:** Días proporcionales de percepción
- **Préstamos → Nómina:** Deducciones automáticas del periodo
- **Incapacidades → Nómina:** CFDI de incapacidad (tipo distinto de nómina ordinaria)

---

## 4. Beneficios para la aplicación

### 4.1 Un solo sistema de verdad

| Beneficio | Descripción |
|-----------|-------------|
| **Datos centralizados** | Empleados, asistencia, vacaciones, incapacidades y nómina en una sola base de datos |
| **Sin duplicación** | No hay que mantener dos sistemas: empleados en Optiexpress y en CONTPAQ |
| **Cohorte automático** | Altas y bajas en Optiexpress se reflejan de inmediato en nómina |

### 4.2 Automatización de deducciones

- **Préstamos:** Las deducciones de préstamos ya están en Optiexpress; se aplican automáticamente al periodo
- **Faltas y retardos:** Las incidencias de asistencia se convierten en descuentos sin intervención manual
- **Vacaciones:** Los días tomados se pueden deducir del periodo correspondiente

### 4.3 Experiencia del empleado

- **Portal único:** El empleado entra a Optiexpress y ve asistencia, vacaciones, préstamos y **recibos de nómina**
- **Mis recibos de nómina:** tras el timbrado, consulta historial, **ve**, **imprime** o **descarga** PDF/XML (detalle en §3.4.3)
- **Sin depender de RH** para obtener el archivo de cada quincena (salvo soporte / reimpresión excepcional)
### 4.4 Reportes y análisis

- **Dashboard RH:** Nómina vs asistencia, incidencias por periodo, costos por departamento
- **Exportación:** Excel/CSV para contabilidad con datos ya integrados

### 4.5 Costos

- **FiscalAPI:** costo según plan (sandbox de prueba vs producción / timbres). Confirmar precios vigentes en el portal FiscalAPI; **no** aplica el listado histórico de Facturama.
- **Sin licencias adicionales** de software de nómina por puesto en Optiexpress (el costo variable principal es timbres FiscalAPI + desarrollo/mantenimiento).
- **Un solo mantenimiento** de aplicación en lugar de dos sistemas desconectados

---

## 5. Comparativa: Optiexpress + Nómina vs CONTPAQ Nóminas

### 5.1 CONTPAQ Nóminas — Qué es

CONTPAQ Nóminas es un software de escritorio (y/o en la nube según el producto) que maneja:

- Cálculo de nómina
- Timbrado SAT
- IMSS (obrero y patronal)
- INFONAVIT
- Contabilidad
- Reportes

### 5.2 Comparativa funcional

| Aspecto | CONTPAQ Nóminas | Optiexpress + Módulo Nómina |
|---------|-----------------|-----------------------------|
| **Timbrado SAT** | ✅ Incluido | ✅ Vía **FiscalAPI** |
| **Cálculo ISR/IMSS** | ✅ Completo | ✅ A implementar / en progreso |
| **Contabilidad** | ✅ Integrado CONTPAQ Contabilidad | ✅ Exportación Excel/API para cualquier contador |
| **Asistencia** | ❌ No integrado (o módulo aparte) | ✅ Ya integrado (checadas, incidencias) |
| **Vacaciones** | Días manuales o módulo aparte | ✅ Ya integrado (balance, solicitudes) |
| **Préstamos** | Módulo aparte o manual | ✅ Ya integrado (solicitudes, deducciones) |
| **Portal empleado** | Limitado o inexistente | ✅ Portal completo (mis datos, asistencia, vacaciones, préstamos y recibos) |
| **Dispositivos biométricos** | ❌ No | ✅ Integrado (checadores, portal remoto) |
| **Multi-empresa** | Depende de la licencia | ✅ Por diseño (empresas, sucursales) |
| **Costo por usuario** | Licencia por puesto | Suscripción / timbres FiscalAPI (sin licencia Contpaq por puesto) |

### 5.3 Escenarios de uso

| Escenario | Recomendación |
|-----------|---------------|
| **Solo contabilidad + nómina** | CONTPAQ puede ser suficiente si ya usa CONTPAQ Contabilidad |
| **Asistencia + nómina + vacaciones + préstamos** | Optiexpress integrado evita duplicar datos y procesos |
| **Varias empresas con checadores** | Optiexpress integrado centraliza todo |
| **Empleados quieren ver recibos en línea** | Optiexpress ofrece portal; CONTPAQ suele requerir impresión o envío manual |

### 5.4 Ventajas de integrar nómina en Optiexpress

1. **Un solo login** para RH y empleados
2. **Datos en tiempo real** entre asistencia, incidencias y nómina
3. **Deducciones automáticas** de préstamos y faltas
4. **Menos errores** por captura duplicada
5. **Escalable** a múltiples empresas sin licencias adicionales por puesto

### 5.5 Ventajas de mantener CONTPAQ Nóminas

1. **Madurez** del producto en el mercado
2. **Soporte contable** si el contador ya usa CONTPAQ
3. **Sin desarrollo** propio si no hay equipo técnico
4. **Cumplimiento** ya probado ante el SAT

---

## 6. Plan de implementación sugerido

### Fase 1: Fundamentos (4–6 semanas)

- [ ] Modelo de datos (tablas, migraciones)
- [ ] Catálogos SAT (tipos contrato, percepciones, deducciones, etc.)
- [ ] Pantalla de configuración nómina por empresa
- [ ] Pantalla de datos nómina por empleado (salario, SDI, banco, etc.)

### Fase 2: Cálculos (4–6 semanas)

- [ ] Motor de cálculo ISR (tabla mensual)
- [ ] Motor de cálculo IMSS obrero
- [ ] Cálculo de percepciones (sueldo, proporcionales)
- [ ] **Prima vacacional:** % configurable por empresa (mín. 25 LFT) + percepción SAT `021` (ver §3.2.5)
- [ ] **Prestaciones / bonos:** catálogo por empresa + percepción manual; luego bono asistencia `049` automático (ver §3.2.6)
- [ ] **Incrementos salariales:** individual + masivo por % inflación anual + historial (ver §3.2.7)
- [ ] **Aguinaldo:** días configurables (mín. 15) + proporcional + percepción `002` (ver §3.2.8)
- [ ] **PTU:** captura/importación de montos + percepción `003`; prorrateo LFT en fase siguiente (ver §3.2.9)
- [ ] Integración deducciones: préstamos, faltas

### Fase 3: Integración FiscalAPI (2–3 semanas)

- [ ] Credenciales sandbox en `.env` (`NOMINA_FISCALAPI_ENABLED`, API key, tenant)
- [ ] CSD / emisor en portal o variables `FISCALAPI_CSD_*`
- [ ] Consolidar `timbrar-prueba` → flujo de producción (con `FISCALAPI_ALLOW_LIVE` solo cuando corresponda)
- [ ] Almacenamiento de UUID, XML, PDF para Mis recibos

### Fase 4: UI y flujo completo (3–4 semanas)

- [ ] Periodos de nómina (crear, calcular, timbrar)
- [ ] Detalle de periodo por empleado
- [ ] Vista empleado: **Mis recibos de nómina** (solo timbrados; ver / imprimir / descargar PDF y XML) — ver §3.4.3
- [ ] Menú empleado + API restringida al JWT
- [ ] RH: descarga del mismo recibo desde el periodo
- [ ] Descarga de PDF (y XML) autenticada

### Fase 5: Ajustes y producción (2–3 semanas)

- [ ] Pruebas con CSD de producción
- [ ] Validación con contador
- [ ] Documentación y capacitación

**Estimación total:** 15–22 semanas (4–6 meses) con un desarrollador a tiempo completo.

---

## 7. Riesgos y dependencias

| Riesgo | Mitigación |
|--------|------------|
| Cambios en catálogos SAT | Mantener catálogos en código / actualizar desde SAT; validar con FiscalAPI |
| Errores en cálculos ISR/IMSS | Validar con contador; comparar con CONTPAQ en periodo de prueba |
| Dependencia de FiscalAPI | Monitorear API; documentar credenciales y rollback a sandbox; evaluar respaldo solo si es crítico |
| Complejidad de incapacidades | Emitir CFDI de incapacidad (tipo E) por separado; documentar bien |

---

## 8. Conclusión

Integrar un módulo de nóminas en Optiexpress es viable y aporta beneficios claros cuando el negocio ya usa asistencia, vacaciones y préstamos en la misma plataforma. El timbrado con **FiscalAPI** (cliente y builder ya iniciados en sandbox) reduce la complejidad frente a un PAC genérico casero y permite enfocarse en el modelo de datos, cálculos (prima, aguinaldo, PTU, prestaciones) y el portal **Mis recibos de nómina**.

La decisión entre desarrollar este módulo o seguir con CONTPAQ Nóminas depende de:

- Si ya se usa CONTPAQ Contabilidad y el contador lo requiere
- Si la prioridad es reducir la duplicación de datos y procesos
- Si el presupuesto permite 4–6 meses de desarrollo
- Si se dispone de recurso técnico para mantener el módulo

Este documento sirve como base para la evaluación y el plan de implementación.

---

## Anexo A: Referencias

- [FiscalAPI — Sandbox / pruebas](https://test.fiscalapi.com)
- [FiscalAPI — Producción](https://live.fiscalapi.com)
- Mapeo interno Optiexpress: `docs/FISCALAPI-NOMINA-MAPEO.txt`
- Código: `backend/app/modules/nomina/fiscalapi_client.py`, `cfdi_builder.py`, `timbrado_service.py`
- [Complemento Nómina 1.2 (SAT)](https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461174659996&ssbinary=true)
- [Tablas ISR / subsidio](https://www.sat.gob.mx/consulta/44953/calculo-del-subsidio-para-el-empleo-efectivamente-a-pagar-a-los-trabajadores)
- [CFDI 4.0](https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461174659996&ssbinary=true)
