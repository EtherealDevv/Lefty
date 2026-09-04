"""
Lefty - Componentes Material You Expressive
M3 Expressive 2025: formas more redondeadas, tipografía bold, colores vibrantes, movimiento
"""
import customtkinter as ctk
from .theme import CTK_THEME, SHAPES, M3_EXPRESSIVE

# ------------------------------------------------------------------
# Expressive Card — 28dp radius, tinted surface, hover elevation
# ------------------------------------------------------------------
class M3Card(ctk.CTkFrame):
    def __init__(self, parent, **kwargs):
        super().__init__(parent,
                         fg_color=CTK_THEME["surface"],
                         corner_radius=SHAPES["extra_large"],  # 28 expressive
                         border_width=1,
                         border_color=CTK_THEME["outline_variant"],
                         **kwargs)

class M3ExpressiveCard(ctk.CTkFrame):
    """Card elevada con tinte y hover animado (simula elevation expressive)"""
    def __init__(self, parent, tinted=False, **kwargs):
        fg = CTK_THEME["surface_bright"] if tinted else CTK_THEME["surface"]
        super().__init__(parent,
                         fg_color=fg,
                         corner_radius=SHAPES["extra_large"],
                         border_width=0,
                         **kwargs)
        # hover elevation simulation
        self._base_fg = fg
        self._hover_fg = CTK_THEME["surface_highest"] if not tinted else M3_EXPRESSIVE["surface_container_bright"]
        self.bind("<Enter>", self._on_enter)
        self.bind("<Leave>", self._on_leave)

    def _on_enter(self, e):
        try:
            self.configure(fg_color=self._hover_fg, border_width=1, border_color=CTK_THEME["primary"])
        except: pass
    def _on_leave(self, e):
        try:
            self.configure(fg_color=self._base_fg, border_width=0)
        except: pass

# ------------------------------------------------------------------
# Buttons — Expressive (pill 28, bolder, larger)
# ------------------------------------------------------------------
class M3FilledButton(ctk.CTkButton):
    def __init__(self, parent, **kwargs):
        super().__init__(parent,
                         fg_color=CTK_THEME["primary"],
                         hover_color=CTK_THEME["primary_hover"],
                         text_color=CTK_THEME["on_primary"],
                         corner_radius=SHAPES["fab"],  # pill expressive
                         height=40,  # larger (was 36)
                         font=ctk.CTkFont(family="Roboto Medium", size=14, weight="bold"),
                         **kwargs)
        self._add_hover_scale()

    def _add_hover_scale(self):
        def on_enter(e):
            self.configure(border_width=0)
        def on_leave(e):
            pass
        self.bind("<Enter>", on_enter, add="+")
        self.bind("<Leave>", on_leave, add="+")

class M3ExpressiveFAB(ctk.CTkButton):
    """FAB extendido expressive — 56dp alto, pill, sombra simulada, icono grande"""
    def __init__(self, parent, text="▶  Activar", **kwargs):
        super().__init__(parent,
                         text=text,
                         fg_color=CTK_THEME["primary"],
                         hover_color=CTK_THEME["primary_hover"],
                         text_color=CTK_THEME["on_primary"],
                         corner_radius=SHAPES["fab"],
                         height=48,  # expressive FAB taller
                         width=170,
                         font=ctk.CTkFont(family="Roboto", size=14, weight="bold"),
                         border_width=0,
                         **kwargs)

class M3TonalButton(ctk.CTkButton):
    def __init__(self, parent, **kwargs):
        super().__init__(parent,
                         fg_color=CTK_THEME["secondary"],
                         hover_color=CTK_THEME["secondary_hover"],
                         text_color=CTK_THEME["on_surface"],
                         corner_radius=SHAPES["fab"],
                         height=40,
                         font=ctk.CTkFont(family="Roboto", size=13, weight="bold"),
                         **kwargs)

class M3OutlinedButton(ctk.CTkButton):
    def __init__(self, parent, **kwargs):
        super().__init__(parent,
                         fg_color="transparent",
                         hover_color=CTK_THEME["surface_high"],
                         text_color=CTK_THEME["primary"],
                         border_width=1.5,  # thicker expressive
                         border_color=CTK_THEME["outline"],
                         corner_radius=SHAPES["fab"],
                         height=40,
                         font=ctk.CTkFont(family="Roboto Medium", size=13),
                         **kwargs)

class M3TertiaryButton(ctk.CTkButton):
    """New: vibrant tertiary button (M3 Expressive uses tertiary for playful actions)"""
    def __init__(self, parent, **kwargs):
        super().__init__(parent,
                         fg_color=CTK_THEME["tertiary_container"] if "tertiary_container" in CTK_THEME else M3_EXPRESSIVE["tertiary_container"],
                         hover_color=M3_EXPRESSIVE["tertiary"],
                         text_color=M3_EXPRESSIVE["on_tertiary_container"],
                         corner_radius=SHAPES["fab"],
                         height=36,
                         font=ctk.CTkFont(family="Roboto Medium", size=13, weight="bold"),
                         **kwargs)

# ------------------------------------------------------------------
# Chips — Pill expressive with more playful borders
# ------------------------------------------------------------------
class M3Chip(ctk.CTkFrame):
    def __init__(self, parent, text, selected=False, command=None, **kwargs):
        bg = CTK_THEME["primary"] if selected else "transparent"
        border = CTK_THEME["primary"] if selected else CTK_THEME["outline"]
        super().__init__(parent,
                         fg_color=bg,
                         border_width=1.5,
                         border_color=border,
                         corner_radius=SHAPES["pill"],
                         height=32,
                         **kwargs)
        tc = CTK_THEME["on_primary"] if selected else CTK_THEME["on_surface"]
        self.label = ctk.CTkLabel(self, text=text,
                                  text_color=tc,
                                  font=ctk.CTkFont(family="Roboto Medium", size=12, weight="bold"))
        self.label.pack(padx=14, pady=7)
        if command:
            self.bind("<Button-1>", lambda e: command())
            self.label.bind("<Button-1>", lambda e: command())

class M3ExpressiveChip(ctk.CTkFrame):
    """Chip pill grande con icono opcional y fondo tonal (expressive)"""
    def __init__(self, parent, text, icon="", selected=False, **kwargs):
        bg = CTK_THEME["primary_container"] if selected else CTK_THEME["secondary"]
        tc = CTK_THEME["on_primary_container"] if selected else CTK_THEME["on_surface"]
        super().__init__(parent,
                         fg_color=bg,
                         border_width=0,
                         corner_radius=SHAPES["pill"],
                         height=36,
                         **kwargs)
        display = f"{icon}  {text}" if icon else text
        self.label = ctk.CTkLabel(self, text=display,
                                  text_color=tc,
                                  font=ctk.CTkFont(family="Roboto", size=12, weight="bold"))
        self.label.pack(padx=16, pady=8)

# ------------------------------------------------------------------
# Switch Row — Expressive with larger typography
# ------------------------------------------------------------------
class M3SwitchRow(ctk.CTkFrame):
    def __init__(self, parent, title, subtitle, initial=False, command=None, **kwargs):
        super().__init__(parent, fg_color="transparent", **kwargs)
        left = ctk.CTkFrame(self, fg_color="transparent")
        left.pack(side="left", fill="x", expand=True)
        ctk.CTkLabel(left, text=title, font=ctk.CTkFont(size=14, weight="bold"),
                     text_color=CTK_THEME["on_surface"]).pack(anchor="w")
        if subtitle:
            ctk.CTkLabel(left, text=subtitle, font=ctk.CTkFont(size=11),
                         text_color=CTK_THEME["on_surface_variant"]).pack(anchor="w")
        self.switch = ctk.CTkSwitch(self, text="",
                                    progress_color=CTK_THEME["primary"],
                                    button_color="#FFFFFF",
                                    button_hover_color="#EADDFF",
                                    command=command)
        if initial:
            self.switch.select()
        self.switch.pack(side="right")

    def get(self):
        return self.switch.get() == 1

# ------------------------------------------------------------------
# Mapping Row — Expressive: taller, larger chips, tertiary arrow
# ------------------------------------------------------------------
class MappingRow(ctk.CTkFrame):
    """Fila de mapeo expressive — 60dp alto, chips 36dp, flecha terciaria vibrante"""
    def __init__(self, parent, src, dst, on_delete=None, **kwargs):
        super().__init__(parent,
                         fg_color=CTK_THEME["surface_high"],
                         corner_radius=SHAPES["large"],  # 20 expressive
                         height=60,
                         **kwargs)
        self.src = src
        self.dst = dst
        # Src chip — surface_highest, larger pill
        src_frame = ctk.CTkFrame(self, fg_color=CTK_THEME["surface_highest"], corner_radius=SHAPES["pill"], width=104, height=36)
        src_frame.pack(side="left", padx=(14, 8), pady=12)
        src_frame.pack_propagate(False)
        ctk.CTkLabel(src_frame, text=src, font=ctk.CTkFont(family="Roboto", size=13, weight="bold"),
                     text_color=CTK_THEME["on_surface"]).pack(expand=True)
        # Arrow — tertiary expressive more vibrant
        arrow_color = M3_EXPRESSIVE["tertiary"] if "tertiary" in CTK_THEME else CTK_THEME["primary"]
        ctk.CTkLabel(self, text="→", font=ctk.CTkFont(size=20, weight="bold"),
                     text_color=arrow_color).pack(side="left", padx=8)
        # Dst chip — primary pill grande
        dst_frame = ctk.CTkFrame(self, fg_color=CTK_THEME["primary"], corner_radius=SHAPES["pill"], width=104, height=36)
        dst_frame.pack(side="left", padx=(8, 14), pady=12)
        dst_frame.pack_propagate(False)
        ctk.CTkLabel(dst_frame, text=dst, font=ctk.CTkFont(family="Roboto", size=13, weight="bold"),
                     text_color=CTK_THEME["on_primary"]).pack(expand=True)
        # Delete — pill 36
        if on_delete:
            del_btn = ctk.CTkButton(self, text="✕", width=36, height=36,
                                    fg_color="transparent",
                                    hover_color=M3_EXPRESSIVE["error_container"],
                                    text_color=CTK_THEME["on_surface_variant"],
                                    corner_radius=SHAPES["pill"],
                                    command=lambda: on_delete(src))
            del_btn.pack(side="right", padx=8)

class MappingRowExpressive(ctk.CTkFrame):
    """Variante aún more expressive con badge de swap y hover scale"""
    def __init__(self, parent, src, dst, on_delete=None, on_swap=None, accent=None, **kwargs):
        super().__init__(parent,
                         fg_color=CTK_THEME["surface_high"],
                         corner_radius=SHAPES["large"],
                         border_width=0,
                         height=62,
                         **kwargs)
        self.bind("<Enter>", lambda e: self.configure(border_width=1, border_color=CTK_THEME["outline_variant"]))
        self.bind("<Leave>", lambda e: self.configure(border_width=0))

        # Src — tonal con borde
        src_frame = ctk.CTkFrame(self, fg_color=CTK_THEME["surface_bright"], corner_radius=SHAPES["pill"], width=96, height=34, border_width=1, border_color=CTK_THEME["outline_variant"])
        src_frame.pack(side="left", padx=(12, 6), pady=14)
        src_frame.pack_propagate(False)
        ctk.CTkLabel(src_frame, text=src, font=ctk.CTkFont(family="Roboto Black", size=12),
                     text_color=CTK_THEME["on_surface"]).pack(expand=True)

        # Flecha con contenedor terciary pill
        arrow_bg = ctk.CTkFrame(self, fg_color=M3_EXPRESSIVE["tertiary_container"], corner_radius=SHAPES["pill"], width=32, height=32)
        arrow_bg.pack(side="left", padx=4)
        arrow_bg.pack_propagate(False)
        ctk.CTkLabel(arrow_bg, text="→", font=ctk.CTkFont(size=14, weight="bold"),
                     text_color=M3_EXPRESSIVE["on_tertiary_container"]).pack(expand=True)

        # Dst — primary expressive
        dst_frame = ctk.CTkFrame(self, fg_color=CTK_THEME["primary"], corner_radius=SHAPES["pill"], width=96, height=34)
        dst_frame.pack(side="left", padx=(6, 12), pady=14)
        dst_frame.pack_propagate(False)
        ctk.CTkLabel(dst_frame, text=dst, font=ctk.CTkFont(family="Roboto Black", size=12),
                     text_color=CTK_THEME["on_primary"]).pack(expand=True)

        # Swap
        if on_swap:
            btn_swap = ctk.CTkButton(self, text="⇄", width=32, height=32, corner_radius=SHAPES["pill"],
                                     fg_color=CTK_THEME["surface_highest"], hover_color=CTK_THEME["surface_bright"],
                                     text_color=CTK_THEME["on_surface_variant"], border_width=1, border_color=CTK_THEME["outline_variant"],
                                     command=lambda: on_swap(src, dst))
            btn_swap.pack(side="right", padx=(0, 4))

        if on_delete:
            btn_del = ctk.CTkButton(self, text="✕", width=32, height=32,
                                    fg_color="transparent", hover_color=M3_EXPRESSIVE["error_container"],
                                    text_color=CTK_THEME["on_surface_variant"], corner_radius=SHAPES["pill"],
                                    command=lambda: on_delete(src))
            btn_del.pack(side="right", padx=6)
