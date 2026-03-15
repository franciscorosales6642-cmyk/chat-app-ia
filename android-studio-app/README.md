# Android Studio App

Proyecto nativo para Android Studio que carga tu aplicacion web publica dentro de un `WebView` con soporte para:

- Inicio de sesion y uso normal de la web
- Compartir imagen o archivo desde Android
- Compartir ubicacion
- Abrir enlaces externos
- Recargar la pagina con gesto

## Antes de usarlo

Primero debes tener tu web publicada con una URL real, por ejemplo:

```text
https://tu-app.onrender.com
```

Luego cambia esa URL en [app/build.gradle.kts](/Users/franc/Downloads/chat-app-ai-completo/chat-zip-project/android-studio-app/app/build.gradle.kts):

```kotlin
buildConfigField("String", "APP_URL", "\"https://tu-app.onrender.com\"")
```

## Como abrirlo

1. Abre Android Studio.
2. Elige `Open`.
3. Selecciona la carpeta `android-studio-app`.
4. Deja que Android Studio sincronice Gradle.

## Archivo principal

La logica de la app esta en [MainActivity.kt](/Users/franc/Downloads/chat-app-ai-completo/chat-zip-project/android-studio-app/app/src/main/java/com/chatapp/android/MainActivity.kt).

## Nota

En este entorno no tenia Gradle instalado globalmente, asi que no pude generar `gradlew` ni compilar el APK aqui mismo. La estructura del proyecto ya quedo lista para que Android Studio la sincronice y complete el wrapper en tu maquina.
