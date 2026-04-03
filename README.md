# ChatMovil - Android Studio

Proyecto base en Kotlin + Jetpack Compose que replica los flujos principales de la web mostrada:

- Inicio de sesión
- Crear cuenta
- Recuperación de contraseña
- Lista de chats
- Conversación con distintos usuarios
- Chat Boot simulado
- Configuración de perfil (nombre, estado, imagen)
- Envío de texto, ubicación e imagen por URL

## Tecnologías
- Kotlin
- Jetpack Compose
- Navigation Compose
- ViewModel
- Coil para imágenes

## Usuario de prueba
- Correo: `franciscorosales6642@gmail.com`
- Contraseña: `12345678`

## Estructura
- `MainActivity.kt`: navegación principal
- `data/FakeRepository.kt`: datos simulados y lógica base
- `viewmodel/AppViewModel.kt`: estado y acciones de UI
- `ui/screens/`: pantallas de autenticación, inicio, chat y configuración

## Importante
Este proyecto viene listo como **frontend funcional con datos simulados**. Para usarlo en producción conviene conectar:

- Firebase Authentication o tu API propia para login/registro/recuperación
- Firestore, Supabase o backend REST/WebSocket para chats en tiempo real
- Subida real de imágenes a Storage
- Geolocalización real con permisos y Maps Intent
- API real para el chatbot

## Cómo abrir
1. Abre Android Studio.
2. Selecciona `Open`.
3. Elige la carpeta `android_chat_app`.
4. Sincroniza Gradle.
5. Ejecuta en un emulador o dispositivo.


## Nueva mejora agregada
- Inicio de sesión tradicional con correo y contraseña.
- Inicio de sesión biométrico con huella, rostro o credencial del dispositivo usando BiometricPrompt.
- La pantalla de acceso muestra ambas opciones de autenticación.
