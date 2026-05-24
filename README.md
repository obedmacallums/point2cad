# point2cad

Point2CAD es una herramienta de automatización que convierte listas de coordenadas de un archivo CSV directamente en dibujos inteligentes para software de CAD. La aplicación lee los códigos de campo de cada punto (como ARBOL, POSTE o CERCA) y, a través de una biblioteca de características personalizada, genera de forma automática las figuras geométricas correspondientes, asigna capas y colores, y coloca las etiquetas de texto con sus nombres en la posición exacta. En resumen, transforma datos tabulares abstractos en planos listos para usar en cuestión de segundos, eliminando por completo el dibujo manual.

## stack

- Python para procesamiento de datos, pero usado desde Pyodide en el navegador.
- React para la interfaz de usuario, con la libreria de react-py para ejecutar el código Python en el navegador.
- la interaccion de react con el codigo python se hace a traves de un sistema de eventos, donde el usuario puede cargar un archivo csv, y luego el codigo python procesa ese archivo y devuelve los datos necesarios para generar los dibujos en el navegador.
- React Three Fiber (R3F) + Three.js para renderizar los dibujos en 3D en el navegador.

## Los formatos de entrada y salida

- El formato de entrada es un archivo CSV con las siguientes columnas: `nombre`, `x`, `y`, `z`, `codigo`. Cada fila representa un punto con su nombre, coordenadas (x, y, z) y el tipo de objeto que representa (por ejemplo, ARBOL, POSTE, CERCA).
- Solo se buscan representar puntos, lineas y lineas cerradas.
- El formato de salida es un DXF que contiene las figuras geométricas correspondientes a cada punto, con sus respectivas capas, colores y etiquetas de texto. El dxf se genera a partir de los datos procesados en el navegador, y se puede descargar directamente desde la aplicación, manteniendo el sistema de coordenadas del csv original.
  