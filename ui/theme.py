"""
Lefty - Material You Monochrome (Google M3 Monochrome 2025)
Paleta neutra profesional, agradable, organizada. Basado en Material You Monochrome.
Tonal greys con chroma 4, sin saturación, elegante para gaming pro.
"""
# Monochrome Dark - neutral 6..90, pleasant warm grey
M3_MONOCHROME = {
    "primary": "#C8C5D0",  # neutral 80 - soft grey-violet
    "on_primary": "#2F2E33",
    "primary_container": "#45444C",
    "primary_container_bright": "#4F4E57",
    "on_primary_container": "#E6E1EC",
    "secondary": "#C5C4CB",
    "on_secondary": "#2E2E33",
    "secondary_container": "#3A393F",
    "on_secondary_container": "#E6E1EC",
    "tertiary": "#C0C0C7",  # neutral 80
    "on_tertiary": "#2B2B30",
    "tertiary_container": "#3F3F45",
    "on_tertiary_container": "#E4E1E9",
    "error": "#FFB4AB",
    "on_error": "#690005",
    "error_container": "#93000A",
    "on_error_container": "#FFDAD6",
    "background": "#131316",  # neutral 6
    "on_background": "#E6E1EC",
    "surface": "#131316",
    "on_surface": "#E6E1EC",
    "surface_variant": "#46464F",
    "on_surface_variant": "#C7C5D0",
    "surface_tint": "#1A1A1E",
    "surface_container": "#1E1E24",  # neutral 10
    "surface_container_high": "#28282F",  # neutral 17
    "surface_container_highest": "#33333A",  # neutral 22
    "surface_container_bright": "#3B3A42",
    "outline": "#77767E",
    "outline_variant": "#46464F",
    "scrim": "#000000",
    "inverse_surface": "#E6E1EC",
    "inverse_on_surface": "#313033",
    "inverse_primary": "#5E5D67",
    # Monochrome extras - subtle
    "success": "#BEC6B8",
    "success_container": "#2E352A",
    "warning": "#D0C5B4",
    "warning_container": "#3A2F1F",
}

# Alias para compatibilidad
M3_DARK = M3_MONOCHROME
M3_EXPRESSIVE = M3_MONOCHROME
M3_LIGHT = {
    "primary": "#5E5D67",
    "on_primary": "#FFFFFF",
    "primary_container": "#E6E1EC",
    "on_primary_container": "#1A1A1E",
    "background": "#FFFBFF",
    "surface": "#FFFBFF",
    "surface_container": "#F0EEF4",
    "surface_container_high": "#EAE8EE",
    "outline": "#77767E",
}

# CustomTkinter mapping — Monochrome profesional
CTK_THEME = {
    "bg": M3_MONOCHROME["background"],
    "surface": M3_MONOCHROME["surface_container"],
    "surface_high": M3_MONOCHROME["surface_container_high"],
    "surface_highest": M3_MONOCHROME["surface_container_highest"],
    "surface_bright": M3_MONOCHROME["surface_container_bright"],
    "surface_tint": M3_MONOCHROME["surface_tint"],
    "primary": M3_MONOCHROME["primary"],
    "primary_hover": "#D0CEDA",
    "primary_container": M3_MONOCHROME["primary_container"],
    "primary_container_bright": M3_MONOCHROME["primary_container_bright"],
    "on_primary": M3_MONOCHROME["on_primary"],
    "on_primary_container": M3_MONOCHROME["on_primary_container"],
    "secondary": M3_MONOCHROME["secondary_container"],
    "secondary_hover": "#45444C",
    "tertiary": M3_MONOCHROME["tertiary"],
    "tertiary_hover": "#C8C8D0",
    "tertiary_container": M3_MONOCHROME["tertiary_container"],
    "outline": M3_MONOCHROME["outline"],
    "outline_variant": M3_MONOCHROME["outline_variant"],
    "on_surface": M3_MONOCHROME["on_surface"],
    "on_surface_variant": M3_MONOCHROME["on_surface_variant"],
    "error": M3_MONOCHROME["error"],
    "error_container": M3_MONOCHROME["error_container"],
    "success": M3_MONOCHROME["success"],
    "success_container": M3_MONOCHROME["success_container"],
    "warning": M3_MONOCHROME["warning"],
    "warning_container": M3_MONOCHROME["warning_container"],
}

# Alias para compatibilidad con código viejo que usa M3_EXPRESSIVE
M3_EXPRESSIVE = M3_MONOCHROME

# Shapes — profesional, sutil, organizado (no playful 28dp)
SHAPES = {
    "extra_small": 6,
    "small": 8,
    "medium": 12,
    "large": 12,
    "extra_large": 16,  # cards profesionales
    "pill": 999,
    "fab": 16,
}

FONTS = {
    "display_large": ("Segoe UI", 32),
    "display_medium": ("Segoe UI", 26),
    "headline_large": ("Segoe UI", 22),
    "headline_medium": ("Segoe UI", 18),
    "title_large": ("Segoe UI Semibold", 16),
    "title_medium": ("Segoe UI Semibold", 13),
    "title_small": ("Segoe UI Semibold", 12),
    "body_large": ("Segoe UI", 13),
    "body_medium": ("Segoe UI", 11),
    "body_small": ("Segoe UI", 10),
    "label_large": ("Segoe UI Semibold", 12),
    "label_medium": ("Segoe UI Semibold", 11),
    "label_small": ("Segoe UI", 10),
}

# Tipografía profesional — Segoe UI (Windows nativo) sobria
FONTS_EXPRESSIVE = {
    "display_large": ("Segoe UI Semibold", 26),
    "display_small": ("Segoe UI Semibold", 20),
    "headline_large": ("Segoe UI Semibold", 18),
    "headline_small": ("Segoe UI", 14),
    "title_large": ("Segoe UI Semibold", 16),
    "title_medium": ("Segoe UI Semibold", 13),
    "title_small": ("Segoe UI Semibold", 11),
    "label_expressive": ("Segoe UI Semibold", 10),
    "body_large": ("Segoe UI", 11),
    "body_medium": ("Segoe UI", 10),
    "body_small": ("Segoe UI", 9),
    "label_large": ("Segoe UI Semibold", 11),
    "label_medium": ("Segoe UI Semibold", 10),
    "label_small": ("Segoe UI", 9),
    "counter_large": ("Segoe UI Semibold", 22),
}
