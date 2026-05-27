# Guía Arquitectónica del Backend

Esta guía describe la estructura genérica y reutilizable del backend. Sigue un **patrón modular basado en características (Feature-Driven Architecture)**, ideal para construir APIs RESTful escalables y mantenibles en entornos como Node.js con Express.

---

## 1. Arquitectura General del Servidor

El proyecto está estructurado para separar la configuración global de la lógica específica de cada dominio. Las responsabilidades se dividen en los siguientes directorios principales:

*   **`configs/`**: Contiene la configuración de inicialización de las piezas centrales del servidor (base de datos, seguridad, documentación, instancia de la aplicación). Aísla la configuración técnica de la lógica de negocio.
*   **`middlewares/`**: Funciones de interceptación de solicitudes. Aquí residen las capas protectoras y transformadoras (validadores de esquemas, autenticación, autorización, manejo de archivos, parseo de datos) que pueden aplicarse a múltiples rutas.
*   **`helpers/` / `utils/`**: Funciones auxiliares, lógica compartida, utilidades genéricas o tareas programadas (cron jobs) que no pertenecen a una entidad específica pero son utilizadas por toda la aplicación.
*   **`seeds/`**: Archivos de datos iniciales o scripts para poblar la base de datos en entornos de desarrollo o pruebas.
*   **`src/`**: El corazón de la aplicación. En lugar de organizar los archivos por su tipo técnico (todos los modelos juntos, todos los controladores juntos), **se organizan por módulo o dominio de negocio**. Cada carpeta dentro de `src/` representa una entidad independiente y contiene todo lo necesario para que ese recurso funcione de manera autónoma.

---

## 2. Flujo de una Petición HTTP

Cuando un cliente realiza una solicitud al servidor, esta sigue un flujo unidireccional y estricto a través de varias capas:

1.  **Entrada y Configuración Global (`index.js` / `configs/app.js`)**: La petición entra al servidor, donde pasa por los middlewares globales (CORS, parseo de JSON/URL-encoded, cabeceras de seguridad como Helmet).
2.  **Enrutador del Módulo (`*.routes.js`)**: La petición coincide con un prefijo de URL de un módulo específico y es delegada a su archivo de rutas.
3.  **Middlewares Específicos (`middlewares/`)**: Antes de llegar a la lógica principal, la petición es interceptada por middlewares inyectados en la ruta para validar permisos (ej. validación de tokens JWT) o integridad de datos (ej. esquemas del cuerpo de la petición). Si falla, se devuelve un error inmediato; si pasa, continúa.
4.  **Controlador (`*.controller.js`)**: Recibe la petición limpia y validada. Extrae los parámetros (body, params, query), orquesta la llamada a la capa de negocio y construye la respuesta HTTP (códigos de estado y formato JSON).
5.  **Servicio (`*.service.js` - Opcional/Recomendado)**: Contiene la lógica de negocio pura y pesada. Ejecuta cálculos, se comunica con APIs de terceros o coordina múltiples llamadas a la base de datos.
6.  **Modelo / Capa de Datos (`*.model.js`)**: Interactúa directamente con la base de datos (CRUD) aplicando los esquemas y restricciones definidas.
7.  **Respuesta HTTP**: El resultado burbujea de vuelta al controlador, el cual envía la respuesta final al cliente.

---

## 3. Patrones de Diseño del Backend

*   **Arquitectura Modular (Feature Modules)**: Fomenta el principio de alta cohesión y bajo acoplamiento. Si un módulo debe ser extraído (por ejemplo, para convertirlo en un microservicio independiente), es fácil de aislar porque tiene sus propias rutas, modelos y controladores juntos.
*   **Separación de Responsabilidades (SoC)**: El enrutador solo enruta, el controlador solo maneja HTTP, el servicio solo maneja reglas de negocio y el modelo solo define datos. Ninguna capa debe asumir el trabajo de otra.
*   **Patrón Interceptor / Chain of Responsibility (Middlewares)**: Se utiliza extensivamente para extraer la lógica repetitiva (autenticación, subida de archivos, validación de roles) fuera de los controladores, manteniendo el código del controlador limpio (DRY - *Don't Repeat Yourself*).
*   **Configuraciones Singleton**: Los archivos dentro de `configs/` aseguran que solo exista una instancia de la conexión a la base de datos o de la configuración del servidor en toda la aplicación.

---

## 4. Convenciones de Archivos por Módulo

Dentro de cada carpeta en `src/`, se sigue una nomenclatura estricta donde el sufijo indica el rol del archivo:

*   **`*.routes.js`**: 
    *   **Debe:** Definir los verbos HTTP (GET, POST, PUT, DELETE), inyectar los middlewares necesarios y apuntar a un método del controlador.
    *   **No debe:** Contener lógica de negocio ni manipular directamente bases de datos.
*   **`*.controller.js`**: 
    *   **Debe:** Manejar los objetos `req` (petición) y `res` (respuesta) de Express. Extraer datos, invocar al modelo/servicio, manejar el bloque `try/catch` para errores, y retornar las respuestas HTTP formateadas (ej. `res.status(200).json(...)`).
    *   **No debe:** Contener reglas complejas de negocio que no tengan que ver con el transporte HTTP.
*   **`*.service.js`** *(Utilizado para lógicas complejas)*: 
    *   **Debe:** Recibir parámetros simples, ejecutar reglas de negocio de la aplicación y devolver resultados o lanzar errores genéricos.
    *   **No debe:** Conocer de la existencia de `req` o `res`, ni de códigos de estado HTTP. Esto hace que la lógica sea reutilizable (por ejemplo, invocable desde un script de consola o un web socket).
*   **`*.model.js`**: 
    *   **Debe:** Definir la estructura de datos (esquemas), tipos, validaciones a nivel de base de datos, relaciones e índices.
    *   **No debe:** Enviar respuestas HTTP ni procesar lógicas de negocio externas a los propios datos.

---

## 5. Decisiones de Configuración Repetibles (Boilerplate)

La forma en que arranca el servidor está diseñada para ser escalable y fácilmente replicable en otros proyectos:

*   **Separación Server vs App**: 
    *   `configs/app.js` se encarga de instanciar y configurar el framework (ej. inyectar middlewares globales y montar las rutas base).
    *   `index.js` (en la raíz) importa esa aplicación configurada y es el único responsable de iniciar el puerto de escucha y la conexión a la base de datos. Esto es clave para poder hacer pruebas unitarias (testing) de la aplicación sin abrir el puerto de red real.
*   **Seguridad Modularizada**: En lugar de saturar el archivo principal, se delega la configuración de cabeceras HTTP de seguridad (`helmet-configuration.js`) y políticas de intercambio de recursos (`cors-configuration.js`) en archivos aislados, lo que permite ajustarlos o desactivarlos limpiamente por entorno.
*   **Gestor de Base de Datos Aislado**: `configs/db.js` exporta una función de conexión genérica manejando los reintentos o el registro de logs, desacoplando el resto del proyecto de la librería específica de base de datos. 
*   **Documentación Viva**: Centralizada en `configs/swagger.js`, permitiendo autogenerar y servir una UI visual de los endpoints disponibles basada en el código.
