from __future__ import annotations
from flask import Flask, request, jsonify, send_from_directory
import uuid, time

from educator import HydroGameEngine

app = Flask(__name__, static_folder="static", static_url_path="")

SESSIONS: dict[str, dict] = {}

def make_sid() -> str:
    return str(uuid.uuid4())

def get_session_or_400():
    sid = request.args.get("sid") or (request.json and request.json.get("sid"))
    if not sid or sid not in SESSIONS:
        return None, (jsonify(error="Invalid or missing session id"), 400)
    return SESSIONS[sid], None

def required_action_from_engine(engine: HydroGameEngine):
    return engine.active_prompt

def status_payload(sess: dict) -> dict:
    eng: HydroGameEngine = sess["engine"]
    try:
        y = eng.calculate_yield().get("yield_kg", 0.0)
    except Exception:
        y = 0.0

    return {
        "city": eng.city,
        "month": eng.month,
        "crop": eng.crop,
        "language": sess.get("language", "en"),
        "time": { "day": eng.day, "hour": eng.hour },
        "env": {
            "temp": eng.current_temp,
            "humidity": eng.current_humidity,
            "ec": eng.ec,
            "ph": eng.ph,
            "water": eng.water_level,
            "light": ("ON" if eng.light_on else "OFF"),
        },
        "plant": {
            "health": eng.health,
            "stage": eng.stage,
            "yield": y,
        },
        "required_action": required_action_from_engine(eng),
        "feedback": list(eng.feedback[-5:]),
        "notifications": list(eng.notifications[-5:])
    }

# Resolve only if the prompt matches what the action actually fixes
def _resolve_if_matches(eng: HydroGameEngine, keys: set[str]):
    ap = eng.active_prompt
    if ap and ap.get("key") in keys:
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
        return "EC is normalized."

    if action_id == "normalize_ph":
        eng.normalize_ph()
        _resolve_if_matches(eng, {"ph_out"})
        return "pH is normalized."

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
            err = "Advanced."
            eng.feedback.append(err)
            return err

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
    SESSIONS[sid] = {"engine": eng, "language": language, "created_at": int(time.time()*1000)}
    return jsonify(session_id=sid)

@app.get("/status")
def status():
    sess, err = get_session_or_400()
    if err: return err
    return jsonify(status_payload(sess))

@app.post("/action")
def action():
    sess, err = get_session_or_400()
    if err: return err
    data = request.get_json(silent=True) or {}
    action_id = data.get("action_id")
    if not action_id:
        return jsonify(error="Missing action_id"), 400
    msg = apply_action(sess["engine"], action_id)
    return jsonify(ok=True, feedback=msg)

@app.post("/prompt_result")
def prompt_result():
    """Frontend calls this when a prompt expired without action (MISS)."""
    sess, err = get_session_or_400()
    if err: return err
    eng: HydroGameEngine = sess["engine"]
    eng.prompt_missed()  # apply staged penalty and clear prompt
    return jsonify(ok=True)

@app.post("/pause")
def pause():
    sess, err = get_session_or_400()
    if err: return err
    eng: HydroGameEngine = sess["engine"]
    eng.pause_simulation()
    # removed server-file write (user_state.json); browser snapshot handles persistence
    return jsonify(ok=True, snapshot=eng.snapshot())

@app.post("/resume")
def resume():
    sess, err = get_session_or_400()
    if err: return err
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
    except Exception as e:
        return jsonify(error=f"bad snapshot: {e}"), 400
    SESSIONS[sid] = {"engine": eng, "language": language, "created_at": int(time.time()*1000)}
    return jsonify(ok=True)

@app.post("/restart")
def restart():
    sess, err = get_session_or_400()
    if err: return err
    eng: HydroGameEngine = sess["engine"]
    try:
        eng.stop_simulation()
    except Exception:
        pass
    sid = request.get_json(silent=True).get("sid")
    if sid in SESSIONS: del SESSIONS[sid]
    # removed server-file delete (user_state.json); browser storage is cleared client-side
    return jsonify(ok=True)

@app.get("/")
def root():
    return send_from_directory(app.static_folder, "index.html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
