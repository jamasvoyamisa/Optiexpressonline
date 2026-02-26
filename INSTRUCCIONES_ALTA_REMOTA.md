# Enviar usuario al dispositivo desde la web

## Requisitos

- Dispositivo ZKTeco MB160 (o compatible ADMS)
- Backend accesible desde la red del dispositivo

## Pasos

### 1. Registrar el dispositivo en la web

1. **Asistencia** → **Registrar Dispositivo**
2. **Nombre**: ej. "Oficina Principal"
3. **Número de Serie (SN)**: obligatorio. Ver en el dispositivo: **Info → Serial Number**
4. Guardar

### 2. Configurar ADMS en el dispositivo

1. En el MB160: **COMM → Cloud Server Setting**
2. **Server Mode**: ADMS
3. **Server Address**: IP (ej: `192.168.2.55`), **Server Port**: `9081`
4. Guardar

### 3. Enviar usuario desde la web

1. **Asistencia** → sección **Enviar usuario al dispositivo**
2. Selecciona el **Dispositivo**
3. **Número empleado** y **Nombre**
4. **Agregar a cola**
5. Espera 30–60 segundos: el dispositivo hace getrequest y recibe el usuario

### 4. Verificar

- El usuario pasa de "En cola" a "✓ Enviado al dispositivo"
- En el dispositivo: menú de usuarios, el nuevo usuario debe aparecer

## Si no llega

1. **Ver qué recibirá el dispositivo**: usa el botón para ver la vista previa
2. **SN correcto**: el SN en la web debe coincidir exactamente con el del dispositivo
3. **Red**: el dispositivo debe poder alcanzar `http://IP_SERVIDOR:9081/iclock/getrequest`
4. **Probar manualmente**: abre en el navegador `http://IP_SERVIDOR:9081/iclock/getrequest?SN=TU_SN` y comprueba que devuelve USERINFO + OK
