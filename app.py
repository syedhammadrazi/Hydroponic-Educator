from __future__ import annotations
import time
import uuid
from typing import Any, Dict, Tuple, Optional

from flask import Flask, request, jsonify, send_from_directory

from educator import HydroGameEngine

app = Flask(__name__, static_folder="static", static_url_path="")

SESSIONS: Dict[str, Dict[str, Any]] = {}


def make_sid() -> str:
    return str(uuid.uuid4())


def get_session_or_400() -> Tuple[Optional[Dict[str, Any]], Optional[Tuple[Any, int]]]:
    """Return (session, error_response). If invalid/missing SID, session is None and error_response is set."""
    sid = request.args.get("sid")
    if not sid:
        data = request.get_json(silent=True) or {}
        sid = data.get("sid")

    if not sid or sid not in SESSIONS:
        return None, (jsonify(error="Invalid or missing session id"), 400)

    return SESSIONS[sid], None


def required_action_from_engine(engine: HydroGameEngine) -> Any:
    return engine.active_prompt


def status_payload(sess: Dict[str, Any]) -> Dict[str, Any]:
    eng: HydroGameEngine = sess["engine"]

    try:
        yield_kg = eng.calculate_yield().get("yield_kg", 0.0)
    except Exception:
        yield_kg = 0.0

    return {
        "city": eng.city,
        "month": eng.month,
        "crop": eng.crop,
        "language": sess.get("language", "en"),
        "time": {"day": eng.day, "hour": eng.hour},
        "env": {
            "temp": eng.current_temp,
            "humidity": eng.current_humidity,
            "ec": eng.ec,
            "ph": eng.ph,
            "water": eng.water_level,
            "light": "ON" if eng.light_on else "OFF",
        },
        "plant": {
            "health": eng.health,
            "stage": eng.stage,
            "yield": yield_kg,
        },
        "required_action": required_action_from_engine(eng),
        "feedback": list(eng.feedback[-5:]),
        "notifications": list(eng.notifications[-5:]),
    }


def _resolve_if_matches(eng: HydroGameEngine, keys: set[str]) -> None:
    """Resolve the current prompt only if it matches one of the given keys."""
    active = eng.active_prompt
    if active and active.get("key") in keys:
        eng.resolve_prompt(acted=True)


def apply_action(eng: HydroGameEngine, action_id: str) -> str:
    if action_id == "toggle_light":
        new_state = not eng.light_on
        eng.toggle_light(new_state)
        _resolve_if_matches(eng, {"light_on"} if new_state else {"light_off"})
        return f"Light turned {'on' if new_state else 'off'}."

    if action_id == "normalize_ec":
        eng.normalize_ec()
        _resolve_if_matches(eng, {"ec_low", "ec_high"})
        return "EC is normalised."

    if action_id == "normalize_ph":
        eng.normalize_ph()
        _resolve_if_matches(eng, {"ph_out"})
        return "pH is normalised."

    if action_id == "move_inside":
        eng.move_to_shade()
        _resolve_if_matches(eng, {"temp_high"})
        return "Cooled down."

    if action_id == "move_outside":
        eng.move_to_sunlight()
        _resolve_if_matches(eng, {"temp_low"})
        return "Heated up."

    if action_id == "refill_water":
        eng.refill_water()
        _resolve_if_matches(eng, {"water_low"})
        return "Reservoir refilled."

    if action_id == "dehumidify":
        eng.turn_on_dehumidifier()
        _resolve_if_matches(eng, {"humidity_high"})
        return "Air is dehumidified."

    if action_id == "spray_water":
        eng.spray_mist()
        _resolve_if_matches(eng, {"humidity_low"})
        return "Air is humidified."

    if action_id == "next_stage":
        try:
            msg = eng.advance_to_next_stage()
            return msg
        except Exception:
            msg = "Advanced."
            eng.feedback.append(msg)
            return msg

    return "Action received."


# ---------- API ----------


@app.post("/start")
def start():
    data = request.get_json(silent=True) or {}
    city = data.get("city") or "Lahore"
    month = data.get("month") or "January"
    crop = data.get("crop") or "Cherry Tomato"
    language = data.get("language") or "en"

    eng = HydroGameEngine(city, month, crop)
    eng.start_simulation(speed=2.5)

    sid = make_sid()
    SESSIONS[sid] = {
        "engine": eng,
        "language": language,
        "created_at": int(time.time() * 1000),
    }
    return jsonify(session_id=sid)


@app.get("/status")
def status():
    sess, err = get_session_or_400()
    if err:
        return err
    return jsonify(status_payload(sess))


@app.post("/action")
def action():
    sess, err = get_session_or_400()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    action_id = data.get("action_id")

    if not action_id:
        return jsonify(error="Missing action_id"), 400

    msg = apply_action(sess["engine"], action_id)
    return jsonify(ok=True, feedback=msg)


@app.post("/prompt_result")
def prompt_result():
    """Called when a prompt expired without user action."""
    sess, err = get_session_or_400()
    if err:
        return err

    eng: HydroGameEngine = sess["engine"]
    eng.prompt_missed()
    return jsonify(ok=True)


@app.post("/pause")
def pause():
    sess, err = get_session_or_400()
    if err:
        return err

    eng: HydroGameEngine = sess["engine"]
    eng.pause_simulation()
    return jsonify(ok=True, snapshot=eng.snapshot())


@app.post("/resume")
def resume():
    sess, err = get_session_or_400()
    if err:
        return err

    eng: HydroGameEngine = sess["engine"]
    eng.resume_simulation()
    eng.start_simulation(speed=2.5)
    return jsonify(ok=True)


@app.post("/resume_from_snapshot")
def resume_from_snapshot():
    data = request.get_json(silent=True) or {}
    sid = data.get("sid")
    snap = data.get("snapshot")
    language = data.get("language") or "en"

    if not sid or not isinstance(snap, dict):
        return jsonify(error="sid and snapshot required"), 400

    try:
        eng = HydroGameEngine.from_snapshot(snap, data_dir="data")
    except Exception as exc:
        return jsonify(error=f"bad snapshot: {exc}"), 400

    SESSIONS[sid] = {
        "engine": eng,
        "language": language,
        "created_at": int(time.time() * 1000),
    }
    return jsonify(ok=True)


@app.post("/restart")
def restart():
    sess, err = get_session_or_400()
    if err:
        return err

    eng: HydroGameEngine = sess["engine"]
    try:
        eng.stop_simulation()
    except Exception:
        pass

    data = request.get_json(silent=True) or {}
    sid = data.get("sid")
    if sid in SESSIONS:
        del SESSIONS[sid]

    return jsonify(ok=True)


@app.get("/")
def root():
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
