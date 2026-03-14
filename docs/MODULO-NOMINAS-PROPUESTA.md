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

- Cuenta Facturama (API Web o Multiemisor)
- Cargar CSD del patrón en Facturama
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

- **Facturama:** ~$1,650 MXN/año (API Web) o ~$3,300 MXN/año (Multiemisor)
- **Sin licencias adicionales** de software de nómina por puesto
- **Un solo mantenimiento** en lugar de dos sistemas

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

- [Facturama API Nómina](https://apisandbox.facturama.mx/guias/nominas/sueldo)
- [Complemento Nómina 1.2 (SAT)](https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461174659996&ssbinary=true)
- [Tablas ISR mensual](https://www.sat.gob.mx/consulta/44953/calculo-del-subsidio-para-el-empleo-efectivamente-a-pagar-a-los-trabajadores)
- [CFDI 4.0](https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461174659996&ssbinary=true)
