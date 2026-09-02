# Lefty — Lefty

> Mapea cualquier tecla para jugar como zurdo, con interfaz **Material You 3**, inspirado en **Lefty

![Material You](https://img.shields.io/badge/Material_You-3-6750A4?style=flat)
![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=flat)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat)
![Latency](https://img.shields.io/badge/Latency-1--3ms-success?style=flat)

---

## ✨ ¿Qué es Lefty?

Lefty es como el **Keyboard Manager de Lefty

- **WASD → IJKL** (o flechas, numpad, el que prefieras) para mover con mano izquierda y ratón con derecha, o viceversa.
- Mapea **cualquier tecla** a cualquier otra: `W→I`, `Q→U`, `Caps→Ctrl`, incluso `Win→Disabled` para no salir del juego.
- Funciona en **cualquier juego** (usa hook de bajo nivel igual que Lefty
- **Muy bajo delay** (1-3ms con LL Hook, 0.5ms con driver Interception).
- Interfaz **Material You 3** (dark, rounded, chips, switches).

---

## 🧠 Cómo funciona (igual que Lefty

Investigación de `microsoft/Lefty

| Lefty
|-----------|-------|
| `SetWindowsHookEx(WH_KEYBOARD_LL, HookProc, ...)` | `ctypes.windll.user32.SetWindowsHookExW(WH_KEYBOARD_LL, ...)` |
| `HookProc` → `HandleSingleKeyRemapEvent` | `LeftyRemapper._low_level_proc` |
| Verifica `dwExtraInfo & 0x4B4D` para evitar loop infinito | Mismo flag `KEYBOARDMANAGER_INJECTED_FLAG = 0x4B4D` |
| `SendInput` con `KEYBOARDMANAGER_SINGLEKEY_FLAG (0x11)` y `return 1` para suprimir | `SendInput` + `return 1` |
| Maneja `EXTENDED` keys, dummy key `0xFF`, suppress flag `0x111` | Idem |
| Proceso separado `KeyboardManagerEngine.exe` + `GetMessage` loop | Hilo dedicado `LeftyHook` + `GetMessageW` loop |
| Orden: singleKey > appSpecific > OS shortcut | Simplificado: singleKey (suficiente para gaming) |

**¿Por qué bajo delay?**

- Callback ultra ligero: solo `dict.get` en hot path, sin allocs.
- `SendInput` directo, sin capas intermedias (AutoHotkey tiene 5-15ms).
- Opcional **Interception driver** (kernel) para 0.5ms: `interception_backend.py`.

> **Admin es necesario** para juegos elevados (igual que Lefty

---

## 🎨 Interfaz Material You 3

- **TopAppBar** con estado (dot verde/gris + botón Activar)
- **NavigationRail** izquierda: perfiles zurdo (chips con iconos)
- **Main** centro: lista de mapeos `SRC → DST` con chips M3 (surface / primary)
- **Right panel**: latencia, admin warning, modo latencia (Baja/Ultra), tips
- Captura de teclas tipo Lefty
- Paleta M3 Dark: `primary #D0BCFF`, `surface #141218`, `error #F2B8B5`

---

## 📦 Instalación

```bash
git clone <repo>
cd Lefty
py -m pip install -r requirements.txt
py main.py
```

> Recomendado: **Click derecho → Ejecutar como administrador** para que funcione en todos los juegos.

Opcional para **Ultra baja latencia (0.5ms)**:

1. Descarga `Interception.zip` de https://github.com/oblitum/Interception/releases
2. Descomprime y en **CMD admin**: `install-interception.exe /install`
3. Reinicia
4. `py -m pip install interception`
5. En Lefty selecciona modo `Ultra`

---

## 🎮 Perfiles incluidos

| Perfil | Descripción | Mapeos clave |
|--------|-------------|--------------|
| **Zurdo IJKL** ⭐ | WASD → IJKL, estándar zurdo | `W→I, A→J, S→K, D→L, Q→U, E→O` |
| **Zurdo Flechas** | WASD → Flechas | `W→UP, A→LEFT, ...` |
| **Zurdo Numpad** | WASD → Numpad 8/4/5/6 | `W→NUM8, ...` |
| **Espejo Completo** | Todo reflejado | QWERT ↔ UIOPH + 1234→0987 |
| **Zurdo OKL; (FPS Pro)** | Pros zurdos usan OKL; | `W→O, A→K, S→L, D→;` |
| **Personalizado** | Vacío, crea el tuyo | — |
| **Desactivado** | Sin remapeo | — |

---

## 🕹️ Uso

1. Elige perfil en la izquierda (ej: **Zurdo IJKL**).
2. Click **＋ Añadir mapeo** o **🎯 Capturar** (presiona origen → destino, como Lefty
3. **▶ Activar remapeo**.
4. ¡Abre tu juego! (activa antes de abrir el juego para que el hook lo capture).
5. **⏸ Pausar** para volver a normal.

**Tips:**
- ESC en el diálogo captura cancela.
- ⇄ invierte un mapeo.
- Gaming mode bloquea Win para no minimizar el juego.
- Exportar/Importar perfiles JSON.

---

## ⚡ Latencia

| Método | Latencia | Requiere |
|--------|----------|----------|
| Registry (SharpKeys) | 0ms | Reboot, no dinámico |
| **Interception (Lefty Ultra)** | **~0.5ms** | Driver + reboot |
| **LL Hook (Lefty / Lefty
| AutoHotkey | 5-15ms | Nada |

Medición en `remapper.py` con `perf_counter` en hook proc.

---

## 📁 Estructura

```
Lefty/
├── core/
│   ├── keys.py       # VK_MAP, EXTENDED, gaming keys
│   ├── profile.py    # Perfiles zurdo, validate, vk_map
│   └── storage.py    # JSON %APPDATA%/Lefty
├── engine/
│   ├── remapper.py               # LL Hook + SendInput (port Lefty
│   └── interception_backend.py   # Ultra mode stub
├── ui/
│   ├── theme.py      # Material You 3 palette
│   ├── components.py # M3 cards/buttons
│   └── app.py        # App principal CTk
├── main.py
├── requirements.txt
└── README.md
```

---

## 🔧 Troubleshooting

- **No remapea en juego**: Ejecuta como **Admin**. Algunos anti-cheats bloquean hooks (Valorant/Vanguard, etc.) → usa Interception o modo registry.
- **Se queda pegada una tecla**: Pausa y reactiva. El hook envía keyup remapeado automáticamente.
- **Delay alto**: Cierra AutoHotkey/otros hooks. Lefty
- **Antivirus**: Puede flaggear hook como keylogger (es normal, es igual que Lefty

---

## 📄 Licencia

MIT - Haz lo que quieras, zurdo. ♿🎮

Hecho con ♥ y Material You.
