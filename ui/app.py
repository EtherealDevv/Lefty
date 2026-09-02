"""
Lefty - UI Material You Expressive (M3E 2025)
Evolución expressive: typografía Bold, formas 28dp, colores vibrantes, cápsulas pill, motion playful
Basado en Material You 3 pero con Expressive guidelines (Google I/O 2025)
"""
import customtkinter as ctk
import tkinter as tk
from tkinter import messagebox
import time
import ctypes

from core.keys import ALL_KEY_NAMES, VK_MAP, vk_name
from core.storage import load_config, save_config, load_profiles, save_profiles
from core.profile import BUILTIN_PROFILES, profile_to_vk_map, add_mapping, remove_mapping, validate_mapping
from engine.remapper import get_remapper
from engine.interception_backend import get_interception_status, is_interception_available, get_interception_remapper
from .theme import CTK_THEME, M3_DARK, M3_EXPRESSIVE, SHAPES, FONTS_EXPRESSIVE
from .components import MappingRowExpressive

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("dark-blue")

class KeyCaptureDialog(ctk.CTkToplevel):
    """Diálogo expressive — cápsula grande, tipografía bold, colores terciary"""
    def __init__(self, parent, title="Presiona una tecla", callback=None):
        super().__init__(parent)
        self.callback = callback
        self.title(title)
        self.geometry("460x320")
        self.configure(fg_color=CTK_THEME["bg"])
        self.transient(parent)
        self.grab_set()
        self.focus_set()
        self.update_idletasks()
        x = parent.winfo_x() + (parent.winfo_width() - 460)//2
        y = parent.winfo_y() + (parent.winfo_height() - 320)//2
        self.geometry(f"460x320+{x}+{y}")

        # Header pill expressive
        header = ctk.CTkFrame(self, fg_color=M3_EXPRESSIVE["tertiary_container"], corner_radius=SHAPES["pill"], height=48)
        header.pack(fill="x", padx=20, pady=(20, 12))
        header.pack_propagate(False)
        ctk.CTkLabel(header, text="⌨️  Captura Expressive", font=ctk.CTkFont(family="Roboto Black", size=14),
                     text_color=M3_EXPRESSIVE["on_tertiary_container"]).pack(expand=True)

        ctk.CTkLabel(self, text=title, font=ctk.CTkFont(family="Roboto Black", size=18),
                     text_color=CTK_THEME["on_surface"]).pack()
        ctk.CTkLabel(self, text="Presiona cualquier tecla...", font=ctk.CTkFont(size=13),
                     text_color=CTK_THEME["on_surface_variant"]).pack(pady=4)

        self.key_label = ctk.CTkLabel(self, text="Esperando...", font=ctk.CTkFont(family="Roboto Black", size=32),
                                      text_color=CTK_THEME["primary"],
                                      fg_color=CTK_THEME["surface_high"], corner_radius=SHAPES["extra_large"],
                                      width=220, height=70)
        self.key_label.pack(pady=16)

        ctk.CTkLabel(self, text="ESC para cancelar • Expressive", font=ctk.CTkFont(size=11, weight="bold"),
                     text_color=M3_EXPRESSIVE["tertiary"]).pack()

        self.bind("<KeyPress>", self._on_key)
        self.focus_set()

    def _on_key(self, event):
        ks = event.keysym.upper()
        mapping = {
            "SHIFT_L": "LSHIFT", "SHIFT_R": "RSHIFT",
            "CONTROL_L": "LCTRL", "CONTROL_R": "RCTRL",
            "ALT_L": "LALT", "ALT_R": "RALT",
            "CAPS_LOCK": "CAPSLOCK", "PRIOR": "PAGEUP", "NEXT": "PAGEDOWN",
            "ESCAPE": "ESC", "RETURN": "ENTER", "BACKSPACE": "BACKSPACE",
            "SPACE": "SPACE", "TAB": "TAB",
            "UP": "UP", "DOWN": "DOWN", "LEFT": "LEFT", "RIGHT": "RIGHT",
            "INSERT": "INSERT", "DELETE": "DELETE", "HOME": "HOME", "END": "END",
            "NUM_LOCK": "NUMLOCK", "SCROLL_LOCK": "SCROLLLOCK",
            "F1": "F1", "F2": "F2", "F3": "F3", "F4": "F4", "F5": "F5", "F6": "F6",
            "F7": "F7", "F8": "F8", "F9": "F9", "F10": "F10", "F11": "F11", "F12": "F12",
        }
        key_name = mapping.get(ks, ks)
        if len(key_name) == 1 and key_name.isalpha():
            key_name = key_name.upper()
        if key_name not in VK_MAP:
            if ks.upper() in VK_MAP:
                key_name = ks.upper()
            else:
                self.key_label.configure(text=f"{key_name} (?)", text_color=CTK_THEME["error"])
                return
        if key_name == "ESC":
            self.destroy()
            return
        self.key_label.configure(text=key_name, text_color=CTK_THEME["primary"])
        self.update()
        time.sleep(0.22)
        if self.callback:
            self.callback(key_name)
        self.destroy()

class LeftyApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Lefty v2")
        self.geometry("1220x800")
        self.minsize(1080, 680)
        self.configure(fg_color=CTK_THEME["bg"])

        self.config_data = load_config()
        self.profiles = load_profiles()
        _added = False
        for k, v in BUILTIN_PROFILES.items():
            if k not in self.profiles:
                self.profiles[k] = v
                _added = True
        # Fix sycho K/Ñ swap (K debe ser A-izq, Ñ debe ser D-der) — fuerza actualización si está desactualizado
        if "sycho" in self.profiles and "sycho" in BUILTIN_PROFILES:
            if self.profiles["sycho"].get("mappings") != BUILTIN_PROFILES["sycho"]["mappings"]:
                self.profiles["sycho"] = BUILTIN_PROFILES["sycho"]
                _added = True
        if _added:
            save_profiles(self.profiles)

        self.active_profile = self.config_data.get("active_profile", "zurdo_ijkl")
        if self.active_profile not in self.profiles:
            self.active_profile = "zurdo_ijkl"

        self.remapper = get_remapper()
        # Interception universal para Minecraft (si Ultra)
        try:
            self.interception = get_interception_remapper()
        except:
            self.interception = None
        self.using_interception = False
        # Restaurar inversión de clicks según config (zurdos)
        try:
            self.remapper.set_mouse_invert(bool(self.config_data.get("invert_clicks", False)))
            if self.interception:
                self.interception.set_mouse_invert(bool(self.config_data.get("invert_clicks", False)))
        except:
            pass
        self.is_enabled = False
        self.capturing_src = None

        self._build_ui()
        self._refresh_profiles()
        self._refresh_mappings()
        self._update_engine_status()

        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self):
        # ===== TOP APP BAR — Expressive 72dp, bold, pill actions =====
        top = ctk.CTkFrame(self, fg_color=CTK_THEME["surface"], height=76, corner_radius=0)
        top.pack(fill="x", side="top")
        top.pack_propagate(False)

        left_top = ctk.CTkFrame(top, fg_color="transparent")
        left_top.pack(side="left", padx=22, pady=12)

        # Icono expressive — 52dp, extra_large, con borde terciary
        icon_frame = ctk.CTkFrame(left_top, fg_color=CTK_THEME["primary"], width=52, height=52, corner_radius=SHAPES["extra_large"], border_width=2, border_color=M3_EXPRESSIVE["tertiary"])
        icon_frame.pack(side="left")
        icon_frame.pack_propagate(False)
        ctk.CTkLabel(icon_frame, text="♿", font=ctk.CTkFont(size=26)).pack(expand=True)

        title_frame = ctk.CTkFrame(left_top, fg_color="transparent")
        title_frame.pack(side="left", padx=14)
        ctk.CTkLabel(title_frame, text="Lefty", font=ctk.CTkFont(family="Roboto Black", size=26),
                     text_color=CTK_THEME["on_surface"]).pack(anchor="w")
        ctk.CTkLabel(title_frame, text="By Sycho",
                     text_color=M3_EXPRESSIVE["tertiary"]).pack(anchor="w")

        # Top actions — pill expressive
        right_top = ctk.CTkFrame(top, fg_color="transparent")
        right_top.pack(side="right", padx=22, pady=16)

        self.status_dot = ctk.CTkFrame(right_top, fg_color="#4A4458", width=14, height=14, corner_radius=7, border_width=2, border_color=CTK_THEME["outline_variant"])
        self.status_dot.pack(side="left", padx=(0, 8), pady=10)

        self.status_label = ctk.CTkLabel(right_top, text="Inactive", font=ctk.CTkFont(family="Roboto Black", size=13),
                                         text_color=CTK_THEME["on_surface_variant"])
        self.status_label.pack(side="left", padx=(0, 18))

        self.enable_btn = ctk.CTkButton(right_top, text="▶  Activar remapeo", width=176, height=44,
                                        fg_color=CTK_THEME["primary"], hover_color=CTK_THEME["primary_hover"],
                                        text_color=CTK_THEME["on_primary"], corner_radius=SHAPES["pill"],
                                        font=ctk.CTkFont(family="Roboto Black", size=13),
                                        command=self.toggle_engine)
        self.enable_btn.pack(side="left")

        # ===== BODY — más aire, shapes 28 =====
        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=18, pady=18)

        # --- NavigationRail Expressive (izquierda) — 28 radius, tinted ---
        nav = ctk.CTkFrame(body, fg_color=CTK_THEME["surface"], corner_radius=SHAPES["extra_large"], width=310, border_width=1, border_color=CTK_THEME["outline_variant"])
        nav.pack(side="left", fill="y", padx=(0, 14))
        nav.pack_propagate(False)

        # Header nav expressive
        nav_header = ctk.CTkFrame(nav, fg_color=CTK_THEME["surface_high"], corner_radius=SHAPES["large"], height=68)
        nav_header.pack(fill="x", padx=12, pady=12)
        nav_header.pack_propagate(False)
        ctk.CTkLabel(nav_header, text="Profiles", font=ctk.CTkFont(family="Roboto Black", size=16),
                     text_color=CTK_THEME["on_surface"]).pack(anchor="w", padx=14, pady=(10,0))
        ctk.CTkLabel(nav_header, text="Expressive • Choose your layout", font=ctk.CTkFont(family="Roboto Medium", size=11, weight="bold"),
                     text_color=M3_EXPRESSIVE["tertiary"]).pack(anchor="w", padx=14)

        self.profiles_scroll = ctk.CTkScrollableFrame(nav, fg_color="transparent", scrollbar_button_color=CTK_THEME["outline_variant"], scrollbar_button_hover_color=CTK_THEME["primary"])
        self.profiles_scroll.pack(fill="both", expand=True, padx=8, pady=8)
        self.profile_buttons = {}

        # --- Main Content Expressive (centro) — 28 radius ---
        main = ctk.CTkFrame(body, fg_color=CTK_THEME["surface"], corner_radius=SHAPES["extra_large"], border_width=1, border_color=CTK_THEME["outline_variant"])
        main.pack(side="left", fill="both", expand=True)

        main_header = ctk.CTkFrame(main, fg_color="transparent")
        main_header.pack(fill="x", padx=22, pady=(18, 8))

        self.profile_title = ctk.CTkLabel(main_header, text="Left-handed IJKL", font=ctk.CTkFont(family="Roboto Black", size=22),
                                          text_color=CTK_THEME["on_surface"])
        self.profile_title.pack(side="left")

        header_actions = ctk.CTkFrame(main_header, fg_color="transparent")
        header_actions.pack(side="right")
        ctk.CTkButton(header_actions, text="＋ Add mapping", width=138, height=38,
                      fg_color=CTK_THEME["primary"], hover_color=CTK_THEME["primary_hover"],
                      text_color=CTK_THEME["on_primary"], corner_radius=SHAPES["pill"],
                      font=ctk.CTkFont(family="Roboto Black", size=12),
                      command=self._add_mapping_dialog).pack(side="left", padx=4)
        ctk.CTkButton(header_actions, text="🎯 Capture", width=118, height=38,
                      fg_color=CTK_THEME["tertiary_container"], hover_color=M3_EXPRESSIVE["tertiary"],
                      text_color=M3_EXPRESSIVE["on_tertiary_container"], corner_radius=SHAPES["pill"],
                      font=ctk.CTkFont(family="Roboto Black", size=12),
                      command=self._capture_mapping).pack(side="left", padx=4)

        self.desc_label = ctk.CTkLabel(main, text="", font=ctk.CTkFont(size=12),
                                       text_color=CTK_THEME["on_surface_variant"], wraplength=640, justify="left")
        self.desc_label.pack(anchor="w", padx=22, pady=(0, 12))

        ctk.CTkFrame(main, fg_color=CTK_THEME["outline_variant"], height=1).pack(fill="x", padx=22, pady=(0, 12))

        counter_frame = ctk.CTkFrame(main, fg_color="transparent")
        counter_frame.pack(fill="x", padx=22, pady=(0, 8))
        self.counter_label = ctk.CTkLabel(counter_frame, text="0 mappings", font=ctk.CTkFont(family="Roboto Black", size=11),
                                          text_color=M3_EXPRESSIVE["tertiary"])
        self.counter_label.pack(side="left")
        ctk.CTkLabel(counter_frame, text="Source  →  Target", font=ctk.CTkFont(family="Roboto Black", size=11),
                     text_color=CTK_THEME["outline"]).pack(side="right")

        self.mappings_scroll = ctk.CTkScrollableFrame(main, fg_color="transparent", scrollbar_button_color=CTK_THEME["outline_variant"], scrollbar_button_hover_color=CTK_THEME["primary"])
        self.mappings_scroll.pack(fill="both", expand=True, padx=8, pady=8)

        self.empty_label = ctk.CTkLabel(self.mappings_scroll, text="No mappings\nAdd your first remap with ＋",
                                        font=ctk.CTkFont(size=13, weight="bold"), text_color=CTK_THEME["outline"],
                                        justify="center")

        # --- Right panel Expressive (info + stats) — 28 radius ---
        right = ctk.CTkFrame(body, fg_color=CTK_THEME["surface"], corner_radius=SHAPES["extra_large"], width=300, border_width=1, border_color=CTK_THEME["outline_variant"])
        right.pack(side="right", fill="y", padx=(14, 0))
        right.pack_propagate(False)

        # Título con badge expressive
        right_title_row = ctk.CTkFrame(right, fg_color="transparent")
        right_title_row.pack(fill="x", padx=16, pady=(16, 4))
        ctk.CTkLabel(right_title_row, text="Estado", font=ctk.CTkFont(family="Roboto Black", size=16),
                     text_color=CTK_THEME["on_surface"]).pack(side="left")
        badge2 = ctk.CTkFrame(right_title_row, fg_color=M3_EXPRESSIVE["tertiary_container"], corner_radius=SHAPES["pill"], height=20)
        badge2.pack(side="right")
        ctk.CTkLabel(badge2, text="  LIVE  ", font=ctk.CTkFont(family="Roboto Black", size=9),
                     text_color=M3_EXPRESSIVE["on_tertiary_container"]).pack(padx=6)

        # Card estado expressive — surface_bright con borde primary al activo
        status_card = ctk.CTkFrame(right, fg_color=CTK_THEME["surface_bright"], corner_radius=SHAPES["large"], border_width=1, border_color=CTK_THEME["outline_variant"])
        status_card.pack(fill="x", padx=12, pady=6)

        self.latency_label = ctk.CTkLabel(status_card, text="Latency: --", font=ctk.CTkFont(family="Roboto Black", size=18),
                                          text_color=CTK_THEME["primary"])
        self.latency_label.pack(anchor="w", padx=14, pady=(12, 2))
        ctk.CTkLabel(status_card, text="Hook WH_KEYBOARD_LL", font=ctk.CTkFont(family="Roboto Medium", size=11, weight="bold"),
                     text_color=CTK_THEME["on_surface_variant"]).pack(anchor="w", padx=14)
        ctk.CTkLabel(status_card, text="Rust nativo • Lefty
                     font=ctk.CTkFont(size=10, weight="bold"), text_color=M3_EXPRESSIVE["tertiary"],
                     justify="left").pack(anchor="w", padx=14, pady=(2, 12))

        # Admin card expressive — warning container si no admin
        bg_admin = M3_EXPRESSIVE["warning_container"] if not self._is_admin() else CTK_THEME["surface_bright"]
        border_admin = M3_EXPRESSIVE["warning"] if not self._is_admin() else CTK_THEME["outline_variant"]
        self.admin_card = ctk.CTkFrame(right, fg_color=bg_admin, corner_radius=SHAPES["large"], border_width=1.5, border_color=border_admin)
        self.admin_card.pack(fill="x", padx=12, pady=6)
        if not self._is_admin():
            ctk.CTkLabel(self.admin_card, text="⚠️  Not Admin", font=ctk.CTkFont(family="Roboto Black", size=12),
                         text_color=M3_EXPRESSIVE["warning"]).pack(anchor="w", padx=14, pady=(10, 2))
            ctk.CTkLabel(self.admin_card, text="Algunos juegos no se\nremapearán sin admin.\nClick para elevar • Expressive",
                         font=ctk.CTkFont(size=10, weight="bold"), text_color=CTK_THEME["on_surface_variant"],
                         justify="left").pack(anchor="w", padx=14, pady=(0, 12))
            self.admin_card.bind("<Button-1>", lambda e: self._elevate())
        else:
            ctk.CTkLabel(self.admin_card, text="✓ Admin active", font=ctk.CTkFont(family="Roboto Black", size=12),
                         text_color=CTK_THEME["success"]).pack(anchor="w", padx=14, pady=(10, 2))
            ctk.CTkLabel(self.admin_card, text="Funciona en todos los\njuegos, incluso elevados.",
                         font=ctk.CTkFont(size=10, weight="bold"), text_color=CTK_THEME["on_surface_variant"],
                         justify="left").pack(anchor="w", padx=14, pady=(0, 12))

        # Engine info — siempre Rust gaming (Lefty
        engine_card = ctk.CTkFrame(right, fg_color=CTK_THEME["surface_bright"], corner_radius=SHAPES["large"], border_width=1, border_color=CTK_THEME["outline_variant"])
        engine_card.pack(fill="x", padx=12, pady=6)
        ctk.CTkLabel(engine_card, text="Engine", font=ctk.CTkFont(family="Roboto Black", size=12),
                     text_color=CTK_THEME["on_surface"]).pack(anchor="w", padx=14, pady=(10, 4))
        ctk.CTkLabel(engine_card, text="Rust nativo • WH_KEYBOARD_LL", font=ctk.CTkFont(family="Roboto Black", size=11),
                     text_color=CTK_THEME["primary"]).pack(anchor="w", padx=14)
        ctk.CTkLabel(engine_card, text="0.02ms • Lefty
                     text_color=M3_EXPRESSIVE["tertiary"]).pack(anchor="w", padx=14, pady=(0, 10))

        # Inversión clicks — zurdos (mouse)
        invert_card = ctk.CTkFrame(right, fg_color=CTK_THEME["surface_bright"], corner_radius=SHAPES["large"], border_width=1, border_color=CTK_THEME["outline_variant"])
        invert_card.pack(fill="x", padx=12, pady=6)
        ctk.CTkLabel(invert_card, text="Left-handed Mouse", font=ctk.CTkFont(family="Roboto Black", size=12),
                     text_color=CTK_THEME["on_surface"]).pack(anchor="w", padx=14, pady=(10, 2))
        self.invert_switch = ctk.CTkSwitch(invert_card, text="Invert left↔right clicks", font=ctk.CTkFont(family="Roboto Medium", size=11, weight="bold"),
                                           progress_color=M3_EXPRESSIVE["tertiary"], button_color="#FFFFFF", button_hover_color="#FFDAD4",
                                           command=self._on_invert_toggle)
        if self.config_data.get("invert_clicks"):
            self.invert_switch.select()
        self.invert_switch.pack(anchor="w", padx=14, pady=(2, 6))
        ctk.CTkLabel(invert_card, text="Ideal si usas ratón con mano izq • 0ms", font=ctk.CTkFont(size=9, weight="bold"),
                     text_color=M3_EXPRESSIVE["tertiary"]).pack(anchor="w", padx=14, pady=(0, 10))

        # Tips expressive
        tips_card = ctk.CTkFrame(right, fg_color=CTK_THEME["surface_bright"], corner_radius=SHAPES["large"], border_width=1, border_color=CTK_THEME["outline_variant"])
        tips_card.pack(fill="x", padx=12, pady=6)
        ctk.CTkLabel(tips_card, text="💡 How it works", font=ctk.CTkFont(family="Roboto Black", size=12),
                     text_color=CTK_THEME["on_surface"]).pack(anchor="w", padx=14, pady=(10, 4))
        tips = [
            "• Activate before gaming",
            "• Hook + SendInput",
            "• suppress return 1",
            "• flag 0x4B4D • Expressive",
            "• ESC desactiva rápido",
        ]
        for t in tips:
            ctk.CTkLabel(tips_card, text=t, font=ctk.CTkFont(size=10, weight="bold"),
                         text_color=CTK_THEME["on_surface_variant"], anchor="w").pack(anchor="w", padx=14)

        ctk.CTkButton(tips_card, text="View shortcuts", height=32, corner_radius=SHAPES["pill"],
                      fg_color="transparent", border_width=1.5, border_color=M3_EXPRESSIVE["tertiary"],
                      text_color=M3_EXPRESSIVE["tertiary"], font=ctk.CTkFont(family="Roboto Black", size=11),
                      command=self._show_shortcuts).pack(fill="x", padx=14, pady=10)

        # Gaming optimizado — Lefty
        gaming_card = ctk.CTkFrame(right, fg_color=M3_EXPRESSIVE["success_container"], corner_radius=SHAPES["large"], border_width=1, border_color=M3_EXPRESSIVE["success"])
        gaming_card.pack(fill="x", padx=12, pady=6)
        ctk.CTkLabel(gaming_card, text="⚡ Gaming • Always optimized", font=ctk.CTkFont(family="Roboto Black", size=11),
                     text_color=M3_EXPRESSIVE["success"]).pack(anchor="w", padx=14, pady=(8, 2))
        ctk.CTkLabel(gaming_card, text="Native Rust engine • 0.02ms • Lefty
                     font=ctk.CTkFont(size=9, weight="bold"), text_color=CTK_THEME["on_surface_variant"], justify="left").pack(anchor="w", padx=14, pady=(0, 8))

        # Export / Import expressive — pill 28
        io_frame = ctk.CTkFrame(right, fg_color="transparent")
        io_frame.pack(fill="x", padx=12, pady=12)
        ctk.CTkButton(io_frame, text="Export", width=128, height=34, corner_radius=SHAPES["pill"],
                      fg_color="transparent", border_width=1.5, border_color=CTK_THEME["outline"],
                      text_color=CTK_THEME["on_surface"], font=ctk.CTkFont(family="Roboto Black", size=11),
                      command=self._export).pack(side="left", padx=(0, 6))
        ctk.CTkButton(io_frame, text="Import", width=128, height=34, corner_radius=SHAPES["pill"],
                      fg_color=CTK_THEME["primary"], hover_color=CTK_THEME["primary_hover"],
                      text_color=CTK_THEME["on_primary"], font=ctk.CTkFont(family="Roboto Black", size=11),
                      command=self._import).pack(side="left")

        ctk.CTkLabel(right, text="Lefty v1.1 • by Juan",
                     font=ctk.CTkFont(family="Roboto Medium", size=9, weight="bold"), text_color=CTK_THEME["outline"]).pack(side="bottom", pady=12)

    def _is_admin(self) -> bool:
        try:
            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        except:
            return False

    def _elevate(self):
        try:
            ctypes.windll.shell32.ShellExecuteW(None, "runas", "py", f'"{__file__}"', None, 1)
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo elevar: {e}")

    def _refresh_profiles(self):
        for w in self.profiles_scroll.winfo_children():
            w.destroy()
        self.profile_buttons.clear()
        for name, data in self.profiles.items():
            is_active = (name == self.active_profile)
            # Expressive shapes 20, border 2, bolder
            if is_active:
                bg = CTK_THEME["primary"]
                border = CTK_THEME["primary"]
                text_c = CTK_THEME["on_primary"]
                sub_c = CTK_THEME["on_primary"]
            else:
                bg = CTK_THEME["surface_high"]
                border = CTK_THEME["outline_variant"]
                text_c = CTK_THEME["on_surface"]
                sub_c = CTK_THEME["on_surface_variant"]

            card = ctk.CTkFrame(self.profiles_scroll, fg_color=bg, corner_radius=SHAPES["large"],
                                border_width=2 if is_active else 1,
                                border_color=border)
            card.pack(fill="x", pady=5, padx=2)
            card.bind("<Button-1>", lambda e, n=name: self._select_profile(n))

            icon = data.get("icon", "🎮")
            ctk.CTkLabel(card, text=icon, font=ctk.CTkFont(size=20)).pack(side="left", padx=(14, 10), pady=12)

            txt_frame = ctk.CTkFrame(card, fg_color="transparent")
            txt_frame.pack(side="left", fill="x", expand=True)
            txt_frame.bind("<Button-1>", lambda e, n=name: self._select_profile(n))

            lbl = ctk.CTkLabel(txt_frame, text=data.get("display_name", name), font=ctk.CTkFont(family="Roboto Black", size=13),
                     text_color=text_c, anchor="w")
            lbl.pack(anchor="w")
            lbl.bind("<Button-1>", lambda e, n=name: self._select_profile(n))
            count = len(data.get("mappings", []))
            sub = ctk.CTkLabel(txt_frame, text=f"{count} mappings", font=ctk.CTkFont(family="Roboto Medium", size=10, weight="bold"),
                     text_color=sub_c, anchor="w")
            sub.pack(anchor="w")
            sub.bind("<Button-1>", lambda e, n=name: self._select_profile(n))

            if is_active:
                dot = ctk.CTkFrame(card, fg_color=CTK_THEME["on_primary"], width=10, height=10, corner_radius=5)
                dot.pack(side="right", padx=12)
                dot.pack_propagate(False)

            self.profile_buttons[name] = card

        prof = self.profiles.get(self.active_profile, {})
        self.profile_title.configure(text=prof.get("display_name", self.active_profile))
        self.desc_label.configure(text=prof.get("description", ""))

    def _select_profile(self, name: str):
        self.active_profile = name
        self.config_data["active_profile"] = name
        save_config(self.config_data)
        self._refresh_profiles()
        self._refresh_mappings()
        if self.is_enabled:
            self._apply_current_mappings()

    def _refresh_mappings(self):
        for w in self.mappings_scroll.winfo_children():
            w.destroy()
        mappings = self.profiles.get(self.active_profile, {}).get("mappings", [])
        self.counter_label.configure(text=f"{len(mappings)} mappings")
        if not mappings:
            self.empty_label = ctk.CTkLabel(self.mappings_scroll,
                                            text="No mappings\nAdd your first remap with ＋",
                                            font=ctk.CTkFont(size=13, weight="bold"), text_color=CTK_THEME["outline"],
                                            justify="center")
            self.empty_label.pack(pady=40)
            if self.active_profile == "custom":
                sug = ctk.CTkFrame(self.mappings_scroll, fg_color=CTK_THEME["surface_high"], corner_radius=SHAPES["large"], border_width=1, border_color=M3_EXPRESSIVE["tertiary"])
                sug.pack(fill="x", padx=12, pady=12)
                ctk.CTkLabel(sug, text="Suggestions:", font=ctk.CTkFont(family="Roboto Black", size=12),
                             text_color=M3_EXPRESSIVE["tertiary"]).pack(anchor="w", padx=14, pady=(12, 4))
                for s in ["W → I (forward)", "A → J (left)", "S → K (back)", "D → L (right)"]:
                    ctk.CTkLabel(sug, text=f"  • {s}", font=ctk.CTkFont(size=11, weight="bold"),
                                 text_color=CTK_THEME["on_surface_variant"]).pack(anchor="w", padx=14)
                ctk.CTkButton(sug, text="Apply quick IJKL preset", height=36, corner_radius=SHAPES["pill"],
                              fg_color=CTK_THEME["primary"], text_color=CTK_THEME["on_primary"],
                              font=ctk.CTkFont(family="Roboto Black", size=12),
                              command=self._apply_quick_ijkl).pack(padx=14, pady=12)
            return

        for src, dst in mappings:
            row = MappingRowExpressive(self.mappings_scroll, src, dst,
                                       on_delete=self._delete_mapping, on_swap=self._swap_mapping)
            row.pack(fill="x", pady=5, padx=2)

    def _add_mapping_dialog(self):
        dlg = ctk.CTkToplevel(self)
        dlg.title("Add mapping • Expressive")
        dlg.geometry("460x400")
        dlg.configure(fg_color=CTK_THEME["bg"])
        dlg.transient(self)
        dlg.grab_set()
        self.update_idletasks()
        x = self.winfo_x() + (self.winfo_width() - 460)//2
        y = self.winfo_y() + (self.winfo_height() - 400)//2
        dlg.geometry(f"460x400+{x}+{y}")

        ctk.CTkLabel(dlg, text="New mapping", font=ctk.CTkFont(family="Roboto Black", size=18),
                     text_color=CTK_THEME["on_surface"]).pack(pady=(20, 8))
        ctk.CTkLabel(dlg, text="Expressive • Map any key for left-handed",
                     font=ctk.CTkFont(size=11, weight="bold"), text_color=M3_EXPRESSIVE["tertiary"]).pack()

        form = ctk.CTkFrame(dlg, fg_color="transparent")
        form.pack(fill="x", padx=20, pady=20)

        ctk.CTkLabel(form, text="Source key", font=ctk.CTkFont(family="Roboto Black", size=12),
                     text_color=CTK_THEME["on_surface"]).pack(anchor="w")
        src_var = tk.StringVar(value="W")
        src_combo = ctk.CTkComboBox(form, values=ALL_KEY_NAMES, variable=src_var, width=420, height=38,
                                    fg_color=CTK_THEME["surface_high"], border_color=M3_EXPRESSIVE["tertiary"],
                                    button_color=CTK_THEME["primary"], dropdown_fg_color=CTK_THEME["surface_high"],
                                    corner_radius=SHAPES["pill"], font=ctk.CTkFont(family="Roboto Black", size=12))
        src_combo.pack(pady=(4, 6), fill="x")
        ctk.CTkButton(form, text="🎯 Capture origen", height=30, corner_radius=SHAPES["pill"],
                      fg_color=CTK_THEME["tertiary_container"], hover_color=M3_EXPRESSIVE["tertiary"],
                      text_color=M3_EXPRESSIVE["on_tertiary_container"], font=ctk.CTkFont(family="Roboto Black", size=11),
                      command=lambda: KeyCaptureDialog(dlg, "Presiona tecla ORIGEN", lambda k: src_var.set(k))).pack(anchor="w", pady=(0, 12))

        ctk.CTkLabel(form, text="Target key", font=ctk.CTkFont(family="Roboto Black", size=12),
                     text_color=CTK_THEME["on_surface"]).pack(anchor="w")
        dst_var = tk.StringVar(value="I")
        dst_combo = ctk.CTkComboBox(form, values=ALL_KEY_NAMES, variable=dst_var, width=420, height=38,
                                    fg_color=CTK_THEME["surface_high"], border_color=M3_EXPRESSIVE["tertiary"],
                                    button_color=CTK_THEME["primary"], dropdown_fg_color=CTK_THEME["surface_high"],
                                    corner_radius=SHAPES["pill"], font=ctk.CTkFont(family="Roboto Black", size=12))
        dst_combo.pack(pady=(4, 6), fill="x")
        ctk.CTkButton(form, text="🎯 Capture destino", height=30, corner_radius=SHAPES["pill"],
                      fg_color=CTK_THEME["tertiary_container"], hover_color=M3_EXPRESSIVE["tertiary"],
                      text_color=M3_EXPRESSIVE["on_tertiary_container"], font=ctk.CTkFont(family="Roboto Black", size=11),
                      command=lambda: KeyCaptureDialog(dlg, "Presiona tecla DESTINO", lambda k: dst_var.set(k))).pack(anchor="w")

        def _save():
            src = src_var.get().strip().upper()
            dst = dst_var.get().strip().upper()
            ok, msg = validate_mapping(src, dst)
            if not ok:
                messagebox.showerror("Error", msg, parent=dlg)
                return
            add_mapping(self.profiles, self.active_profile, src, dst)
            save_profiles(self.profiles)
            self._refresh_mappings()
            self._refresh_profiles()
            if self.is_enabled:
                self._apply_current_mappings()
            dlg.destroy()

        btns = ctk.CTkFrame(dlg, fg_color="transparent")
        btns.pack(fill="x", padx=20, pady=12)
        ctk.CTkButton(btns, text="Cancel", fg_color="transparent", border_width=1.5, border_color=CTK_THEME["outline"],
                      text_color=CTK_THEME["on_surface"], corner_radius=SHAPES["pill"], width=120,
                      font=ctk.CTkFont(family="Roboto Black", size=12),
                      command=dlg.destroy).pack(side="left")
        ctk.CTkButton(btns, text="Save", fg_color=CTK_THEME["primary"], text_color=CTK_THEME["on_primary"],
                      corner_radius=SHAPES["pill"], width=120, font=ctk.CTkFont(family="Roboto Black", size=12),
                      command=_save).pack(side="right")

    def _capture_mapping(self):
        self.capturing_src = None
        def _got_src(key):
            self.capturing_src = key
            KeyCaptureDialog(self, f"Origen: {key} → ahora presiona DESTINO", _got_dst)
        def _got_dst(key):
            src = self.capturing_src
            dst = key
            ok, msg = validate_mapping(src, dst)
            if not ok:
                messagebox.showerror("Error", msg)
                return
            add_mapping(self.profiles, self.active_profile, src, dst)
            save_profiles(self.profiles)
            self._refresh_mappings()
            self._refresh_profiles()
            if self.is_enabled:
                self._apply_current_mappings()
        KeyCaptureDialog(self, "Presiona tecla ORIGEN", _got_src)

    def _delete_mapping(self, src: str):
        remove_mapping(self.profiles, self.active_profile, src)
        save_profiles(self.profiles)
        self._refresh_mappings()
        self._refresh_profiles()
        if self.is_enabled:
            self._apply_current_mappings()

    def _swap_mapping(self, src, dst):
        remove_mapping(self.profiles, self.active_profile, src)
        add_mapping(self.profiles, self.active_profile, dst, src)
        save_profiles(self.profiles)
        self._refresh_mappings()
        if self.is_enabled:
            self._apply_current_mappings()

    def _apply_quick_ijkl(self):
        preset = [["W","I"],["A","J"],["S","K"],["D","L"]]
        for s,d in preset:
            add_mapping(self.profiles, self.active_profile, s, d)
        save_profiles(self.profiles)
        self._refresh_mappings()
        self._refresh_profiles()
        if self.is_enabled:
            self._apply_current_mappings()

    def toggle_engine(self):
        if self.is_enabled:
            # Detener ambos backends
            try:
                self.remapper.stop()
            except: pass
            try:
                if self.interception:
                    self.interception.stop()
            except: pass
            self.is_enabled = False
            self.using_interception = False
            self.status_dot.configure(fg_color="#4A4458", border_color=CTK_THEME["outline_variant"])
            self.status_label.configure(text="Inactive", text_color=CTK_THEME["on_surface_variant"])
            self.enable_btn.configure(text="▶  Activar remapeo", fg_color=CTK_THEME["primary"], hover_color=CTK_THEME["primary_hover"])
            self._update_engine_status()
        else:
            prof = self.profiles.get(self.active_profile, {})
            vk_map = profile_to_vk_map(prof)
            if self.config_data.get("disable_win_key"):
                vk_map[VK_MAP["LWIN"]] = VK_MAP["DISABLED"]
                vk_map[VK_MAP["RWIN"]] = VK_MAP["DISABLED"]
            if not vk_map and self.active_profile != "disabled":
                messagebox.showwarning("No mappings", "Este perfil no tiene mappings. Añade al menos uno.")
                return
            # Decidir backend: Ultra + Interception disponible → universal (Minecraft)
            use_interception = (self.config_data.get("latency_mode") == "ultra" and is_interception_available() and self.interception is not None)
            if use_interception:
                self.interception.set_mappings(vk_map)
                # Mouse invert ya está aplicado vía SwapMouseButton
                ok = self.interception.start()
                if not ok:
                    messagebox.showerror("Error Ultra", "No se pudo iniciar Interception. Driver no instalado o sin admin.\nUsando LL hook (no funcionará en Minecraft).")
                    # Fallback a LL
                    self.remapper.set_mappings(vk_map)
                    ok = self.remapper.start()
                    if not ok:
                        messagebox.showerror("Error", "No se pudo instalar el hook. ¿Antivirus bloqueando? Prueba ejecutar como Admin.")
                        return
                    self.using_interception = False
                else:
                    self.using_interception = True
                    self.is_enabled = True
                    self.status_dot.configure(fg_color=M3_EXPRESSIVE["tertiary"], border_color=M3_EXPRESSIVE["tertiary"])
                    self.status_label.configure(text="Active UNIVERSAL • Ultra", text_color=M3_EXPRESSIVE["tertiary"])
                    self.enable_btn.configure(text="⏸  Pausar", fg_color=M3_EXPRESSIVE["error_container"], hover_color="#9C1A16", text_color="#FFDAD6")
                    self._start_latency_updates()
                    return
            else:
                if self.config_data.get("latency_mode") == "ultra" and not is_interception_available():
                    print("[Lefty] Ultra no disponible, usando Rust LL ~0.02ms")
            self.remapper.set_mappings(vk_map)
            ok = self.remapper.start()
            if not ok:
                messagebox.showerror("Error", "No se pudo instalar el hook. ¿Antivirus bloqueando? Prueba ejecutar como Admin.")
                return
            self.using_interception = False
            self.is_enabled = True
            self.status_dot.configure(fg_color=M3_EXPRESSIVE["success"], border_color=M3_EXPRESSIVE["success"])
            self.status_label.configure(text="Active • Gaming", text_color=M3_EXPRESSIVE["success"])
            self.enable_btn.configure(text="⏸  Pausar", fg_color=M3_EXPRESSIVE["error_container"], hover_color="#9C1A16", text_color="#FFDAD6")
            self._start_latency_updates()

    def _apply_current_mappings(self):
        prof = self.profiles.get(self.active_profile, {})
        vk_map = profile_to_vk_map(prof)
        if self.config_data.get("disable_win_key"):
            vk_map[VK_MAP["LWIN"]] = VK_MAP["DISABLED"]
            vk_map[VK_MAP["RWIN"]] = VK_MAP["DISABLED"]
        self.remapper.set_mappings(vk_map)
        if self.interception and self.using_interception:
            self.interception.set_mappings(vk_map)

    def _on_invert_toggle(self):
        enabled = self.invert_switch.get() == 1
        self.config_data["invert_clicks"] = enabled
        save_config(self.config_data)
        try:
            self.remapper.set_mouse_invert(enabled)
            if self.interception:
                self.interception.set_mouse_invert(enabled)
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo invertir clicks: {e}")

    def _change_latency(self, val):
        mode = "ultra" if val == "Ultra" else "low"
        self.config_data["latency_mode"] = mode
        save_config(self.config_data)
        if mode == "ultra":
            inter = get_interception_status()
            if not inter["available"]:
                self._show_interception_help()
                self.latency_mode.set("Low")
                self.config_data["latency_mode"] = "low"
                save_config(self.config_data)

    def _start_latency_updates(self):
        if not self.is_enabled:
            return
        # Health check para ambos backends — SIN bloquear el hilo UI (no time.sleep)
        try:
            is_running = self.remapper.is_running() if not self.using_interception else (self.interception.is_running() if self.interception else False)
        except:
            is_running = False

        if not is_running:
            self.status_dot.configure(fg_color=M3_EXPRESSIVE["error_container"], border_color=M3_EXPRESSIVE["error_container"])
            self.status_label.configure(text="⚠ Hook caído", text_color=M3_EXPRESSIVE["error_container"])
            self.latency_label.configure(text="Reinstalando...")
            # Reconexión ASÍNCRONA sin bloquear UI: programar en background thread
            def _reconnect_bg():
                try:
                    # Intentar reinstall rápido sin stop completo primero (menos invasivo)
                    if not self.using_interception:
                        if hasattr(self.remapper, 'force_reinstall'):
                            ok = self.remapper.force_reinstall()
                            if ok:
                                self.after(0, lambda: self.status_label.configure(text="Reconectado") or self.status_dot.configure(fg_color=M3_EXPRESSIVE["success"], border_color=M3_EXPRESSIVE["success"]) or self.latency_label.configure(text="Latency: <1 ms"))
                                self.after(1500, self._start_latency_updates)
                                return
                    # Fallback: stop + start completo
                    try:
                        self.remapper.stop()
                    except: pass
                    try:
                        if self.interception:
                            self.interception.stop()
                    except: pass
                    # Delay sin bloquear UI: esperar 250ms en bg thread
                    time.sleep(0.25)
                    prof = self.profiles.get(self.active_profile, {})
                    vk_map = profile_to_vk_map(prof)
                    if self.config_data.get("disable_win_key"):
                        vk_map[VK_MAP["LWIN"]] = VK_MAP["DISABLED"]
                        vk_map[VK_MAP["RWIN"]] = VK_MAP["DISABLED"]
                    ok = False
                    if self.using_interception and self.interception and is_interception_available():
                        self.interception.set_mappings(vk_map)
                        ok = self.interception.start()
                        if ok:
                            self.after(0, lambda: self.status_dot.configure(fg_color=M3_EXPRESSIVE["tertiary"], border_color=M3_EXPRESSIVE["tertiary"]) or self.status_label.configure(text="Reconectado UNIVERSAL", text_color=M3_EXPRESSIVE["tertiary"]) or self.latency_label.configure(text="Latency: ~0.3 ms • UNIVERSAL"))
                    if not ok:
                        self.using_interception = False
                        self.remapper.set_mappings(vk_map)
                        ok = self.remapper.start()
                        if ok:
                            self.after(0, lambda: self.status_dot.configure(fg_color=M3_EXPRESSIVE["success"], border_color=M3_EXPRESSIVE["success"]) or self.status_label.configure(text="Reconectado", text_color=M3_EXPRESSIVE["success"]) or self.latency_label.configure(text="Latency: <1 ms • SCANCODE"))
                        else:
                            self.after(0, lambda: self.latency_label.configure(text="Error - Pausar → Activar"))
                except Exception as e:
                    print(f"[Lefty] reconnect error: {e}")
                    self.after(0, lambda: self.latency_label.configure(text="Error reconexión"))
                self.after(2000, self._start_latency_updates)
            import threading
            threading.Thread(target=_reconnect_bg, daemon=True).start()
            return

        # Mostrar latencia según backend - bajo overhead
        if self.using_interception:
            self.latency_label.configure(text="Latency: ~0.3 ms • UNIVERSAL")
        else:
            try:
                avg = self.remapper.get_avg_latency()
                if avg > 0.05:
                    self.latency_label.configure(text=f"Latency: {avg:.2f} ms")
                else:
                    self.latency_label.configure(text="Latency: <1 ms • SCANCODE")
            except:
                self.latency_label.configure(text="Latency: --")
        # Polling más espaciado para NO robar GIL a Minecraft: 1200ms en vez de 800ms
        self.after(1200, self._start_latency_updates)

    def _update_engine_status(self):
        pass

    def _show_interception_help(self):
        dlg = ctk.CTkToplevel(self)
        dlg.title("Modo Ultra - Interception")
        dlg.geometry("480x440")
        dlg.configure(fg_color=CTK_THEME["bg"])
        dlg.transient(self)
        dlg.grab_set()
        x = self.winfo_x() + (self.winfo_width() - 480)//2
        y = self.winfo_y() + (self.winfo_height() - 440)//2
        dlg.geometry(f"480x440+{x}+{y}")

        ctk.CTkLabel(dlg, text="⚡ Modo Ultra (0.5ms)", font=ctk.CTkFont(family="Roboto Black", size=18),
                     text_color=CTK_THEME["on_surface"]).pack(pady=(20, 8))
        ctk.CTkLabel(dlg, text="Expressive • LL Hook 1-3ms → Interception 0.5ms",
                     font=ctk.CTkFont(size=11, weight="bold"), text_color=M3_EXPRESSIVE["tertiary"],
                     justify="center").pack()

        steps = ctk.CTkFrame(dlg, fg_color=CTK_THEME["surface_high"], corner_radius=SHAPES["large"], border_width=1, border_color=M3_EXPRESSIVE["tertiary"])
        steps.pack(fill="x", padx=16, pady=16)
        ctk.CTkLabel(steps, text="Instalación:", font=ctk.CTkFont(family="Roboto Black", size=13),
                     text_color=CTK_THEME["on_surface"]).pack(anchor="w", padx=14, pady=(10, 4))
        instructions = [
            "1. Descarga Interception.zip",
            "   github.com/oblitum/Interception/releases",
            "2. Descomprime → cmd ADMIN:",
            "   install-interception.exe /install",
            "3. Reinicia PC",
            "4. Pip: pip install interception",
            "5. Reinicia Lefty → selecciona Ultra",
        ]
        for ins in instructions:
            ctk.CTkLabel(steps, text=ins, font=ctk.CTkFont(size=11, family="Consolas"),
                         text_color=CTK_THEME["on_surface_variant"], anchor="w", justify="left").pack(anchor="w", padx=14)

        comp = ctk.CTkFrame(dlg, fg_color=CTK_THEME["surface_high"], corner_radius=SHAPES["large"])
        comp.pack(fill="x", padx=16, pady=(0, 12))
        ctk.CTkLabel(comp, text="Comparativa latencia:", font=ctk.CTkFont(family="Roboto Black", size=12),
                     text_color=CTK_THEME["on_surface"]).pack(anchor="w", padx=14, pady=(8, 4))
        for row in ["Registry: 0ms pero reboot",
                    "Interception: 0.5ms ✓ Ultra",
                    "LL Hook: 1-3ms ✓ actual",
                    "AutoHotkey: 5-15ms"]:
            ctk.CTkLabel(comp, text=f"• {row}", font=ctk.CTkFont(size=10, weight="bold"),
                         text_color=CTK_THEME["on_surface_variant"], anchor="w").pack(anchor="w", padx=14)

        ctk.CTkButton(dlg, text="Cerrar", fg_color=CTK_THEME["primary"], text_color=CTK_THEME["on_primary"],
                      corner_radius=SHAPES["pill"], font=ctk.CTkFont(family="Roboto Black", size=12),
                      command=dlg.destroy).pack(pady=8)

    def _show_shortcuts(self):
        messagebox.showinfo("Atajos Lefty Expressive",
                            "• ESC: Pausa remapeo\n"
                            "• F9: Toggle rápido\n"
                            "• Gaming blocks Win\n"
                            "• Expressive: usa pill chips + terciary\n"
                            "• Ultra para shooters")

    def _export(self):
        import json, tkinter.filedialog as fd
        path = fd.asksaveasfilename(defaultextension=".json", filetypes=[("JSON","*.json")],
                                    initialfile=f"lefty_{self.active_profile}.json")
        if not path:
            return
        prof = self.profiles.get(self.active_profile, {})
        with open(path, "w", encoding="utf-8") as f:
            json.dump(prof, f, indent=2, ensure_ascii=False)
        messagebox.showinfo("Exportado", f"Perfil exportado a {path}")

    def _import(self):
        import json, tkinter.filedialog as fd
        path = fd.askopenfilename(filetypes=[("JSON","*.json")])
        if not path:
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            name = path.split("/")[-1].split("\\")[-1].replace(".json","")
            self.profiles[name] = data
            save_profiles(self.profiles)
            self.active_profile = name
            self.config_data["active_profile"] = name
            save_config(self.config_data)
            self._refresh_profiles()
            self._refresh_mappings()
            messagebox.showinfo("Importado", f"Perfil '{name}' importado")
        except Exception as e:
            messagebox.showerror("Error", str(e))

    def _on_close(self):
        try:
            self.remapper.stop()
        except: pass
        try:
            if self.interception:
                self.interception.stop()
        except: pass
        self.destroy()