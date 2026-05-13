# Módulo de Nóminas — Propuesta Técnica y Comparativa

**Proyecto:** Optiexpress  
**Fecha:** Marzo 2026  
**Objetivo:** Documentar la implementación de un módulo de nóminas con timbrado SAT y su comparativa con CONTPAQ Nóminas.

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
- Integración con PAC para timbrado (Facturama u otro)

### 2.3 Inventario de requisitos en México (normativa y operación)

Esta lista orienta el diseño funcional del módulo; no todo debe implementarse en el primer sprint. Prioridad habitual: **ISR + IMSS + percepciones base + deducciones legales**, luego **INFONAVIT / FONACOT**, luego **CFDI / timbrado**, luego **SUA / IDSE** y conciliaciones.

#### Comprobante fiscal (SAT)

- **CFDI 4.0 tipo N (Nómina)** + **Complemento de Nómina** (versión y revisión vigentes; el SAT publica revisiones del complemento; en fechas recientes existen validaciones más estrictas de importes gravado/exento).
- Catálogos oficiales (actualizarlos periódicamente desde el SAT): tipo de nómina (ordinaria/extraordinaria), periodicidad de pago, régimen de contratación, **tipos de percepción y deducción**, otros pagos, bancos, etc.
- **Timbrado** ante un **PAC** (Facturama u otro) o flujo propio con **CSD**; almacenamiento de XML/PDF, UUID y estatus.
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
├── facturama_user (o PAC elegido)
├── facturama_password_encrypted
└── sucursal_expedicion_id (opcional)

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
- Bonos, premios
- Vacaciones (proporcional)
- Aguinaldo (proporcional)
- Prima vacacional

### 3.3 Fase 3: Integración con Facturama (PAC)

#### 3.3.1 Configuración

- Cuenta Facturama (misma anualidad habilita **API Web** y **API Multiemisor**; elegir según 1 RFC vs. varias razones sociales — ver **3.3.4**)
- Cargar **CSD** del patrón en Facturama
- Configurar sucursal con código postal

#### 3.3.2 Flujo de timbrado

1. El usuario genera el periodo de nómina en Optiexpress
2. El sistema calcula percepciones y deducciones por empleado
3. Por cada empleado se construye el JSON del CFDI de nómina
4. Se envía POST a Facturama API
5. Facturama timbra y devuelve UUID, XML, PDF
6. Se guarda el UUID y URLs en `detalle_nomina_empleado`

#### 3.3.3 Endpoints Facturama utilizados

- `POST /api-lite/3/cfdis` — Crear CFDI de nómina
- `GET /api-lite/3/cfdis/{id}` — Consultar estado
- Descarga de XML y PDF

#### 3.3.4 Facturama: costos anuales y folios (PAC oficial)

Información tomada de la página de costos de Facturama ([api.facturama.mx/costos](https://api.facturama.mx/costos)) y de la landing de nómina API ([facturama.mx/api/nomina](https://facturama.mx/api/nomina)). Los precios pueden cambiar; conviene confirmar en el sitio antes de contratar.

| Concepto | Detalle |
|----------|---------|
| **Módulo API (anualidad)** | **$1,650 MXN** IVA incluido, vigencia de **un año**. |
| **Incluye en la anualidad** | **100 folios** para timbrar vía API. |
| **Modalidades** | **API Web** (1 RFC): timbrado, consulta, cancelación, gestión en plataforma web; todo lo generado por API se refleja en facturama.mx. **API Multiemisor** (varios RFC): servicio de timbrado; gestión de sellos digitales de múltiples RFC; **no** se refleja en la plataforma web. |
| **Nota importante** | Con **una sola suscripción anual** se tiene acceso a **ambas** modalidades (Web y Multiemisor); no son dos pagos distintos de $1,650. |

**Folios adicionales (prepago, IVA incluido)** — típico cuando se superan los 100 folios/año:

| Volumen anual de folios | Precio por folio |
|-------------------------|------------------|
| 1 a 10,000 | $0.50 MXN |
| 10,001 a 50,000 | $0.45 MXN |
| Más de 50,000 | $0.40 MXN |

**Estimación de costo variable anual (solo PAC):**  
`(Número de recibos de nómina timbrados al año − 100 folios incluidos) × precio por folio según tramo`, más **$1,650** de anualidad.  
Ejemplo: 50 empleados × 24 quincenas = **1,200 timbres/año** → 1,100 folios de pago × ~$0.50 ≈ **$550** + **$1,650** anualidad ≈ **$2,200 MXN/año** (orden de magnitud; redondeos y promociones pueden variar).

**Qué cubre la API respecto a nómina (según Facturama):** emisión de CFDI 4.0 y **recibos de nómina** (subsidio, horas extra, incapacidad, indemnización, jubilación, entre otros escenarios documentados), además de otros tipos de comprobantes si se contrata el mismo módulo para facturación global.

#### 3.3.5 Integración técnica con Optiexpress

| Aspecto | Enfoque sugerido |
|---------|-------------------|
| **Protocolo** | **REST** (HTTPS); arquitectura orientada a recursos; JSON para el cuerpo del CFDI. |
| **Ambientes** | **Sandbox** para desarrollo y pruebas ([apisandbox.facturama.mx](https://apisandbox.facturama.mx/)) — documentación y ejemplos; **producción** tras contratar módulo API y folios. |
| **Autenticación** | Credenciales de usuario API (usuario/contraseña) según documentación Facturama; almacenar de forma segura (variables de entorno, cifrado en BD, nunca en el código fuente). |
| **Sellos digitales (CSD)** | Carga del **Certificado de Sello Digital** del emisor en el panel Facturama o flujo API según modalidad; sin CSD válido no hay timbrado válido ante el SAT. |
| **Flujo en Optiexpress** | Backend FastAPI: cliente HTTP (p. ej. `httpx`) que, tras calcular percepciones/deducciones en el propio sistema, arma el **JSON del CFDI de nómina** conforme al esquema Facturama/SAT y llama al endpoint de creación/timbrado; guardar UUID, XML y PDF en `detalle_nomina_empleado` o equivalente. |
| **SDKs** | Facturama publica ejemplos y librerías para **PHP, .NET, JavaScript, Java, Ruby**; para Python suele usarse integración REST directa (no siempre hay SDK oficial). |
| **Guía de nómina** | Guías en sandbox, p. ej. [apisandbox.facturama.mx/guias/nominas/sueldo](https://apisandbox.facturama.mx/guias/nominas/sueldo) (validar URL vigente en la documentación actual). |
| **Riesgos** | Dependencia del PAC; caídas o cambios de API; conviene capa de reintentos idempotentes y registro de errores de timbrado por empleado. |

**Resumen:** la integración no es “instalar un plugin”, sino **desarrollar** el armado del JSON de nómina (alineado a catálogos SAT), **probar en sandbox**, y en producción **descontar folios** por cada timbrado exitoso según el contrato con Facturama.

### 3.4 Fase 4: Módulo de nómina en el frontend

#### 4.1 Pantallas necesarias

| Pantalla | Descripción |
|----------|-------------|
| **Configuración nómina** | Registro patronal, régimen, sucursal, credenciales PAC |
| **Datos nómina por empleado** | Salario, SDI, banco, cuenta, tipo contrato |
| **Periodos de nómina** | Lista de periodos, crear nuevo, calcular, timbrar |
| **Detalle de periodo** | Lista de empleados con percepciones/deducciones, botón timbrar |
| **Recibo de nómina** | Vista/descarga PDF para el empleado |

#### 4.2 Permisos

- Solo RH / Administrador / Gerente General pueden crear y timbrar periodos
- Emple puede ver sus propios recibos en "Mis datos" o "Mis nóminas"

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

- **Portal único:** El empleado entra a Optiexpress y ve asistencia, vacaciones, préstamos y recibos de nómina
- **Recibos en línea:** Descarga de PDF desde "Mis datos" o "Mis nóminas"
- **Historial:** Consulta de recibos de periodos anteriores

### 4.4 Reportes y análisis

- **Dashboard RH:** Nómina vs asistencia, incidencias por periodo, costos por departamento
- **Exportación:** Excel/CSV para contabilidad con datos ya integrados

### 4.5 Costos

- **Facturama (PAC):** anualidad **$1,650 MXN** IVA incluido, con **100 folios** incluidos; acceso a **API Web y API Multiemisor** con la misma suscripción (ver sección **3.3.4**). Folios extra según volumen ($0.40–$0.50 por folio).
- **Sin licencias adicionales** de software de nómina por puesto en Optiexpress (el costo variable principal es folios + desarrollo/mantenimiento).
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
| **Timbrado SAT** | ✅ Incluido | ✅ Vía Facturama/PAC |
| **Cálculo ISR/IMSS** | ✅ Completo | ✅ A implementar |
| **Contabilidad** | ✅ Integrado CONTPAQ Contabilidad | ✅ Exportación Excel/API para cualquier contador |
| **Asistencia** | ❌ No integrado (o módulo aparte) | ✅ Ya integrado (checadas, incidencias) |
| **Vacaciones** | Días manuales o módulo aparte | ✅ Ya integrado (balance, solicitudes) |
| **Préstamos** | Módulo aparte o manual | ✅ Ya integrado (solicitudes, deducciones) |
| **Portal empleado** | Limitado o inexistente | ✅ Portal completo (mis datos, asistencia, vacaciones, préstamos y recibos) |
| **Dispositivos biométricos** | ❌ No | ✅ Integrado (checadores, portal remoto) |
| **Multi-empresa** | Depende de la licencia | ✅ Por diseño (empresas, sucursales) |
| **Costo por usuario** | Licencia por puesto | Suscripción fija (Facturama) |

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
- [ ] Integración deducciones: préstamos, faltas

### Fase 3: Integración PAC (2–3 semanas)

- [ ] Cuenta Facturama (sandbox primero)
- [ ] Servicio de timbrado (armar JSON, llamar API)
- [ ] Almacenamiento de UUID, XML, PDF

### Fase 4: UI y flujo completo (3–4 semanas)

- [ ] Periodos de nómina (crear, calcular, timbrar)
- [ ] Detalle de periodo por empleado
- [ ] Vista empleado: "Mis recibos de nómina"
- [ ] Descarga de PDF

### Fase 5: Ajustes y producción (2–3 semanas)

- [ ] Pruebas con CSD de producción
- [ ] Validación con contador
- [ ] Documentación y capacitación

**Estimación total:** 15–22 semanas (4–6 meses) con un desarrollador a tiempo completo.

---

## 7. Riesgos y dependencias

| Riesgo | Mitigación |
|--------|------------|
| Cambios en catálogos SAT | Usar catálogos desde Facturama o API; actualizar periódicamente |
| Errores en cálculos ISR/IMSS | Validar con contador; comparar con CONTPAQ en periodo de prueba |
| Dependencia de Facturama | Evaluar PAC alternativo (SW Sapien, etc.) como respaldo |
| Complejidad de incapacidades | Emitir CFDI de incapacidad (tipo E) por separado; documentar bien |

---

## 8. Conclusión

Integrar un módulo de nóminas en Optiexpress es viable y aporta beneficios claros cuando el negocio ya usa asistencia, vacaciones y préstamos en la misma plataforma. La integración con Facturama reduce la complejidad del timbrado y permite enfocarse en el modelo de datos y los cálculos.

La decisión entre desarrollar este módulo o seguir con CONTPAQ Nóminas depende de:

- Si ya se usa CONTPAQ Contabilidad y el contador lo requiere
- Si la prioridad es reducir la duplicación de datos y procesos
- Si el presupuesto permite 4–6 meses de desarrollo
- Si se dispone de recurso técnico para mantener el módulo

Este documento sirve como base para la evaluación y el plan de implementación.

---

## Anexo A: Referencias

- [Facturama — Costos API y folios](https://api.facturama.mx/costos)
- [Facturama — Documentación API REST](https://api.facturama.mx/Docs)
- [Facturama — Sandbox (pruebas)](https://apisandbox.facturama.mx/)
- [Facturama — Recibos de nómina (API)](https://facturama.mx/api/nomina)
- [Facturama API Nómina (guía sueldo, sandbox)](https://apisandbox.facturama.mx/guias/nominas/sueldo)
- [Complemento Nómina 1.2 (SAT)](https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461174659996&ssbinary=true)
- [Tablas ISR mensual](https://www.sat.gob.mx/consulta/44953/calculo-del-subsidio-para-el-empleo-efectivamente-a-pagar-a-los-trabajadores)
- [CFDI 4.0](https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461174659996&ssbinary=true)
