# 🌱 Hydroponics Learning Simulator

> Learn hydroponic farming through hands-on practice — no expensive equipment required.

An interactive web application designed to teach the fundamentals of hydroponic farming to urban households in Pakistan. This simulator lets you experiment with crop growth, environmental controls, and nutrient management in a safe, virtual environment before investing in real hardware.

---

## Why This Exists

Starting with hydroponics can feel overwhelming. You need to understand EC levels, pH balance, lighting schedules, and temperature control — all while worrying about killing your first crop. This simulator gives you a risk-free space to learn these concepts, make mistakes, and build confidence before you touch real plants.

---

## ✨ What You Can Do

### 🌿 **Realistic Plant Simulation**
- Watch your crops grow through actual growth stages with real-time feedback
- Manage key parameters: EC, pH, water level, temperature, humidity, and light exposure
- Choose from multiple crops: Cherry Tomatoes, Mint, and Spinach
- Experience authentic climate conditions from Lahore and Karachi throughout the year

### 🎮 **Interactive Controls**

**Left Control Panel:**
- Toggle grow lights on/off
- Normalize EC levels (nutrient concentration)
- Balance pH levels
- Cool your setup (move plants to shade or bring them inside)

**Right Control Panel:**
- Refill water reservoir
- Reduce humidity
- Spray water for extra moisture
- Warm your plants (move to sun or bring outside)

### 📊 **Live Dashboard**
Keep track of everything that matters:
- Current day and hour in the simulation
- Crop growth stage with visual updates
- Water level, EC, and pH readings
- Humidity and temperature
- Plant health score
- Estimated yield (updates in real-time)

### 🔔 **Smart Notifications**
- Get alerted when something needs your attention
- Receive positive feedback when you respond correctly
- Learn from mistakes with educational guidance
- Small health penalties teach you why timing matters

### 🎧 **Ambient Experience**
- Optional background sounds for immersion
- Audio cues when your crop reaches a new growth stage
- Visual changes as your plants mature

### 🏆 **See Your Results**
When your crop completes its growth cycle, you'll see a final yield estimate based on how well you maintained plant health throughout the simulation.

---

## 🗂️ Project Structure

```
project/
│
├── app.py                      # Flask backend server
├── educator.py                 # Core simulation engine
│
├── static/
│   ├── index.html             # Landing page
│   ├── techniques.html        # Hydroponic methods overview
│   ├── guide.html             # How to use the simulator
│   ├── educator.html          # Main simulator interface
│   │
│   ├── css/
│   │   ├── style.css          # General styling
│   │   └── educator.css       # Simulator-specific styles
│   │
│   ├── script.js              # Frontend simulation logic
│   ├── images/                # Crop growth stage graphics
│   └── audio/                 # Sound effects and ambient audio
│
├── data/
│   ├── climate.json           # Regional climate data
│   ├── crops.json             # Crop requirements and parameters
│   ├── categories.json        # Crop categorization
│   └── yield.json             # Yield calculation data
│
├── requirements.txt
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- Python 3.11 or higher
- pip (Python package manager)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/hydroponic-simulator.git
   cd hydroponic-simulator
   ```

2. **Set up a virtual environment**
   ```bash
   # On macOS/Linux
   python3 -m venv venv
   source venv/bin/activate

   # On Windows
   python -m venv venv
   venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the application**
   ```bash
   python app.py
   ```

5. **Open in your browser**
   
   Navigate to: `http://localhost:5000`

---

## 🌐 Deployment

### Deploying to Render

This app is ready to deploy on [Render](https://render.com) using the free tier. Create a `render.yaml` file:

```yaml
services:
  - type: web
    name: hydroponic-simulator
    env: python
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn app:app --bind 0.0.0.0:$PORT --worker-class gthread --threads 16 --workers 1
    healthCheckPath: /
    autoDeploy: true
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.9
```

Simply connect your GitHub repository to Render and it will automatically deploy.

---

## 📚 Data & Sources

The simulator uses curated educational datasets stored in the `/data` folder:

- **climate.json** — Temperature, humidity, and sunlight data for Lahore and Karachi across all months
- **crops.json** — Optimal EC, pH, temperature, humidity, and light requirements for each crop
- **categories.json** — Crop classification and grouping
- **yield.json** — Yield calculations based on plant health

These datasets are intentionally simplified to focus on teaching core concepts rather than overwhelming beginners with complexity.

---

## 🛣️ What's Next

We're planning to expand the simulator with:

- [ ] Additional Pakistani cities with localized climate data
- [ ] More crop varieties (Lettuce, Basil, Bell Peppers)
- [ ] Advanced plant physiology modeling
- [ ] Live weather API integration for real-time conditions
- [ ] Hardware integration mode (ESP32 with real sensors and actuators)
- [ ] Multi-language support: Urdu, Punjabi, Sindhi, and Pashto
- [ ] Community sharing of successful grows
- [ ] Tutorial videos and step-by-step walkthroughs

---

## 🤝 Contributing

This is an open educational project. If you'd like to contribute improvements, additional crops, better climate data, or translations, pull requests are welcome!

---

## 📄 License

MIT License — feel free to use, modify, and share this project.

---

## 💚 Acknowledgements

This simulator was developed as part of an academic project with a simple goal: make hydroponics accessible to urban households in Pakistan. We believe everyone should have the opportunity to grow their own food, regardless of space or prior experience.

If this tool helps you start your hydroponic journey, we'd love to hear about it!

---

**Happy Growing! 🌿**
