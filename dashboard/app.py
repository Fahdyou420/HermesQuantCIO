import os
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

global_kill_switch_active = False

@app.route("/")
def index():
    return render_template("index.html", kill_switch=global_kill_switch_active)

@app.route("/api/telemetry")
def telemetry():
    # Return mock telemetry for Layer 5 UI
    return render_template("fragments/telemetry.html", 
        status="ONLINE", 
        trades_active=2, 
        daily_pnl="$4,320", 
        win_rate="68.4%",
        kill_switch=global_kill_switch_active
    )

@app.route("/api/command", methods=["POST"])
def send_command():
    cmd = request.form.get("command", "")
    if cmd:
        # Pseudo-route to hermes-agent loop
        return f"<span class='text-teal-400'>[SUCCESS]</span> Dispatched explicit directive to Hermes-Agent: '{cmd}'"
    return "<span class='text-red-400'>[ERROR]</span> Empty payload."

@app.route("/api/killswitch", methods=["POST"])
def toggle_killswitch():
    global global_kill_switch_active
    action = request.form.get("action")
    if action == "activate":
        global_kill_switch_active = True
        # In a real environment, send a ZMQ kill signal here to the Order Router
    else:
        global_kill_switch_active = False
    
    return render_template("fragments/killswitch_btn.html", kill_switch=global_kill_switch_active)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
