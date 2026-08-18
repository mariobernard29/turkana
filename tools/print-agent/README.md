# Agente de impresión

Este programa vive en la **PC del mostrador** y es el que hace que el ticket
salga en cuanto se toca "imprimir", sin el diálogo del navegador.

## Por qué hace falta

El sistema está en la nube y la impresora está en la tienda. Desde la nube no
hay forma de hablarle a una dirección de la red local, y desde el navegador
tampoco: no existen conexiones crudas a una impresora, y en el iPad Safari
bloquea cualquier llamada de una página segura a un `http://192.168.x.x`.

La salida es invertir el sentido. La venta deja el ticket en una cola dentro de
la base de datos; este agente —que sí está adentro de la tienda— la vigila, toma
el ticket y lo manda al puerto 9100 de la impresora.

El agente **no sabe nada del diseño del ticket**: recibe los bytes ya armados por
la app. Cuando se cambia un ticket, se cambia en la web y ya; no hay que venir a
actualizar esta PC.

Como las dos cajas dejan sus tickets en la misma cola, **el iPad imprime en la
impresora del mostrador** sin necesitar nada instalado.

## Instalación (una vez)

1. **Node.js** en la PC: https://nodejs.org (versión 20 o más nueva).

2. **IP fija para la impresora.** En el menú de red de la POS895, o —más fácil—
   una reserva de DHCP en el router para su dirección MAC. Con IP suelta, el día
   que el router se la cambie el agente deja de imprimir.

3. **Comprobar que responde**, desde PowerShell en esta PC:

   ```powershell
   Test-NetConnection 192.168.1.100 -Port 9100
   ```

   Tiene que decir `TcpTestSucceeded : True`.

4. **Usuario para la impresora.** En Admin → Ajustes → Usuarios, crea uno con
   rol de cajero, por ejemplo `impresora@turkanajewerly.com`. No uses la cuenta
   de una persona: si esa persona se va y se le da de baja, se apaga la impresión.

5. **Dar de alta la impresora** en Admin → Ajustes → Impresoras con su IP. Ahí
   mismo aparece el identificador que va en `PRINTER_ID`.

6. **Configurar el agente**: copia `.env.example` a `.env` y llena los valores.

7. **Probar** que imprime:

   ```powershell
   npm install
   npm run prueba
   ```

   Debe salir una página que dice "Prueba de impresion".

8. **Dejarlo corriendo solo:**

   ```powershell
   .\instalar.ps1
   ```

   Queda registrado como tarea de Windows: arranca al iniciar sesión y se vuelve
   a levantar si se cae.

## Cómo saber si está funcionando

En el encabezado del POS hay una pastilla con un ícono de impresora:

| Lo que se ve | Qué significa |
|---|---|
| Verde | Todo bien; los tickets salen directo. |
| Verde con un número | Hay tickets en cola, saliendo en este momento. |
| Ámbar "Sin impresora" | El agente o la impresora no contestan. Los tickets **no se pierden**: salen por el diálogo del navegador de siempre. |
| Rojo con un número | Tickets que no se pudieron imprimir. Casi siempre es papel o la impresora apagada. |

Cuando el agente no contesta, el POS **no encola**: manda el ticket al diálogo
del navegador en el momento. Así el cajero entrega el ticket igual y no aparece
un papel sorpresa horas después.

## Cuando algo falla

**No sale nada y la pastilla está ámbar.**
Revisa que la PC esté encendida y que la tarea corra:

```powershell
Get-ScheduledTask -TaskName "Turkana - Agente de impresion"
```

Para ver qué está diciendo, deténla y córrelo a mano en esta carpeta con
`npm start`: los mensajes salen en pantalla.

**La pastilla está roja.** Papel, tapa abierta o impresora apagada. Se arregla y
los tickets nuevos salen solos; los que quedaron en error se vuelven a mandar
desde Admin → Ajustes → Impresoras.

**Cambió la IP de la impresora.** Corrígela en Admin → Ajustes → Impresoras y en
`PRINTER_HOST` del `.env`, y reinicia la tarea.

**Se ve `realtime: CHANNEL_ERROR` en la pantalla.** El agente perdió el aviso
inmediato, pero de todos modos revisa la cola cada 5 segundos: sigue imprimiendo,
sólo con unos segundos de retraso.

## Detalles para quien mantenga esto

- Los bytes van **crudos por TCP al puerto 9100**. El driver de Windows no
  interviene: lo que se manda ya son comandos ESC/POS.
- Se escribe en trozos de 2 KB porque el mapa de bits del logo desborda el búfer
  de algunas térmicas.
- El latido cada 30 s dice dos cosas a la vez: que el agente vive y que la
  impresora contesta. Por eso primero abre y cierra una conexión de prueba.
- El reclamo de cada ticket es un `update ... where status = 'pending'`: si
  hubiera dos agentes, ninguno imprime el mismo ticket dos veces.
- Se reintenta 3 veces antes de marcar el ticket como error.
- Los tickets impresos se borran de la cola a los 7 días.
