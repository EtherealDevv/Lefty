"""
Lefty Benchmark - Mide latencia del hook
Similar a como Lefty
"""
import time, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import engine.remapper as rem_module
# Benchmark usa engine in-process para medir latencia real (proxy aislado no comparte stats)
rem_module.USE_ISOLATED_ENGINE = False
# Limpiar singleton si ya existe como proxy
rem_module._global_remapper = None
from engine.remapper import get_remapper
from core.profile import BUILTIN_PROFILES, profile_to_vk_map

r = get_remapper()
m = profile_to_vk_map(BUILTIN_PROFILES['zurdo_ijkl'])
r.set_mappings(m)
r.enable_latency_measure(True)
r.start()
print("[Benchmark] Hook activo. Presiona teclas mapeadas (W,A,S,D) durante 5s...")
print("[Benchmark] Midiendo latencia WH_KEYBOARD_LL hook...")
time.sleep(5)
avg = r.get_avg_latency()
print(f"[Benchmark] Latencia promedio: {avg:.3f} ms")
print(f"[Benchmark] Stats: {r.stats}")
r.stop()
print("[Benchmark] Fin. Comparativa:")
print("  Registry (SharpKeys): 0ms (requiere reboot)")
print("  Interception driver: ~0.5ms")
print(f"  LL Hook Lefty: ~{avg:.2f}ms (este test)")
print("  AutoHotkey: 5-15ms")
