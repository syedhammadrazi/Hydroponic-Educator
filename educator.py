from __future__ import annotations
import json
import os
import threading
import time
import random
import math
from typing import Dict, Any, Optional


class HydroGameEngine:

    def __init__(self, city: str, month: str, crop: str, data_dir: str = "data") -> None:
        self.city = city
        self.month = month
        self.crop = crop
        self.data_dir = data_dir
        self.prompt_ttl_ms = 15000  # user has 15 seconds to act

        # Runtime flags/state
        self.paused: bool = False
        self.running: bool = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.RLock()

        # --- pacing knobs ---
        self.ec_update_every_hours = 3
        self.ph_update_every_hours = 6
        self.temp_update_hours = [8, 18]
        self.humidity_update_hours = [12]

        # Monotonic tick (one per simulate_tick) + last-update ticks
        self._tick = 0
        self._last_ec_tick = -10**9
        self._last_ph_tick = -10**9

        self._last_temp_marks = set()  # {(day, hour)}
        self._last_humid_marks = set()

        # --- single active prompt (anti-spam) ---
        self.min_prompt_gap_sec = 5
        self.active_prompt: Optional[Dict[str, Any]] = None  # {"key","label","expires_at"}
        self._next_prompt_allowed_at = 0

        # Per-key cooldown (re-raise while condition persists; reset when OK)
        self._prompt_last: Dict[str, int] = {}  # key -> last_raised_ms
        self.prompt_cooldown_ms = 8000

        # Grace-window penalties (apply ONLY if prompt is missed)
        self.default_penalty = 0.5
        self.penalty_table = {
            "water_low": 1.0,
            "ec_low": 0.6, "ec_high": 0.6,
            "ph_out": 0.6,
            "humidity_low": 0.5, "humidity_high": 0.5,
            "temp_low": 0.5, "temp_high": 0.5,
        }
        # Light hints should never penalize health if ignored
        self.penalty_table.update({
            "light_on": 0.2,  # CHANGED from 0.0 → 0.2
        })

        self._pending_penalties: Dict[str, float] = {}

        # For user-controlled temperature nudges
        self.temp_offset: float = 0.0  # -5 .. +5
        self.inside: bool = False

        # Lock model/jitter after a direct user nudge
        self._temp_user_lock_until_tick: int = -1

        # ---- Load static data ----
        self.climate: Dict[str, Any] = self._load_json("climate.json")[city][month]
        self.crops: Dict[str, Any] = self._load_json("crops.json")[crop]
        self.category: Dict[str, Any] = self._load_json("categories.json")[crop]
        self.uptake: Dict[str, Any] = self._load_uptake_json()[crop]  # stage -> { days:[start,end], ... }
        self.yield_info: Dict[str, Any] = self._load_json("yield.json")[crop]

        # ---- Climate envelope ----
        self.min_temp: float = float(self.climate["low_temp"])
        self.max_temp: float = float(self.climate["high_temp"])
        self.current_temp: float = float(self.climate["mean_temp"])
        self.current_humidity: float = float(self.climate["humidity"])

        # ---- Clock & stage ----
        self.day: int = 0
        self.hour: int = 0
        self.stage: str = "Seedling"
        self.light_on: bool = False
        self.daily_light_hours: int = 0

        # ---- Crop stats ----
        self.water_level: float = 100.0
        self.ec: float = float(self.crops["ec_range"][1])
        self.ph: float = float(self.crops["ph_range"][1])
        self.health: float = 100.0

        # ---- Streams ----
        self.notifications: list[str] = []
        self.feedback: list[str] = []
        self.logs: list[Dict[str, Any]] = []

    def _load_json(self, filename: str) -> Dict[str, Any]:
        path = os.path.join(self.data_dir, filename)
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _load_uptake_json(self) -> Dict[str, Any]:
        for fname in ("uptake.json", "update.json"):
            try:
                return self._load_json(fname)
            except FileNotFoundError:
                continue
        raise FileNotFoundError("Neither 'data/uptake.json' nor 'data/update.json' was found.")

    # ---------------------- Stage / helpers ----------------------

    def get_stage(self) -> str:
        for stage, values in self.uptake.items():
            ds = values.get("days", [0, 0])
            if ds[0] <= self.day <= ds[1]:
                return stage
        return "Harvestable"

    def _last_stage_end(self) -> int:
        return max(int(v.get("days", [0, 0])[1]) for v in self.uptake.values())

    @staticmethod
    def _clamp(n: float, a: float, b: float) -> float:
        return max(a, min(b, n))

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    # ---------------------- Prompt helpers ----------------------

    def _maybe_raise_prompt(self, key: str, label: str, duration_ms: int | None = None):
        """Raise 'key' if (a) no prompt active, (b) global gap respected, (c) per-key cooldown elapsed)."""
        now = self._now_ms()
        if self.active_prompt is not None:
            return
        if now < self._next_prompt_allowed_at:
            return
        last = self._prompt_last.get(key, 0)
        if last and (now - last) < self.prompt_cooldown_ms:
            return

        ttl = int(duration_ms if duration_ms is not None else self.prompt_ttl_ms)
        self.active_prompt = {"key": key, "label": label, "expires_at": now + ttl}
        self._prompt_last[key] = now

        # stage a pending penalty to apply only if missed
        if key not in self._pending_penalties:
            self._pending_penalties[key] = float(self.penalty_table.get(key, self.default_penalty))

    def resolve_prompt(self, acted: bool) -> None:
        """Call this when the user acted to cancel penalty and release the gate."""
        key = self.active_prompt.get("key") if self.active_prompt else None
        if acted and key in self._pending_penalties:
            self._pending_penalties.pop(key, None)
            self.feedback.append("Action handled in time.")
        self.active_prompt = None
        self._next_prompt_allowed_at = self._now_ms() + self.min_prompt_gap_sec * 1000

    def prompt_missed(self) -> None:
        """Apply staged penalty because the prompt expired without action."""
        if not self.active_prompt:
            return
        key = self.active_prompt["key"]
        penalty = float(self._pending_penalties.pop(key, self.penalty_table.get(key, self.default_penalty)))
        self.health = round(self._clamp(self.health - penalty, 0.0, 100.0), 2)
        self.feedback.append(f"⏳ Missed: {self.active_prompt['label']} (−{penalty:.2f} health)")
        self.active_prompt = None
        self._next_prompt_allowed_at = self._now_ms() + self.min_prompt_gap_sec * 1000

    def _clear_prompt_cooldown_if_ok(self, key: str, is_ok: bool) -> None:
        if is_ok and key in self._prompt_last:
            self._prompt_last.pop(key, None)

    def reset_to_stage_ideals(self) -> None:
        with self._lock:
            ec_min, ec_max = map(float, self.crops["ec_range"])
            ph_min, ph_max = map(float, self.crops["ph_range"])
            self.ec = round((ec_min + ec_max) / 2.0, 2)
            self.ph = round((ph_min + ph_max) / 2.0, 2)
            self.water_level = 100.0
            self.resolve_prompt(acted=True)
            self.notifications.clear()
            self.feedback.append(f"Reset to {self.stage} ideals (water 100%, EC & pH normalized).")

    def advance_to_next_stage(self) -> str:
        with self._lock:
            stages = list(self.uptake.keys())
            current = self.get_stage()
            i = stages.index(current) if current in stages else -1
            nxt = stages[min(len(stages) - 1, i + 1)]
            self.day = int(self.uptake[nxt]["days"][0])
            self.stage = nxt
            # --- keep ticks aligned with day/hour ---
            self._tick = self.day * 24
            self.hour = 0
            # ---------------------------------------
            self.reset_to_stage_ideals()
            msg = f"➡️ Advanced from {current} to {nxt}. Values reset to {nxt} ideals."
            self.feedback.append(msg)
            return msg

    # ---------------------- Public controls ----------------------

    def pause_simulation(self) -> None:
        with self._lock:
            self.paused = True

    def resume_simulation(self) -> None:
        with self._lock:
            self.paused = False

    def start_simulation(self, speed: float = 2.5) -> None:
        with self._lock:
            if self.running and self._thread and self._thread.is_alive():
                return
            self.running = True

            def _loop():
                try:
                    while self.running and self.stage != "Harvestable" and self.health > 0:
                        if self.paused:
                            time.sleep(0.5)
                            continue
                        try:
                            self.simulate_tick()
                        except Exception as e:
                            # keep the thread alive and surface the issue to the UI
                            self.feedback.append(f"Simulation error: {type(e).__name__}: {e}")
                        time.sleep(max(0.05, float(speed)))
                finally:
                    self.feedback.append("Simulation ended.")
                    if self.stage == "Harvestable":
                        result = self.calculate_yield()
                        self.feedback.append(
                            f"Final yield: {result['yield_kg']} kg at {result['health']}% health."
                        )

            self._thread = threading.Thread(target=_loop, name="HydroSim", daemon=True)
            self._thread.start()

    def stop_simulation(self) -> None:
        with self._lock:
            self.running = False
        t = self._thread
        if t and t.is_alive():
            t.join(timeout=1.0)

    def toggle_light(self, status: bool) -> None:
        with self._lock:
            self.light_on = bool(status)
            self.feedback.append(f"Light turned {'on' if status else 'off'}.")

    def refill_water(self) -> None:
        with self._lock:
            self.water_level = 100.0
            self.feedback.append("Water is refilled.")

    def normalize_ec(self) -> None:
        with self._lock:
            ideal = self.crops["ec_range"]
            old = self.ec
            self.ec = round((float(ideal[0]) + float(ideal[1])) / 2.0, 2)
            self.feedback.append(f"EC is normalized: {old:.2f} → {self.ec:.2f}")

    def normalize_ph(self) -> None:
        with self._lock:
            ideal = self.crops["ph_range"]
            old = self.ph
            self.ph = round((float(ideal[0]) + float(ideal[1])) / 2.0, 2)
            self.feedback.append(f"pH is normalized: {old:.2f} → {self.ph:.2f}")

    def spray_mist(self) -> None:
        with self._lock:
            self.current_humidity = round(self._clamp(self.current_humidity + 5.0, 0, 100), 2)
            self.feedback.append("Water is sprayed: Humidity increased.")

    def turn_on_dehumidifier(self) -> None:
        with self._lock:
            self.current_humidity = round(self._clamp(self.current_humidity - 10.0, 0, 100), 2)
            self.feedback.append("Dehumidified : Humidity decreased.")

    def move_to_shade(self) -> None:
        with self._lock:
            self.temp_offset = max(-5.0, self.temp_offset - 4.0)
            self.inside = True
            # deterministic nudge + short lock
            self.current_temp = round(self.current_temp - 6.0, 2)
            self._temp_user_lock_until_tick = self._tick + 3
            self.feedback.append("Cooled down : Temperature decreased.")

    def move_to_sunlight(self) -> None:
        with self._lock:
            self.temp_offset = min(5.0, self.temp_offset + 4.0)
            self.inside = False
            # deterministic nudge + short lock
            self.current_temp = round(self.current_temp + 4.0, 2)
            self._temp_user_lock_until_tick = self._tick + 3
            self.feedback.append("Heated up: Temperature increased.")

    # ---------------------- Simulation tick ----------------------

    def simulate_tick(self) -> None:
        with self._lock:
            # End the sim at the last stage end (no explicit "Harvestable" in data)
            if self.day >= self._last_stage_end():
                self.stage = "Harvestable"
                return

            # Stage
            self.stage = self.get_stage()
            uptake = self.uptake.get(self.stage, {"ec_reduction": 0, "ph_drift": 0, "water_uptake": 0})

            # Water per hour
            water_drop = float(uptake.get("water_uptake", 0.0))
            self.water_level = max(0.0, round(self.water_level - water_drop, 2))

            # EC drift on monotonic ticks
            if (self._tick - self._last_ec_tick) >= self.ec_update_every_hours:
                self._last_ec_tick = self._tick
                self._drift_ec_once()

            # pH drift on monotonic ticks
            if (self._tick - self._last_ph_tick) >= self.ph_update_every_hours:
                self._last_ph_tick = self._tick
                self._drift_ph_once()

            # Temperature: respect short user lock, otherwise follow schedule/jitter
            if self._tick < self._temp_user_lock_until_tick:
                pass  # keep user's last direct nudge intact for a few ticks
            else:
                # Temperature at scheduled hours; small jitter otherwise
                if (self.day, self.hour) not in self._last_temp_marks and self.hour in self.temp_update_hours:
                    self._last_temp_marks.add((self.day, self.hour))
                    self._update_temperature_once()
                else:
                    self.current_temp = round(self.current_temp + random.uniform(-0.2, 0.2), 2)

            # Humidity at scheduled hour; small jitter otherwise
            if (self.day, self.hour) not in self._last_humid_marks and self.hour in self.humidity_update_hours:
                self._last_humid_marks.add((self.day, self.hour))
                self._update_humidity_once()
            else:
                self.current_humidity = round(self._clamp(self.current_humidity + random.uniform(-0.2, 0.2), 0.0, 100.0), 2)

            # --- LIGHT: do this BEFORE prompts so state is fresh ---
            self.notifications.clear()

            sunlight_h = int(self.climate.get("sunlight", 0))
            if self.hour < sunlight_h:
                self.daily_light_hours += 2   # 1 tick = 2h
            elif self.light_on:
                self.daily_light_hours += 2

            req_light = int(self.crops.get("light_needs", [0])[0])
            if self.light_on and self.daily_light_hours >= req_light:
                self.light_on = False
                self.feedback.append("Required daily light met — grow light turned off.")

            # Now evaluate prompts/notifications with up-to-date state
            self._check_conditions_with_prompts()

            # Advance clock
            self._tick += 1
            self.hour += 2
            if self.hour >= 24:
                self.hour = 0
                self.day += 1
                # no end-of-day light audit/penalty
                self.daily_light_hours = 0
                self._last_temp_marks.clear()
                self._last_humid_marks.clear()

            self.logs.append(self.get_status())

    # ---------------------- One-shot drift/update helpers ----------------------

    def _drift_ec_once(self) -> None:
        stage = self.get_stage()
        drop = float(self.uptake.get(stage, {}).get("ec_reduction", 0.0))
        self.ec = max(0.0, round(self.ec - drop, 2))

    def _drift_ph_once(self) -> None:
        stage = self.get_stage()
        drift = float(self.uptake.get(stage, {}).get("ph_drift", 0.0))
        self.ph = round(self._clamp(self.ph + drift, 3.0, 9.0), 2)

    def _update_temperature_once(self) -> None:
        # Outdoor baseline from city climate (daily sine wave)
        angle = (self.hour / 24.0) * 2.0 * math.pi
        wave = math.sin(angle)
        outdoor = self.min_temp + (self.max_temp - self.min_temp) * (wave + 1.0) / 2.0

        if self.inside:
            # Realistic indoor approximation:
            # • Hot months: ~6°C cooler, but not below 24°C
            # • Cold months: ~4°C warmer, but not above 18°C
            # • Mild: ~2°C cooler
            if outdoor >= 30.0:
                indoor = max(24.0, outdoor - 6.0)
            elif outdoor <= 10.0:
                indoor = min(18.0, outdoor + 4.0)
            else:
                indoor = outdoor - 2.0
            self.current_temp = round(indoor + self.temp_offset + random.uniform(-0.5, 0.5), 2)
        else:
            self.current_temp = round(outdoor + self.temp_offset + random.uniform(-0.5, 0.5), 2)

    def _update_humidity_once(self) -> None:
        self.current_humidity = round(self._clamp(self.current_humidity + random.uniform(-2.0, 2.0), 0.0, 100.0), 2)

    # ---------------------- Conditions → notifications + single prompt ----------------------

    def _check_conditions_with_prompts(self) -> None:
        ideal = self.crops
        sunlight_h = int(self.climate.get("sunlight", 0))
        req_light = int(self.crops.get("light_needs", [0])[0])

        # Water
        water_bad = self.water_level < 20.0
        if water_bad:
            label = "Water tank is low! 'Refill Water'."
            self.notifications.append(label)
            self._maybe_raise_prompt("water_low", label)
        self._clear_prompt_cooldown_if_ok("water_low", not water_bad)

        # EC
        ec_min, ec_max = float(ideal["ec_range"][0]), float(ideal["ec_range"][1])
        ec_low = self.ec < ec_min
        ec_high = self.ec > ec_max
        if ec_low:
            label = "EC too low. 'Normalize EC'"
            self.notifications.append(label)
            self._maybe_raise_prompt("ec_low", label)
        self._clear_prompt_cooldown_if_ok("ec_low", not ec_low)
        if ec_high:
            label = "EC too high. 'Normalize EC'"
            self.notifications.append(label)
            self._maybe_raise_prompt("ec_high", label)
        self._clear_prompt_cooldown_if_ok("ec_high", not ec_high)

        # pH
        ph_min, ph_max = float(ideal["ph_range"][0]), float(ideal["ph_range"][1])
        ph_bad = (self.ph < ph_min) or (self.ph > ph_max)
        if ph_bad:
            label = "pH is drifting. 'Normalize pH'"
            self.notifications.append(label)
            self._maybe_raise_prompt("ph_out", label)
        self._clear_prompt_cooldown_if_ok("ph_out", not ph_bad)

        # Humidity
        hum_min, hum_max = float(ideal["humidity"][0]), float(ideal["humidity"][1])
        hum_low = self.current_humidity < hum_min
        hum_high = self.current_humidity > hum_max
        if hum_low:
            label = f"Air is too dry ({self.current_humidity:.1f}%). Spray Water."
            self.notifications.append(label)
            self._maybe_raise_prompt("humidity_low", label)
        self._clear_prompt_cooldown_if_ok("humidity_low", not hum_low)
        if hum_high:
            label = f"Air is too humid ({self.current_humidity:.1f}%). Dehumidify."
            self.notifications.append(label)
            self._maybe_raise_prompt("humidity_high", label)
        self._clear_prompt_cooldown_if_ok("humidity_high", not hum_high)

        # Temperature (crop comfort range) — no light prompt here
        t_min, t_max = float(ideal["temperature"][0]), float(ideal["temperature"][1])
        t_low = self.current_temp < t_min
        t_high = self.current_temp > t_max

        if t_low:
            label = f"Temperature {self.current_temp:.1f}°C — too low. Increase heating."
            self.notifications.append(label)
            self._maybe_raise_prompt("temp_low", label)
        self._clear_prompt_cooldown_if_ok("temp_low", not t_low)

        if t_high:
            label = f"Temperature {self.current_temp:.1f}°C — too high. Increase cooling."
            self.notifications.append(label)
            self._maybe_raise_prompt("temp_high", label)
        self._clear_prompt_cooldown_if_ok("temp_high", not t_high)

        # =========================
        # Light sufficiency logic (projection-based) — single prompt
        # =========================
        remaining_sunlight = max(0, sunlight_h - self.hour)
        projected_total = self.daily_light_hours + remaining_sunlight

        # If today's natural light won't be enough and light is OFF → prompt to turn ON
        if projected_total < req_light and not self.light_on:
            label = f"Not enough daylight to reach {req_light} hours — tap 'Turn On Light'."
            self.notifications.append(label)
            self._maybe_raise_prompt("light_on", label)
        else:
            self._clear_prompt_cooldown_if_ok("light_on", True)

        # No per-tick health penalties (only on missed prompts)
        self.health = round(self._clamp(self.health, 0.0, 100.0), 2)

    # ---------------------- Reporting & Persistence ----------------------

    def calculate_yield(self) -> Dict[str, Any]:
        yield_per_plant = float(self.yield_info.get("yield_per_plant", 0.0))
        final_yield = round((yield_per_plant * self.health) / 100.0, 3)
        return {
            "crop": self.crop,
            "health": round(self.health, 2),
            "yield_kg": final_yield,
            "weeks_per_harvest": self.yield_info.get("weeks_per_harvest", "N/A")
        }

    def get_status(self) -> Dict[str, Any]:
        return {
            "day": self.day,
            "hour": self.hour,
            "stage": self.stage,
            "light_on": self.light_on,
            "light_today": self.daily_light_hours,
            "water": round(self.water_level, 2),
            "ec": round(self.ec, 2),
            "ph": round(self.ph, 2),
            "temperature": round(self.current_temp, 2),
            "humidity": round(self.current_humidity, 2),
            "health": round(self.health, 2),
            "status": "🌱 Growing" if self.health > 0 else "❌ Dead",
            "category": self.category.get("category", "N/A"),
            "use": self.category.get("use", "N/A"),
            "seasonality": self.category.get("seasonality", "N/A"),
            "active_prompt": self.active_prompt,
            "notifications": self.notifications[-5:],
            "feedback": self.feedback[-5:],
        }

    # --- NEW: client-side persistence helpers ---
    def snapshot(self) -> dict:
        """Return a browser-storable snapshot of the game (always paused)."""
        return {
            "city": self.city,
            "month": self.month,
            "crop": self.crop,
            "day": int(self.day),
            "hour": int(self.hour),
            "stage": self.stage,
            "light_on": bool(self.light_on),
            "water_level": float(self.water_level),
            "ec": float(self.ec),
            "ph": float(self.ph),
            "health": float(self.health),
            "daily_light_hours": int(self.daily_light_hours),
            "current_temp": float(self.current_temp),
            "current_humidity": float(self.current_humidity),
            "temp_offset": float(self.temp_offset),
            "paused": True,
        }

    @classmethod
    def from_snapshot(cls, snap: dict, data_dir: str = "data") -> "HydroGameEngine":
        """Rebuild engine from a previously saved snapshot (kept paused)."""
        eng = cls(snap["city"], snap["month"], snap["crop"], data_dir=data_dir)
        eng.day = int(snap.get("day", 0))
        eng.hour = int(snap.get("hour", 0))
        eng.stage = snap.get("stage", "Seedling")
        eng.light_on = bool(snap.get("light_on", False))
        eng.water_level = float(snap.get("water_level", 100.0))
        eng.ec = float(snap.get("ec", eng.crops["ec_range"][1]))
        eng.ph = float(snap.get("ph", eng.crops["ph_range"][1]))
        eng.health = float(snap.get("health", 100.0))
        eng.daily_light_hours = int(snap.get("daily_light_hours", 0))
        eng.current_temp = float(snap.get("current_temp", eng.climate["mean_temp"]))
        eng.current_humidity = float(snap.get("current_humidity", eng.climate["humidity"]))
        eng.temp_offset = float(snap.get("temp_offset", 0.0))
        eng.paused = True
        eng.running = False
        eng._thread = None
        return eng

    def save_state(self, path: str = "user_state.json") -> None:
        state = {
            "city": self.city,
            "month": self.month,
            "crop": self.crop,
            "day": self.day,
            "hour": self.hour,
            "stage": self.stage,
            "light_on": self.light_on,
            "water_level": self.water_level,
            "ec": self.ec,
            "ph": self.ph,
            "health": self.health,
            "daily_light_hours": self.daily_light_hours,
            "current_temp": self.current_temp,
            "current_humidity": self.current_humidity,
            "temp_offset": self.temp_offset,
            "paused": True,
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)

    @classmethod
    def load_state(cls, path: str = "user_state.json", data_dir: str = "data") -> "HydroGameEngine":
        with open(path, "r", encoding="utf-8") as f:
            state = json.load(f)

        eng = cls(state["city"], state["month"], state["crop"], data_dir=data_dir)
        eng.day = int(state.get("day", 0))
        eng.hour = int(state.get("hour", 0))
        eng.stage = state.get("stage", "Seedling")
        eng.light_on = bool(state.get("light_on", False))
        eng.water_level = float(state.get("water_level", 100.0))
        eng.ec = float(state.get("ec", eng.crops["ec_range"][1]))
        eng.ph = float(state.get("ph", eng.crops["ph_range"][1]))
        eng.health = float(state.get("health", 100.0))
        eng.daily_light_hours = int(state.get("daily_light_hours", 0))
        eng.current_temp = float(state.get("current_temp", eng.climate["mean_temp"]))
        eng.current_humidity = float(state.get("current_humidity", eng.climate["humidity"]))
        eng.temp_offset = float(state.get("temp_offset", 0.0))
        eng.paused = True
        eng.running = False
        eng._thread = None
        return eng
