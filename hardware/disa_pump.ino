/*
  MediTech Infusion UI – ESP32 + ILI9488 (TFT_eSPI) + XPT2046 Touch
  - Splash (5s)
  - Status bar on all screens except Splash and Screensaver
  - Home/QR screen (+ Manual Mode)
  - Manual flow: Inputs -> Bolus -> Confirm -> Running
  - Auto flow: POST /start/pump -> Confirm -> Running
  // - Bubble detector modal (sticky while bubble persists until acknowledged)
  - Problem modal (yellow)
  - Screensaver after 60s idle on Home; tap to exit

  Requires:
    - TFT_eSPI configured for ILI9488 + XPT2046 (your working Setup21)
    - myQRCode.h / myQRCode.c (Richard Moore’s QRCode library renamed)
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <TFT_eSPI.h>
#include <SPI.h>
#include <ArduinoJson.h>
#include "myQRCode.h"  // your renamed QR library

#ifndef ECC_LOW
#define ECC_LOW 0
#endif

enum UIState {
  UI_SPLASH,
  UI_HOME,
  UI_MANUAL_INPUT,
  UI_MANUAL_BOLUS,
  UI_CONFIRM,
  UI_RUNNING,
  UI_SCREENSAVER
};

enum PumpStatus { 
  PUMP_IDLE,
  PUMP_RUNNING,
  PUMP_PAUSED 
};

struct Button;
struct InputField;
struct Slider;

const char* WIFI_SSID = "Net";
const char* WIFI_PASS = "123456789";
const char* MQTT_SERVER = "4ebd6137905848fc8246b374d7253984.s1.eu.hivemq.cloud";
const int MQTT_PORT = 8883;
const char* MQTT_USERNAME = "pump001";
const char* MQTT_PASSWORD = "Disa@123";
const char* DEVICE_ID = "PUMP_0001";  // 🎯 Make sure this matches your backend!
const char* ADMIN_FRONTEND_URL = "https://your-admin-frontend.com";

WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);

TFT_eSPI tft;
uint16_t calData[5] = { 230, 3592, 328, 3490, 6 };
const int SCREEN_W = 480;
const int SCREEN_H = 320;

#define COL_BG 0x0841
#define COL_PANEL 0x2945
#define COL_ACCENT 0x04B3
#define COL_TEXT TFT_WHITE
#define COL_MUTED 0xAD55
#define COL_WARN 0xFD20
#define COL_ERR 0xE104
#define COL_OK 0x2589
#define COL_INFOBOX 0x4E99
#define COL_CARD 0x18C3

#define MOTOR_STEP_PIN 32
#define MOTOR_DIR_PIN  33
#define MOTOR_EN_PIN   12
#define BUBBLE_PIN     17  // Bubble detector on GPIO 17


UIState ui = UI_SPLASH;
PumpStatus pump = PUMP_IDLE;

struct Button {
  int x, y, w, h;
  String label;
  uint16_t bg, fg, border;
};

struct InputField {
  int x, y, w, h;
  String label;
  String value;
  bool focused = false;
};

struct Slider {
  int x, y, w, h;
  float minV, maxV, value;
  bool dragging = false;
};

bool isWiFiConnected = false;
bool isMQTTConnected = false;
bool connectionComplete = false;

struct FormData {
  float rate_ml_per_min = 0;
  float volume_ml = 0;
  float time_min = 0;
  bool bolusEnabled = false;
  float bolus_ml = 0;
};
FormData pendingData;
FormData activeData;

uint32_t infusionStartMs = 0;
uint32_t pausedAccumMs = 0;
uint32_t pauseStartMs = 0;

// Infusion ID tracking (received from backend)
String currentInfusionId = "";

const float SYRINGE_VOLUME = 55.0;
const float STROKE_LENGTH  = 170.0;
const float STEPS_PER_REV  = 200.0;
const float LEAD_PITCH     = 2.0;
const float STEPS_PER_MM   = STEPS_PER_REV / LEAD_PITCH;

// Calibration factor to correct for real-world differences
// Based on observation: software calculated 4.16mL but actual was 17mL
// Correction factor: 4.16/17 = 0.245
// TO RECALIBRATE: Run a test infusion, measure actual vs reported volume,
// then update CALIBRATION_FACTOR = (reported_volume / actual_volume)
const float CALIBRATION_FACTOR = 0.245;
const float STEPS_PER_ML   = ((STROKE_LENGTH * STEPS_PER_MM) / SYRINGE_VOLUME) * CALIBRATION_FACTOR;

// Bolus speed constants (based on motor testing)
const float BOLUS_STEPS_PER_SEC = 120.0;  // Optimal tested speed
const float BOLUS_STEP_DELAY_MICROS = 1000000.0 / BOLUS_STEPS_PER_SEC;  // ~1428.6μs

// Backlash compensation - mechanical play in syringe plunger/piston
// This compensates for the gap when changing direction
const long BACKLASH_STEPS = 350;  // Extra steps to take up mechanical play (adjust based on testing)

// Helper function to calculate bolus timing
float calculateBolusDeliveryTime(float volumeMl) {
  if (volumeMl <= 0) return 0;
  long steps = volumeMl * STEPS_PER_ML;
  return (float)steps / BOLUS_STEPS_PER_SEC;  // seconds
}

long totalSteps = 0;
unsigned long stepDelay = 0;
unsigned long lastStepTime = 0;
bool infusionActive = false;
bool infusionCompleted = false;

// Bolus delivery tracking
bool isDeliveringBolus = false;
long currentBolusSteps = 0;
long totalBolusSteps = 0;
float currentBolusVolume = 0;

// Recenter tracking variables
long totalStepsDelivered = 0;  // Track total forward steps for recentering
bool needsRecenter = false;     // Flag to indicate recenter is needed
bool isRecentering = false;     // Flag to indicate recentering in progress

const int STATUS_H = 26;

Button btnManual = { SCREEN_W / 2 - 90, SCREEN_H - 70, 180, 46, "Manual Mode", COL_OK, COL_TEXT, COL_TEXT };
Button btnDiscard = { 40, SCREEN_H - 60, 140, 44, "Discard", 0xC186, COL_TEXT, COL_TEXT };  // Medical maroon
Button btnNext = { SCREEN_W - 180, SCREEN_H - 60, 140, 44, "Next", COL_ACCENT, COL_BG, COL_TEXT };
Button btnBack = { 40, SCREEN_H - 60, 140, 44, "Back", 0x4E99, COL_TEXT, COL_TEXT };              // Medical blue-grey
Button btnEnableB = { 40, SCREEN_H - 120, 180, 44, "Toggle Bolus", 0x4E99, COL_TEXT, COL_TEXT };  // Medical blue-grey
Button btnAccept = { SCREEN_W / 2 - 150, SCREEN_H - 60, 140, 44, "Accept", COL_OK, COL_TEXT, COL_TEXT };
Button btnReject = { SCREEN_W / 2 + 10, SCREEN_H - 60, 140, 44, "Reject", 0xC186, COL_TEXT, COL_TEXT };  // Medical maroon
Button btnPause = { SCREEN_W - 320, SCREEN_H - 60, 140, 44, "Pause", COL_WARN, COL_TEXT, COL_TEXT };     // Medical amber
Button btnStop = { SCREEN_W - 160, SCREEN_H - 60, 140, 44, "Stop", COL_ERR, COL_TEXT, COL_TEXT };        // Medical red
Button btnResume = { SCREEN_W - 320, SCREEN_H - 60, 140, 44, "Resume", COL_OK, COL_TEXT, COL_TEXT };
Button btnBolus = { 40, SCREEN_H - 60, 140, 44, "Bolus", COL_INFOBOX, COL_TEXT, COL_TEXT };               // Medical blue-green
Button btnShowQR = { SCREEN_W / 2 - 70, SCREEN_H - 60, 140, 44, "Show QR", 0x4E99, COL_TEXT, COL_TEXT };  // Medical blue-grey

// Input fields (Manual -> step 1) - dynamically positioned within card
InputField inRate = { 60, 80, 280, 40, "Infusion rate (ml/min)", "5.0" };  // Default 5.0 ml/min
InputField inVol = { 60, 140, 280, 40, "Total volume (ml)", "100.0" };     // Default 100.0 ml
InputField inTime = { 60, 200, 280, 40, "Time (min)", "20.0" };            // Default 20.0 min
InputField* activeField = nullptr;

// Bolus slider (step 2)
Slider bolusSlider = { 80, 170, SCREEN_W - 160, 24, 0.0f, 0.0f, 0.0f };  // min/max set after inputs

// Touch debounce
uint32_t lastTouchMs = 0;
const uint32_t touchDebounce = 140;

// Idle -> screensaver (only on Home)
uint32_t lastInteractionMs = 0;
const uint32_t IDLE_MS = 60000;

// Bubble modal state
// bool showBubbleModal = false;

// Infusion completion state
bool showCompletionModal = false;
bool completionModalDrawn = false;  // Track if modal is already drawn to prevent flickering

// Bubble detection state
bool bubblePresent = false;
bool showBubbleModal = false;
bool bubbleModalDrawn = false;
bool bubbleAckUntilClear = false;  // Track if bubble was acknowledged but not yet cleared
bool wasRunningBeforeBubble = false;  // Track if pump was running before bubble pause
bool bubbleErrorSent = false;  // State flag to prevent rapid MQTT error messages
uint32_t lastBubbleCheck = 0;
const uint32_t BUBBLE_CHECK_INTERVAL = 100;  // Check every 100ms for responsiveness

// Running screen update control
uint32_t lastRunningUpdate = 0;
const uint32_t RUNNING_UPDATE_INTERVAL = 1000;  // 1 second

// -------------------- Small helpers --------------------
void drawButton(const Button& b) {
  tft.drawRoundRect(b.x, b.y, b.w, b.h, 10, b.border);
  tft.fillRoundRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, 10, b.bg);
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(b.fg, b.bg);
  tft.setTextSize(2);
  tft.drawString(b.label, b.x + b.w / 2, b.y + b.h / 2);
}

bool inBtn(const Button& b, uint16_t x, uint16_t y) {
  return (x >= b.x && x <= (b.x + b.w) && y >= b.y && y <= (b.y + b.h));
}

String getISOTimestamp() {
  // Simple timestamp for MQTT (millis-based)
  unsigned long ms = millis();
  unsigned long seconds = ms / 1000;
  unsigned long minutes = seconds / 60;
  unsigned long hours = minutes / 60;
  
  // Format as simple timestamp (device uptime)
  return String(hours % 24) + ":" + String(minutes % 60) + ":" + String(seconds % 60) + "." + String(ms % 1000);
}

void drawField(const InputField& f) {
  // Label
  tft.setTextDatum(TL_DATUM);
  tft.setTextSize(1);
  tft.setTextColor(COL_MUTED, COL_BG);
  tft.drawString(f.label, f.x, f.y - 16);
  // Box
  uint16_t border = f.focused ? COL_ACCENT : COL_MUTED;
  tft.drawRoundRect(f.x, f.y, f.w, f.h, 8, border);
  tft.fillRoundRect(f.x + 1, f.y + 1, f.w - 2, f.h - 2, 8, COL_BG);
  // Value
  tft.setTextDatum(ML_DATUM);
  tft.setTextSize(2);
  tft.setTextColor(COL_TEXT, COL_BG);
  tft.drawString(f.value, f.x + 8, f.y + f.h / 2);
}

void focusField(InputField* f) {
  if (activeField && activeField != f) {
    activeField->focused = false;
    drawField(*activeField);
  }
  activeField = f;
  if (activeField) {
    activeField->focused = true;
    drawField(*activeField);
  }
}

// External keypad input function (to be implemented when keypad is connected)
void appendCharToActive(const char* c) {
  if (!activeField) return;
  if (strcmp(c, "<") == 0) {
    if (activeField->value.length() > 0) activeField->value.remove(activeField->value.length() - 1);
  } else {
    if (activeField->value.length() < 12) activeField->value += c;
  }
  drawField(*activeField);
}

// Slider
void drawSlider(const Slider& s) {
  // Enhanced track with gradient effect
  tft.fillRoundRect(s.x, s.y + s.h / 3, s.w, s.h / 3, s.h / 6, 0x4208);  // Medical dark grey
  tft.drawRoundRect(s.x, s.y + s.h / 3, s.w, s.h / 3, s.h / 6, COL_MUTED);

  // Progress fill (shows selected amount)
  float t = (s.value - s.minV) / max(0.0001f, (s.maxV - s.minV));
  int fillW = (int)(t * s.w);
  if (fillW > 0) {
    tft.fillRoundRect(s.x, s.y + s.h / 3, fillW, s.h / 3, s.h / 6, COL_ACCENT);
  }

  // Enhanced thumb with shadow effect
  int thumbX = s.x + (int)(t * s.w);
  int thW = 20, thH = s.h;

  // Shadow
  tft.fillRoundRect(thumbX - thW / 2 + 2, s.y + 2, thW, thH, 8, 0x4208);  // Medical dark grey shadow
  // Main thumb
  tft.fillRoundRect(thumbX - thW / 2, s.y, thW, thH, 8, COL_TEXT);
  tft.drawRoundRect(thumbX - thW / 2, s.y, thW, thH, 8, COL_ACCENT);

  // Thumb center indicator
  tft.fillCircle(thumbX, s.y + thH / 2, 4, COL_ACCENT);
}

// -------------------- Status Bar -----------------------
void drawWifiIcon(int x, int y, bool connected) {
  // simple arcs
  uint16_t col = connected ? COL_TEXT : COL_MUTED;
  tft.drawCircle(x, y, 10, col);
  tft.drawCircle(x, y, 7, col);
  tft.drawCircle(x, y, 4, col);
  tft.fillCircle(x, y, 2, col);
  if (!connected) {
    tft.drawLine(x - 8, y - 8, x + 8, y + 8, COL_ERR);
  }
}

void drawMqttIcon(int x, int y, bool connected) {
  // MQTT icon - simple M shape
  uint16_t col = connected ? COL_OK : COL_ERR;
  tft.drawLine(x - 6, y + 6, x - 6, y - 6, col);  // Left line
  tft.drawLine(x - 6, y - 6, x, y, col);          // Left diagonal
  tft.drawLine(x, y, x + 6, y - 6, col);          // Right diagonal
  tft.drawLine(x + 6, y - 6, x + 6, y + 6, col);  // Right line
  tft.fillCircle(x, y + 4, 2, col);               // Bottom dot
}

void drawStatusDot(int x, int y, PumpStatus st) {
  uint16_t c = (st == PUMP_RUNNING) ? COL_OK : (st == PUMP_PAUSED ? COL_WARN : 0x4208);  // Medical grey for idle
  tft.fillCircle(x, y, 7, c);
  tft.drawCircle(x, y, 7, COL_TEXT);
}

void drawStatusBar() {
  // bar bg
  tft.fillRect(0, 0, SCREEN_W, STATUS_H, COL_PANEL);  // Medical panel color
  tft.drawLine(0, STATUS_H, SCREEN_W, STATUS_H, COL_ACCENT);

  // left: brand
  tft.setTextDatum(ML_DATUM);
  tft.setTextColor(COL_TEXT, COL_PANEL);
  tft.setTextSize(2);
  tft.drawString("MediTech", 10, STATUS_H / 2);

  // right: status dot + wifi + mqtt status
  bool wifiConnected = (WiFi.status() == WL_CONNECTED);
  bool mqttConnected = mqttClient.connected();
  drawStatusDot(SCREEN_W - 80, STATUS_H / 2, pump);
  drawWifiIcon(SCREEN_W - 45, STATUS_H / 2, wifiConnected);
  drawMqttIcon(SCREEN_W - 25, STATUS_H / 2, mqttConnected);
}

// -------------------- QR Rendering --------------------
void drawQRCode(const String& text, int cx, int cy, int moduleSize) {
  QRCode qrcode;
  uint8_t qrcodeData[qrcode_getBufferSize(4)];  // version 4 to fit URL
  qrcode_initText(&qrcode, qrcodeData, 4, ECC_LOW, text.c_str());

  int qrSize = qrcode.size * moduleSize;
  int x0 = cx - qrSize / 2;
  int y0 = cy - qrSize / 2;

  tft.fillRoundRect(x0 - 8, y0 - 8, qrSize + 16, qrSize + 16, 10, COL_TEXT);
  tft.fillRect(x0 - 4, y0 - 4, qrSize + 8, qrSize + 8, COL_BG);

  for (int y = 0; y < qrcode.size; y++) {
    for (int x = 0; x < qrcode.size; x++) {
      bool dot = qrcode_getModule(&qrcode, x, y);
      tft.fillRect(x0 + x * moduleSize, y0 + y * moduleSize, moduleSize, moduleSize,
                   dot ? COL_TEXT : COL_BG);
    }
  }
}

// -------------------- Screens --------------------------
// Splash (and screensaver reuse)
void renderSplash(const char* footer) {
  tft.fillScreen(COL_BG);
  // Center MediTech logo (text)
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(COL_TEXT, COL_BG);
  tft.setTextSize(4);
  tft.drawString("MediTech", SCREEN_W / 2, SCREEN_H / 2 - 30);

  // Footer at bottom
  tft.setTextSize(2);
  tft.setTextColor(COL_MUTED, COL_BG);
  tft.drawString(footer, SCREEN_W / 2, SCREEN_H - 30);
}

// Update connection status on splash screen
void updateConnectionStatus() {
  // Clear status area
  tft.fillRect(0, SCREEN_H / 2 + 50, SCREEN_W, 40, COL_BG);

  tft.setTextDatum(MC_DATUM);
  tft.setTextSize(1);

  String statusText = "";
  uint16_t statusColor = COL_MUTED;

  if (!isWiFiConnected) {
    statusText = "Connecting to WiFi...";
    statusColor = COL_WARN;
  } else if (!isMQTTConnected) {
    statusText = "Connecting to MQTT broker...";
    statusColor = COL_WARN;
  } else {
    statusText = "Connected! Starting pump...";
    statusColor = COL_OK;
  }

  tft.setTextColor(statusColor, COL_BG);
  tft.drawString(statusText, SCREEN_W / 2, SCREEN_H / 2 + 60);
}

// Draw only the spinner (for animation without full screen redraw)
void drawSpinner() {
  int cx = SCREEN_W / 2, cy = SCREEN_H / 2 + 20;
  int radius = 15;
  uint32_t angle = (millis() / 100) % 360;  // Rotate every 100ms

  // Clear spinner area first
  tft.fillCircle(cx, cy, radius + 5, COL_BG);

  // Google-style color sequence: Red, Yellow, Green (repeating)
  uint16_t colors[3] = { TFT_RED, TFT_YELLOW, TFT_GREEN };

  // Draw spinner dots with rotating colors
  for (int i = 0; i < 8; i++) {
    float a = (angle + i * 45) * PI / 180.0;
    int x = cx + (radius - 3) * cos(a);
    int y = cy + (radius - 3) * sin(a);

    // Calculate color index based on position and time for rotation effect
    int colorIndex = ((i + (angle / 45)) % 3);
    uint16_t dotColor = colors[colorIndex];

    // Fade effect: dots get dimmer as they rotate away
    if (i >= 5) {
      // Make trailing dots darker
      dotColor = TFT_DARKGREY;
    }

    tft.fillCircle(x, y, 3, dotColor);
  }
}

void renderHome() {
  tft.fillScreen(COL_BG);
  drawStatusBar();

  tft.setTextDatum(TC_DATUM);
  tft.setTextSize(2);
  tft.setTextColor(COL_ACCENT, COL_BG);
  tft.drawString("Scan to access pump admin", SCREEN_W / 2, STATUS_H + 18);

  // QR code now points to admin frontend
  String url = String(ADMIN_FRONTEND_URL) + "?deviceId=" + String(DEVICE_ID);
  drawQRCode(url, SCREEN_W / 2, STATUS_H + 120, 4);

  tft.setTextColor(COL_MUTED, COL_BG);
  tft.setTextSize(1);
  tft.drawString("Device ID: " + String(DEVICE_ID), SCREEN_W / 2, SCREEN_H - 90);

  drawButton(btnManual);
}

void renderManualInput() {
  tft.fillScreen(COL_BG);
  drawStatusBar();

  // Main card - better proportions
  int cardX = 30, cardY = STATUS_H + 10;
  int cardW = SCREEN_W - 60, cardH = SCREEN_H - STATUS_H - 90;
  tft.fillRoundRect(cardX, cardY, cardW, cardH, 16, COL_CARD);
  tft.drawRoundRect(cardX, cardY, cardW, cardH, 16, COL_ACCENT);

  // Title
  tft.setTextDatum(TC_DATUM);
  tft.setTextColor(COL_ACCENT, COL_CARD);
  tft.setTextSize(2);
  tft.drawString("Manual Setup", SCREEN_W / 2, cardY + 16);

  // Instruction text
  tft.setTextDatum(TC_DATUM);
  tft.setTextColor(COL_MUTED, COL_CARD);
  tft.setTextSize(1);

  // Input fields
  inRate.x = cardX + 20;
  inRate.y = cardY + 55;
  inRate.w = cardW - 40;
  inRate.h = 32;
  inVol.x = cardX + 20;
  inVol.y = cardY + 105;
  inVol.w = cardW - 40;
  inVol.h = 32;
  inTime.x = cardX + 20;
  inTime.y = cardY + 155;
  inTime.w = cardW - 40;
  inTime.h = 32;

  drawField(inRate);
  drawField(inVol);
  drawField(inTime);

  drawButton(btnDiscard);
  drawButton(btnNext);
}

// Update only the bolus slider and related text without full screen redraw
void updateBolusSlider() {
  if (ui != UI_MANUAL_BOLUS || !pendingData.bolusEnabled) return;

  int cardX = 30, cardY = STATUS_H + 10;
  int overviewY = cardY + 50;

  // Update bolus status line
  tft.fillRect(cardX + 120, overviewY, 300, 12, COL_CARD);  // Clear status text area
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(COL_TEXT, COL_CARD);
  tft.setTextSize(1);
  String statusText = "Enabled - " + String(pendingData.bolus_ml, 1) + " ml (" + String((pendingData.bolus_ml / max(0.001f, pendingData.volume_ml)) * 100, 1) + "%)";
  tft.drawString(statusText, cardX + 120, overviewY);

  // Update slider value display
  int toggleY = overviewY + 30;
  int sliderY = toggleY + 45;

  // Clear and update the current value display
  tft.fillRect(bolusSlider.x + bolusSlider.w - 80, sliderY, 80, 12, COL_CARD);
  tft.setTextDatum(TR_DATUM);
  tft.setTextColor(COL_TEXT, COL_CARD);
  tft.setTextSize(1);
  tft.drawString(String(bolusSlider.value, 1) + " ml", bolusSlider.x + bolusSlider.w, sliderY);

  // Clear slider area and redraw only the slider
  tft.fillRect(bolusSlider.x - 2, bolusSlider.y - 2, bolusSlider.w + 4, bolusSlider.h + 4, COL_CARD);
  drawSlider(bolusSlider);
}

void renderManualBolus() {
  tft.fillScreen(COL_BG);
  drawStatusBar();

  // Main card
  int cardX = 30, cardY = STATUS_H + 10;
  int cardW = SCREEN_W - 60, cardH = SCREEN_H - STATUS_H - 90;
  tft.fillRoundRect(cardX, cardY, cardW, cardH, 16, COL_CARD);
  tft.drawRoundRect(cardX, cardY, cardW, cardH, 16, COL_ACCENT);

  // Title
  tft.setTextDatum(TC_DATUM);
  tft.setTextColor(COL_ACCENT, COL_CARD);
  tft.setTextSize(2);
  tft.drawString("Bolus Configuration", SCREEN_W / 2, cardY + 16);

  // Bolus Overview
  int overviewY = cardY + 50;
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(COL_ACCENT, COL_CARD);
  tft.setTextSize(1);
  tft.drawString("Bolus Status:", cardX + 20, overviewY);

  tft.setTextColor(COL_TEXT, COL_CARD);
  tft.setTextSize(1);
  String statusText = pendingData.bolusEnabled ? ("Enabled - " + String(pendingData.bolus_ml, 1) + " ml (" + String((pendingData.bolus_ml / max(0.001f, pendingData.volume_ml)) * 100, 1) + "%)") : "Disabled";
  tft.drawString(statusText, cardX + 120, overviewY);

  // Small Toggle Button
  int toggleY = overviewY + 30;
  Button btnToggleBolus = { cardX + 20, toggleY, 120, 32,
                            pendingData.bolusEnabled ? "Disable" : "Enable",
                            pendingData.bolusEnabled ? TFT_ORANGE : COL_OK, COL_TEXT, COL_TEXT };
  drawButton(btnToggleBolus);

  // Bolus Slider (only if enabled)
  if (pendingData.bolusEnabled) {
    int sliderY = toggleY + 45;

    bolusSlider.x = cardX + 20;
    bolusSlider.y = sliderY + 20;
    bolusSlider.w = cardW - 60;
    bolusSlider.h = 25;
    bolusSlider.minV = 0;
    bolusSlider.maxV = pendingData.volume_ml;
    bolusSlider.value = pendingData.bolus_ml;

    // Slider label / value
    tft.setTextColor(COL_ACCENT, COL_CARD);
    tft.setTextSize(1);
    tft.drawString("Amount:", bolusSlider.x, sliderY);

    tft.setTextDatum(TR_DATUM);
    tft.setTextColor(COL_TEXT, COL_CARD);
    tft.setTextSize(1);
    tft.drawString(String(bolusSlider.value, 1) + " ml", bolusSlider.x + bolusSlider.w, sliderY);

    drawSlider(bolusSlider);

    // Scale indicators
    tft.setTextDatum(TL_DATUM);
    tft.setTextColor(COL_MUTED, COL_CARD);
    tft.setTextSize(1);
    tft.drawString("0", bolusSlider.x, bolusSlider.y + bolusSlider.h + 5);

    tft.setTextDatum(TR_DATUM);
    tft.drawString(String(pendingData.volume_ml, 1) + " ml", bolusSlider.x + bolusSlider.w, bolusSlider.y + bolusSlider.h + 5);

    tft.setTextDatum(TC_DATUM);
    tft.drawString(String(pendingData.volume_ml / 2, 1), bolusSlider.x + bolusSlider.w / 2, bolusSlider.y + bolusSlider.h + 5);
  }

  drawButton(btnBack);
  drawButton(btnNext);
}

void renderConfirm() {
  tft.fillScreen(COL_BG);
  drawStatusBar();

  int cardX = 30, cardY = STATUS_H + 10;
  int cardW = SCREEN_W - 60, cardH = SCREEN_H - STATUS_H - 90;
  tft.fillRoundRect(cardX, cardY, cardW, cardH, 16, COL_CARD);
  tft.drawRoundRect(cardX, cardY, cardW, cardH, 16, COL_ACCENT);

  tft.setTextDatum(TC_DATUM);
  tft.setTextColor(COL_ACCENT, COL_CARD);
  tft.setTextSize(2);
  tft.drawString("Confirm Infusion", SCREEN_W / 2, cardY + 16);

  tft.setTextDatum(TC_DATUM);
  tft.setTextColor(COL_WARN, COL_CARD);
  tft.setTextSize(1);
  tft.drawString("Please verify all parameters before starting", SCREEN_W / 2, cardY + 38);

  int col1X = cardX + 20;
  int col2X = cardX + (cardW / 2) + 10;
  int colW = (cardW / 2) - 30;
  int startY = cardY + 60;
  int lh = 32;

  tft.setTextDatum(TL_DATUM);

  // COLUMN 1
  int y1 = startY;
  tft.setTextColor(COL_ACCENT, COL_CARD);
  tft.setTextSize(1);
  tft.drawString("Infusion Parameters", col1X, y1);
  y1 += 22;

  tft.setTextColor(COL_MUTED, COL_CARD);
  tft.setTextSize(1);
  tft.drawString("Rate:", col1X, y1);
  tft.setTextColor(COL_TEXT, COL_CARD);
  tft.drawString(String(pendingData.rate_ml_per_min, 1) + " ml/min", col1X, y1 + 12);
  y1 += lh;

  tft.setTextColor(COL_MUTED, COL_CARD);
  tft.drawString("Volume:", col1X, y1);
  tft.setTextColor(COL_TEXT, COL_CARD);
  tft.drawString(String(pendingData.volume_ml, 1) + " ml", col1X, y1 + 12);
  y1 += lh;

  tft.setTextColor(COL_MUTED, COL_CARD);
  tft.drawString("Duration:", col1X, y1);
  tft.setTextColor(COL_TEXT, COL_CARD);
  tft.drawString(String(pendingData.time_min, 1) + " min", col1X, y1 + 12);

  // COLUMN 2
  int y2 = startY;
  tft.setTextColor(COL_ACCENT, COL_CARD);
  tft.setTextSize(1);
  tft.drawString("Bolus Settings", col2X, y2);
  y2 += 22;

  tft.setTextColor(COL_MUTED, COL_CARD);
  tft.drawString("Status:", col2X, y2);
  tft.setTextColor(COL_TEXT, COL_CARD);
  tft.drawString(pendingData.bolusEnabled ? "Enabled" : "Disabled", col2X, y2 + 12);
  y2 += lh;

  if (pendingData.bolusEnabled) {
    tft.setTextColor(COL_MUTED, COL_CARD);
    tft.drawString("Amount:", col2X, y2);
    tft.setTextColor(COL_TEXT, COL_CARD);
    tft.drawString(String(pendingData.bolus_ml, 1) + " ml", col2X, y2 + 12);
    y2 += lh;

    tft.setTextColor(COL_MUTED, COL_CARD);
    tft.drawString("Percentage:", col2X, y2);
    tft.setTextColor(COL_TEXT, COL_CARD);
    float percentage = (pendingData.bolus_ml / max(0.001f, pendingData.volume_ml)) * 100;
    tft.drawString(String(percentage, 1) + "%", col2X, y2 + 12);
    y2 += lh;

    // Show expected bolus delivery time
    tft.setTextColor(COL_MUTED, COL_CARD);
    tft.drawString("Delivery time:", col2X, y2);
    tft.setTextColor(COL_TEXT, COL_CARD);
    float bolusTime = calculateBolusDeliveryTime(pendingData.bolus_ml);
    tft.drawString(String(bolusTime, 1) + " sec", col2X, y2 + 12);
  } else {
    tft.setTextColor(COL_MUTED, COL_CARD);
    tft.drawString("No bolus configured", col2X, y2);
  }

  drawButton(btnReject);
  drawButton(btnAccept);
}

void renderRunning() {
  tft.fillScreen(COL_BG);
  drawStatusBar();

  tft.setTextDatum(TC_DATUM);
  tft.setTextColor(COL_ACCENT, COL_BG);
  tft.setTextSize(2);
  tft.drawString("Infusion In Progress", SCREEN_W / 2, STATUS_H + 18);

  int barX = 60, barW = SCREEN_W - 240, barH = 20;
  int y1 = STATUS_H + 60;
  int y2 = y1 + 60;

  // Calculate initial progress based on motor steps (same as updateRunningProgress)
  long totalStepsRequired = activeData.volume_ml * STEPS_PER_ML;
  long stepsDelivered = totalStepsRequired - totalSteps;
  float deliveredVol = stepsDelivered / STEPS_PER_ML;
  float progressFrac = constrain(deliveredVol / max(0.001f, activeData.volume_ml), 0.0f, 1.0f);

  auto drawBar = [&](int x, int y, int w, int h, float frac, uint16_t fill, const char* label) {
    tft.drawRoundRect(x, y, w, h, 6, COL_TEXT);
    tft.fillRoundRect(x + 1, y + 1, (int)((w - 2) * frac), h - 2, 6, fill);
    tft.setTextDatum(TL_DATUM);
    tft.setTextSize(1);
    tft.setTextColor(COL_TEXT, COL_BG);
    tft.drawString(label, x, y - 14);
  };

  // Both bars use the same progress fraction (remaining = 1.0 - progress)
  drawBar(barX, y1, barW, barH, 1.0f - progressFrac, COL_INFOBOX, "Time remaining");
  drawBar(barX, y2, barW, barH, 1.0f - progressFrac, COL_INFOBOX, "Volume remaining");

  // Placeholders (will be overwritten by updateRunningProgress)
  int textX = barX + barW + 10;
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(COL_TEXT, COL_BG);
  tft.setTextSize(1);
  tft.drawString("--", textX, y1 + 4);
  tft.drawString("--", textX, y2 + 4);

  bool blink = (millis() / 500) % 2;
  int cx = SCREEN_W - 50, cy = STATUS_H + 40;
  tft.fillCircle(cx, cy, 10, (pump == PUMP_RUNNING && blink) ? COL_OK : 0x4208);
  tft.drawCircle(cx, cy, 10, COL_TEXT);

  // Show bolus delivery status if it was delivered at start
  if (activeData.bolusEnabled) {
    tft.setTextDatum(TC_DATUM);
    tft.setTextColor(COL_OK, COL_BG);
    tft.setTextSize(1);
    String bolusStatus = "✓ Bolus delivered: " + String(activeData.bolus_ml, 1) + "mL (at start)";
    tft.drawString(bolusStatus, SCREEN_W / 2, SCREEN_H - 100);
  }

  // Control buttons - no bolus button (delivered at start)
  if (pump == PUMP_RUNNING) {
    drawButton(btnPause);
  } else if (pump == PUMP_PAUSED) {
    drawButton(btnResume);
  }
  
  drawButton(btnStop);
}

// -------------------- Motor Control Functions ----------------

void motorEnable(bool enable) {
  digitalWrite(MOTOR_EN_PIN, enable ? LOW : HIGH);  // Active LOW
}

void prepareInfusion(float volume_ml, float rate_ml_per_min) {
  totalSteps = volume_ml * STEPS_PER_ML;
  float mlPerSec = rate_ml_per_min / 60.0;
  float stepsPerSec = mlPerSec * STEPS_PER_ML;
  stepDelay = 1000000.0 / stepsPerSec;  // microseconds
  
  // Minimum step delay to prevent motor stalling
  if (stepDelay < 300) stepDelay = 300;
  
  Serial.println("=== Motor Preparation ===");
  Serial.printf("Volume: %.2f mL | Rate: %.3f mL/min\n", volume_ml, rate_ml_per_min);
  Serial.printf("Syringe: %.1f mL volume, %.1f mm stroke\n", SYRINGE_VOLUME, STROKE_LENGTH);
  
  // Show theoretical vs calibrated values
  float theoretical_steps_per_ml = (STROKE_LENGTH * STEPS_PER_MM) / SYRINGE_VOLUME;
  Serial.printf("Theoretical Steps/ML: %.2f | Calibrated Steps/ML: %.2f\n", theoretical_steps_per_ml, STEPS_PER_ML);
  Serial.printf("Calibration Factor: %.3f\n", CALIBRATION_FACTOR);
  
  Serial.printf("Total Steps: %ld\n", totalSteps);
  Serial.printf("mL/sec: %.4f | Steps/sec: %.2f\n", mlPerSec, stepsPerSec);
  Serial.printf("Step Delay: %lu μs (%.2f steps/sec actual)\n", stepDelay, 1000000.0/stepDelay);
  Serial.printf("Expected Duration: %.1f minutes\n", volume_ml / rate_ml_per_min);
  Serial.println("========================");
}

// Calibration helper function - call this after measuring actual delivery
void printCalibrationInfo(float reported_ml, float actual_ml) {
  float current_factor = CALIBRATION_FACTOR;
  float new_factor = current_factor * (reported_ml / actual_ml);
  
  Serial.println("=== CALIBRATION DATA ===");
  Serial.printf("Reported Volume: %.2f mL\n", reported_ml);
  Serial.printf("Actual Volume: %.2f mL\n", actual_ml);
  Serial.printf("Current Calibration Factor: %.3f\n", current_factor);
  Serial.printf("Suggested New Factor: %.3f\n", new_factor);
  Serial.printf("Update code: const float CALIBRATION_FACTOR = %.3f;\n", new_factor);
  Serial.println("========================");
}

void startMotor() {
  if (totalSteps <= 0) {
    Serial.println("Motor: Cannot start - no steps prepared");
    return;
  }
  
  digitalWrite(MOTOR_DIR_PIN, HIGH);  // Set direction (forward)
  motorEnable(true);                  // Enable motor driver
  infusionActive = true;
  lastStepTime = micros();
  
  // Mark that recenter will be needed after this infusion
  needsRecenter = true;
  
  Serial.println("========== MOTOR STARTED ==========");
  Serial.printf("Initial Total Steps: %ld\n", totalSteps);
  Serial.printf("Target Volume: %.2f mL\n", activeData.volume_ml);
  Serial.printf("Target Rate: %.1f mL/min\n", activeData.rate_ml_per_min);
  Serial.printf("Step Delay: %lu μs\n", stepDelay);
  Serial.printf("Expected Duration: %.1f minutes\n", activeData.time_min);
  Serial.println("Motor stepping initiated...");
  Serial.println("===================================");
}

void stopMotor() {
  infusionActive = false;
  motorEnable(false);  // Disable motor driver
  
  if (totalSteps > 0) {
    float deliveredML = (activeData.volume_ml * STEPS_PER_ML - totalSteps) / STEPS_PER_ML;
    float remainingML = activeData.volume_ml - deliveredML;
    Serial.println("========== MOTOR STOPPED ==========");
    Serial.printf("Delivered: %.2f mL | Remaining: %.2f mL\n", deliveredML, remainingML);
    Serial.printf("Steps Remaining: %ld\n", totalSteps);
    Serial.println("===================================");
  } else {
    Serial.println("Motor: Stopped - infusion complete");
  }
}

void runMotorStep() {
  if (!infusionActive || totalSteps <= 0) return;
  
  unsigned long now = micros();
  if (now - lastStepTime >= stepDelay) {
    lastStepTime = now;
    
    // Generate step pulse
    digitalWrite(MOTOR_STEP_PIN, HIGH);
    delayMicroseconds(10);  // Minimum pulse width
    digitalWrite(MOTOR_STEP_PIN, LOW);
    
    totalSteps--;
    totalStepsDelivered++;  // Track steps for recenter
    
    // Enhanced debug output with multiple frequencies
    static long lastDebugStep = -1;
    static long stepCounter = 0;
    static uint32_t lastTimeLog = 0;
    
    stepCounter++;
    
    // Debug: Log totalStepsDelivered every 100 steps
    if (totalStepsDelivered % 100 == 0) {
      Serial.printf("DEBUG: totalStepsDelivered = %ld (%.2f mL)\n", 
                    totalStepsDelivered, totalStepsDelivered / STEPS_PER_ML);
    }
    
    // Log every 25 steps (more frequent) OR every 5 seconds OR completion
    bool shouldLog = false;
    if ((lastDebugStep - totalSteps) >= 25) shouldLog = true;  // Every 25 steps
    if ((now - lastTimeLog) >= 5000000) shouldLog = true;     // Every 5 seconds
    if (totalSteps == 0) shouldLog = true;                    // At completion
    
    if (shouldLog) {
      float deliveredML = (activeData.volume_ml * STEPS_PER_ML - totalSteps) / STEPS_PER_ML;
      float progressPercent = (deliveredML / activeData.volume_ml) * 100.0;
      float elapsedSec = (millis() - infusionStartMs - pausedAccumMs) / 1000.0;
      float currentRate = (deliveredML / elapsedSec) * 60.0; // mL/min
      
      Serial.printf("STEP[%ld]: Remaining=%ld | Delivered=%.2fmL (%.1f%%) | Rate=%.1fmL/min | Time=%.0fs\n", 
                    stepCounter, totalSteps, deliveredML, progressPercent, currentRate, elapsedSec);
      
      lastDebugStep = totalSteps;
      lastTimeLog = now;
    }
    
    // Log step milestones
    if (stepCounter % 100 == 0) {
      Serial.printf("Motor milestone: %ld steps completed\n", stepCounter);
    }
    
    // Check if infusion is complete
    if (totalSteps <= 0) {
      infusionActive = false;
      infusionCompleted = true;
      showCompletionModal = true;
      pump = PUMP_IDLE;
      motorEnable(false);
      
      float finalDelivered = activeData.volume_ml;
      float totalTime = (millis() - infusionStartMs - pausedAccumMs) / 1000.0;
      float avgRate = (finalDelivered / totalTime) * 60.0;
      
      Serial.println("========== INFUSION COMPLETED ==========");
      Serial.printf("Total Steps Executed: %ld\n", stepCounter);
      Serial.printf("Total Steps Delivered (for recenter): %ld\n", totalStepsDelivered);
      Serial.printf("Expected steps for %.2f mL: %ld\n", finalDelivered, (long)(finalDelivered * STEPS_PER_ML));
      Serial.printf("Volume Delivered: %.2f mL\n", finalDelivered);
      Serial.printf("Total Time: %.1f seconds (%.2f minutes)\n", totalTime, totalTime/60.0);
      Serial.printf("Average Rate: %.1f mL/min\n", avgRate);
      Serial.println("=======================================");
    }
  }
}

void deliverBolusAtStart(float volume_ml) {
  if (volume_ml <= 0) return;
  
  Serial.println("========== BOLUS AT START ==========");
  Serial.printf("Delivering preset bolus: %.2f mL\n", volume_ml);
  Serial.printf("Total infusion volume: %.2f mL\n", activeData.volume_ml);
  Serial.printf("After bolus, remaining: %.2f mL\n", activeData.volume_ml - volume_ml);
  
  long bolusSteps = volume_ml * STEPS_PER_ML;
  Serial.printf("Bolus steps required: %ld\n", bolusSteps);
  
  // Calculate expected delivery time
  float expectedDeliveryTime = calculateBolusDeliveryTime(volume_ml);
  Serial.printf("Expected delivery time: %.1f seconds\n", expectedDeliveryTime);
  
  // Set bolus delivery state
  isDeliveringBolus = true;
  currentBolusSteps = 0;
  totalBolusSteps = bolusSteps;
  currentBolusVolume = volume_ml;
  
  // Show running screen with bolus indicator
  gotoState(UI_RUNNING);
  
  // Enable motor and set direction
  motorEnable(true);
  digitalWrite(MOTOR_DIR_PIN, HIGH);  // Forward direction
  
  Serial.println("Delivering bolus at optimal motor speed...");
  unsigned long bolusStartTime = millis();
  
  // Use tested optimal speed constants
  int stepDelayInt = (int)(BOLUS_STEP_DELAY_MICROS - 5);  // Subtract 5μs for HIGH pulse
  
  Serial.printf("Bolus speed: %.1f steps/sec (%.1f μs total delay)\n", BOLUS_STEPS_PER_SEC, BOLUS_STEP_DELAY_MICROS);
  
  for (long i = 0; i < bolusSteps; i++) {
    digitalWrite(MOTOR_STEP_PIN, HIGH);
    delayMicroseconds(5);  // 5μs HIGH pulse (same as your test)
    digitalWrite(MOTOR_STEP_PIN, LOW);
    delayMicroseconds(stepDelayInt);  // Remaining delay for LOW phase
    
    // Track steps delivered for recenter
    totalStepsDelivered++;
    currentBolusSteps++;
    
    // Update screen every 50 steps
    if (i % 50 == 0) {
      updateRunningProgress();
    }
    
    // Progress feedback every 200 steps
    if (i % 200 == 0) {
      float delivered = (float)i / STEPS_PER_ML;
      Serial.printf("Bolus progress: %.1f/%.1f mL (%.0f%%)\n", 
                    delivered, volume_ml, (delivered/volume_ml)*100);
    }
  }
  
  // Mark that recenter will be needed
  needsRecenter = true;
  
  // Clear bolus delivery state
  isDeliveringBolus = false;
  currentBolusSteps = 0;
  totalBolusSteps = 0;
  
  unsigned long bolusEndTime = millis();
  float bolusDeliveryTime = (bolusEndTime - bolusStartTime) / 1000.0f;
  
  Serial.println("========== BOLUS COMPLETED ==========");
  Serial.printf("Bolus volume delivered: %.2f mL\n", volume_ml);
  Serial.printf("Delivery time: %.2f seconds\n", bolusDeliveryTime);
  Serial.printf("Optimal delivery rate: %.1f mL/min\n", (volume_ml / bolusDeliveryTime) * 60);
  Serial.println("=====================================");
  
  // Publish bolus completion to MQTT
  publishBolusCompletion(volume_ml, bolusDeliveryTime);
}

void deliverBolus(float volume_ml) {
  if (volume_ml <= 0) return;
  
  Serial.println("========== BOLUS DELIVERY STARTED ==========");
  Serial.printf("Bolus Volume: %.2f mL\n", volume_ml);
  Serial.printf("Current Remaining Steps: %ld\n", totalSteps);
  Serial.printf("Total Volume Before Bolus: %.2f mL\n", activeData.volume_ml);
  
  long bolusSteps = volume_ml * STEPS_PER_ML;
  Serial.printf("Bolus Steps Required: %ld\n", bolusSteps);
  
  // Calculate expected delivery time
  float expectedDeliveryTime = calculateBolusDeliveryTime(volume_ml);
  Serial.printf("Expected delivery time: %.1f seconds\n", expectedDeliveryTime);
  
  // Pause the normal infusion motor temporarily
  bool wasInfusionActive = infusionActive;
  if (wasInfusionActive) {
    infusionActive = false;
    Serial.println("Normal infusion paused for bolus delivery");
  }
  
  // Use tested optimal speed constants
  motorEnable(true);
  digitalWrite(MOTOR_DIR_PIN, HIGH);  // Forward direction
  
  Serial.println("Delivering bolus at optimal motor speed...");
  unsigned long bolusStartTime = millis();
  
  int stepDelayInt = (int)(BOLUS_STEP_DELAY_MICROS - 5);  // Subtract 5μs for HIGH pulse
  
  for (long i = 0; i < bolusSteps; i++) {
    digitalWrite(MOTOR_STEP_PIN, HIGH);
    delayMicroseconds(5);  // 5μs HIGH pulse (same as your test)
    digitalWrite(MOTOR_STEP_PIN, LOW);
    delayMicroseconds(stepDelayInt);  // Remaining delay for LOW phase
    
    // Progress feedback every 100 steps
    if (i % 100 == 0) {
      float delivered = (float)i / STEPS_PER_ML;
      Serial.printf("Bolus progress: %.1f/%.1f mL (%.0f%%)\n", 
                    delivered, volume_ml, (delivered/volume_ml)*100);
    }
  }
  
  unsigned long bolusEndTime = millis();
  float bolusDeliveryTime = (bolusEndTime - bolusStartTime) / 1000.0f;
  
  Serial.printf("Bolus delivery completed in %.2f seconds\n", bolusDeliveryTime);
  
  // CRITICAL: Subtract bolus steps from total remaining steps
  // This ensures the remaining infusion accounts for bolus volume already delivered
  totalSteps = max(0L, totalSteps - bolusSteps);
  
  // Update activeData to reflect new remaining volume
  float remainingVolume = totalSteps / STEPS_PER_ML;
  
  Serial.println("========== BOLUS DELIVERY COMPLETED ==========");
  Serial.printf("Bolus Volume Delivered: %.2f mL\n", volume_ml);
  Serial.printf("Delivery Time: %.2f seconds\n", bolusDeliveryTime);
  Serial.printf("Steps Remaining After Bolus: %ld\n", totalSteps);
  Serial.printf("Volume Remaining: %.2f mL\n", remainingVolume);
  Serial.printf("New Infusion: %.2f mL at %.1f mL/min\n", remainingVolume, activeData.rate_ml_per_min);
  Serial.println("===============================================");
  
  // Publish bolus completion to MQTT
  publishBolusCompletion(volume_ml, bolusDeliveryTime);
  
  // Resume normal infusion at original flow rate with remaining volume
  if (wasInfusionActive && totalSteps > 0) {
    infusionActive = true;
    lastStepTime = micros();
    Serial.println("Normal infusion resumed at original flow rate");
  } else if (totalSteps <= 0) {
    // Bolus completed the entire infusion
    infusionActive = false;
    infusionCompleted = true;
    showCompletionModal = true;
    pump = PUMP_IDLE;
    motorEnable(false);
    Serial.println("Infusion completed with bolus delivery");
  }
}

// Recenter pump - return syringe to initial position after infusion
void recenterPump() {
  if (totalStepsDelivered <= 0) {
    Serial.println("No steps to recenter - pump already at initial position");
    return;
  }
  
  isRecentering = true;
  
  Serial.println("========== RECENTER STARTED ==========");
  Serial.printf("Total steps delivered: %ld\n", totalStepsDelivered);
  Serial.printf("Distance to reverse: %.2f mL\n", totalStepsDelivered / STEPS_PER_ML);
  Serial.printf("STEPS_PER_ML constant: %.2f\n", STEPS_PER_ML);
  
  // Use slower speed for recentering (200 steps/sec)
  const float RECENTER_STEPS_PER_SEC = 100.0;
  const float RECENTER_STEP_DELAY_MICROS = 1000000.0 / RECENTER_STEPS_PER_SEC;
  
  motorEnable(true);
  digitalWrite(MOTOR_DIR_PIN, LOW);  // REVERSE direction (opposite of forward)
  delay(10);  // Brief delay for direction change to settle
  
  Serial.printf("Recentering at %.0f steps/sec...\n", RECENTER_STEPS_PER_SEC);
  unsigned long recenterStartTime = millis();
  
  int stepDelayInt = (int)(RECENTER_STEP_DELAY_MICROS - 5);  // Subtract 5μs for HIGH pulse
  
  // Add extra steps to compensate for backlash during reverse direction
  long totalReverseSteps = totalStepsDelivered + BACKLASH_STEPS;
  Serial.printf("Reverse steps including backlash compensation: %ld (%.2f mL)\n", 
                totalReverseSteps, totalReverseSteps / STEPS_PER_ML);
  
  long actualStepsReversed = 0;
  for (long i = 0; i < totalReverseSteps; i++) {
    digitalWrite(MOTOR_STEP_PIN, HIGH);
    delayMicroseconds(5);  // 5μs HIGH pulse (consistent with bolus)
    digitalWrite(MOTOR_STEP_PIN, LOW);
    delayMicroseconds(stepDelayInt);  // Remaining delay for LOW phase
    
    actualStepsReversed++;
    
    // Progress feedback every 500 steps
    if (i % 500 == 0) {
      float reversed = (float)i / STEPS_PER_ML;
      float total = totalReverseSteps / STEPS_PER_ML;
      Serial.printf("Recenter progress: %.1f/%.1f mL (%.0f%%)\n", 
                    reversed, total, (reversed/total)*100);
    }
  }
  
  unsigned long recenterEndTime = millis();
  float recenterTime = (recenterEndTime - recenterStartTime) / 1000.0f;
  
  Serial.println("========== RECENTER COMPLETED ==========");
  Serial.printf("Steps delivered during infusion: %ld (%.2f mL)\n", totalStepsDelivered, totalStepsDelivered / STEPS_PER_ML);
  Serial.printf("Backlash during reverse: %ld steps (%.2f mL)\n", BACKLASH_STEPS, BACKLASH_STEPS / STEPS_PER_ML);
  Serial.printf("Total steps reversed: %ld (%.2f mL)\n", actualStepsReversed, actualStepsReversed / STEPS_PER_ML);
  Serial.printf("Recenter time: %.2f seconds\n", recenterTime);
  Serial.println("Pump returned PAST initial position (reverse backlash compensated)");
  Serial.println("========================================");
  
  // Now apply backlash compensation - move forward to take up mechanical play
  Serial.println("========== BACKLASH COMPENSATION ==========");
  Serial.printf("Moving forward %ld steps (%.2f mL) to compensate for mechanical play\n", 
                BACKLASH_STEPS, BACKLASH_STEPS / STEPS_PER_ML);
  
  digitalWrite(MOTOR_DIR_PIN, HIGH);  // FORWARD direction
  delay(10);  // Brief delay for direction change
  
  for (long i = 0; i < BACKLASH_STEPS; i++) {
    digitalWrite(MOTOR_STEP_PIN, HIGH);
    delayMicroseconds(5);
    digitalWrite(MOTOR_STEP_PIN, LOW);
    delayMicroseconds(stepDelayInt);
  }
  
  Serial.println("Backlash compensation complete");
  Serial.println("Syringe ready for next infusion (gap pre-compensated)");
  Serial.println("===========================================");
  
  // Reset tracking variables
  totalStepsDelivered = 0;
  needsRecenter = false;
  isRecentering = false;
  
  motorEnable(false);
}

// Update only the dynamic parts of running screen (no full redraw)
void updateRunningProgress() {
  if (ui != UI_RUNNING || showCompletionModal) return;

  int barX = 60, barW = SCREEN_W - 240, barH = 20;
  int y1 = STATUS_H + 60;
  int y2 = y1 + 60;

  float originalTotalVolume = activeData.volume_ml + (activeData.bolusEnabled ? activeData.bolus_ml : 0);
  float totalDeliveredVol = 0;
  float totalRemainingVol = originalTotalVolume;
  float progressFrac = 0;
  unsigned long remainingSec = 0;
  
  if (isDeliveringBolus) {
    // During bolus delivery
    float bolusDelivered = currentBolusSteps / STEPS_PER_ML;
    totalDeliveredVol = bolusDelivered;
    totalRemainingVol = originalTotalVolume - bolusDelivered;
    progressFrac = constrain(bolusDelivered / max(0.001f, originalTotalVolume), 0.0f, 1.0f);
    
    // Estimate remaining time for bolus
    float bolusTimeRemaining = (totalBolusSteps - currentBolusSteps) / BOLUS_STEPS_PER_SEC;
    float normalInfusionTime = activeData.time_min * 60.0;
    remainingSec = (unsigned long)(bolusTimeRemaining + normalInfusionTime);
  } else {
    // During normal infusion
    float bolusDelivered = activeData.bolusEnabled ? activeData.bolus_ml : 0;
    long totalStepsRequired = activeData.volume_ml * STEPS_PER_ML;
    long stepsDelivered = totalStepsRequired - totalSteps;
    float normalInfusionDelivered = stepsDelivered / STEPS_PER_ML;
    totalDeliveredVol = bolusDelivered + normalInfusionDelivered;
    totalRemainingVol = originalTotalVolume - totalDeliveredVol;
    progressFrac = constrain(totalDeliveredVol / max(0.001f, originalTotalVolume), 0.0f, 1.0f);
    
    // Calculate remaining time
    if (progressFrac < 1.0f && activeData.time_min > 0) {
      float remainingTimeFraction = 1.0f - progressFrac;
      remainingSec = (unsigned long)(remainingTimeFraction * activeData.time_min * 60);
    }
  }

  tft.fillRoundRect(barX + 1, y1 + 1, barW - 2, barH - 2, 6, COL_BG);
  tft.fillRoundRect(barX + 1, y2 + 1, barW - 2, barH - 2, 6, COL_BG);

  // Both bars show remaining progress (1.0 - progressFrac)
  int timeBarFill = (int)((barW - 2) * (1.0f - progressFrac));
  int volBarFill = (int)((barW - 2) * (1.0f - progressFrac));

  tft.fillRoundRect(barX + 1, y1 + 1, timeBarFill, barH - 2, 6, COL_INFOBOX);
  tft.fillRoundRect(barX + 1, y2 + 1, volBarFill, barH - 2, 6, COL_INFOBOX);

  int textX = barX + barW + 10;
  int textW = SCREEN_W - textX - 60;
  tft.fillRect(textX, y1, textW, 20, COL_BG);
  tft.fillRect(textX, y2, textW, 20, COL_BG);

  int totalRemainingSec = (int)remainingSec;
  int hours = totalRemainingSec / 3600;
  int minutes = (totalRemainingSec % 3600) / 60;
  int seconds = totalRemainingSec % 60;

  String timeStr;
  if (hours > 0) timeStr = String(hours) + "h " + String(minutes) + "m " + String(seconds) + "s";
  else if (minutes > 0) timeStr = String(minutes) + "m " + String(seconds) + "s";
  else timeStr = String(seconds) + "s";

  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(COL_TEXT, COL_BG);
  tft.setTextSize(1);
  tft.drawString(timeStr, textX, y1 + 4);
  tft.drawString(String(totalRemainingVol, 1) + " ml", textX, y2 + 4);
  
  // Draw green upward arrow if delivering bolus
  if (isDeliveringBolus) {
    int arrowX = SCREEN_W - 50;
    int arrowY = y1 + 10;
    
    // Clear previous arrow area
    tft.fillRect(arrowX - 5, arrowY - 20, 30, 40, COL_BG);
    
    // Draw upward arrow in green
    tft.fillTriangle(arrowX, arrowY - 15, arrowX - 10, arrowY, arrowX + 10, arrowY, TFT_GREEN);
    tft.fillRect(arrowX - 4, arrowY, 8, 15, TFT_GREEN);
    
    // Draw "BOLUS" text
    tft.setTextColor(TFT_GREEN, COL_BG);
    tft.setTextSize(1);
    tft.setTextDatum(TC_DATUM);
    tft.drawString("BOLUS", arrowX, arrowY + 18);
  } else {
    // Clear bolus indicator area when not delivering bolus
    static bool wasBolus = false;
    if (wasBolus) {
      int arrowX = SCREEN_W - 50;
      int arrowY = y1 + 10;
      tft.fillRect(arrowX - 15, arrowY - 20, 30, 50, COL_BG);
      wasBolus = false;
    }
    if (isDeliveringBolus) wasBolus = true;
  }

  // Update status indicator (blinking dot)
  bool blink = (millis() / 500) % 2;
  int cx = SCREEN_W - 50, cy = STATUS_H + 40;
  tft.fillCircle(cx, cy, 10, (pump == PUMP_RUNNING && blink) ? COL_OK : 0x4208);
  tft.drawCircle(cx, cy, 10, COL_TEXT);

  // Update bolus status indicator (clear area first to prevent artifacts)
  if (activeData.bolusEnabled && !isDeliveringBolus) {
    tft.fillRect(0, SCREEN_H - 110, SCREEN_W, 20, COL_BG);  // Clear bolus status area
    tft.setTextDatum(TC_DATUM);
    tft.setTextColor(COL_OK, COL_BG);
    tft.setTextSize(1);
    String bolusStatus = "✓ Bolus delivered: " + String(activeData.bolus_ml, 1) + "mL (at start)";
    tft.drawString(bolusStatus, SCREEN_W / 2, SCREEN_H - 100);
  }
}

// Problem modal (yellow)
void drawProblemModal(const String& msg) {
  int w = SCREEN_W - 80, h = 120;
  int x = 40, y = SCREEN_H / 2 - h / 2;
  tft.fillRoundRect(x, y, w, h, 12, TFT_ORANGE);
  tft.drawRoundRect(x, y, w, h, 12, COL_TEXT);

  tft.setTextDatum(TC_DATUM);
  tft.setTextColor(COL_TEXT, TFT_ORANGE);
  tft.setTextSize(2);
  tft.drawString("Warning", SCREEN_W / 2, y + 24);

  tft.setTextSize(1);
  tft.drawString(msg, SCREEN_W / 2, y + 54);

  Button ok = { SCREEN_W / 2 - 40, y + h - 46, 80, 36, "OK", COL_BG, COL_TEXT, COL_TEXT };
  drawButton(ok);
}

// Bubble modal (red)
// Button bubbleOK;  // draw and hit-test
// void drawBubbleModal() {
//   int w = SCREEN_W - 80, h = 140;
//   int x = 40, y = SCREEN_H / 2 - h / 2;
//   tft.fillRoundRect(x, y, w, h, 12, COL_ERR);
//   tft.drawRoundRect(x, y, w, h, 12, COL_TEXT);

//   tft.setTextDatum(TC_DATUM);
//   tft.setTextColor(COL_TEXT, COL_ERR);
//   tft.setTextSize(2);
//   tft.drawString("Bubble Detected!", SCREEN_W / 2, y + 26);

//   tft.setTextSize(1);
//   tft.drawString("Air bubble in IV line. Please clear.", SCREEN_W / 2, y + 58);

//   bubbleOK = { SCREEN_W / 2 - 50, y + h - 50, 100, 40, "OK", COL_BG, COL_TEXT, COL_TEXT };
//   drawButton(bubbleOK);
// }

// Completion modal (green)
Button completionOK;  // draw and hit-test

// Bubble modal (red)
Button bubbleOK;  // draw and hit-test
void drawCompletionModal() {
  int w = SCREEN_W - 80, h = 140;
  int x = 40, y = SCREEN_H / 2 - h / 2;
  
  // Add a semi-transparent overlay to darken the background
  tft.fillRect(0, 0, SCREEN_W, SCREEN_H, 0x4208); // Dark grey overlay
  
  // Draw the modal with a border shadow for better visibility
  tft.fillRoundRect(x + 2, y + 2, w, h, 12, 0x2104); // Shadow
  tft.fillRoundRect(x, y, w, h, 12, COL_OK);
  tft.drawRoundRect(x, y, w, h, 12, COL_TEXT);

  tft.setTextDatum(TC_DATUM);
  tft.setTextColor(COL_TEXT, COL_OK);
  tft.setTextSize(2);
  tft.drawString("Infusion Complete!", SCREEN_W / 2, y + 26);

  tft.setTextSize(1);
  tft.drawString("The infusion has been completed successfully.", SCREEN_W / 2, y + 58);

  completionOK = { SCREEN_W / 2 - 50, y + h - 50, 100, 40, "OK", COL_BG, COL_TEXT, COL_TEXT };
  drawButton(completionOK);
}

// Bubble modal (critical red overlay)
void drawBubbleModal() {
  int w = SCREEN_W - 60, h = 160;
  int x = 30, y = SCREEN_H / 2 - h / 2;
  
  // Draw prominent overlay to ensure modal stays on top (prevents slider interference)
  tft.fillRect(x - 15, y - 15, w + 30, h + 30, 0x1082); // Darker, larger overlay for z-index
  
  // Draw the modal with prominent borders to ensure highest z-index
  tft.fillRoundRect(x + 4, y + 4, w, h, 12, 0x0841); // Darker shadow
  tft.fillRoundRect(x, y, w, h, 12, COL_ERR);
  tft.drawRoundRect(x, y, w, h, 12, TFT_WHITE);
  tft.drawRoundRect(x + 1, y + 1, w - 2, h - 2, 11, TFT_WHITE); // Double border
  tft.drawRoundRect(x + 2, y + 2, w - 4, h - 4, 10, TFT_YELLOW); // Triple border for prominence

  // Critical warning icon (exclamation in triangle)
  int iconX = x + 20, iconY = y + 20;
  tft.fillTriangle(iconX, iconY + 20, iconX + 10, iconY, iconX + 20, iconY + 20, TFT_YELLOW);
  tft.drawTriangle(iconX, iconY + 20, iconX + 10, iconY, iconX + 20, iconY + 20, TFT_WHITE);
  tft.setTextDatum(TC_DATUM);
  tft.setTextColor(TFT_BLACK, TFT_YELLOW);
  tft.setTextSize(2);
  tft.drawString("!", iconX + 10, iconY + 6);

  // Title
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(TFT_WHITE, COL_ERR);
  tft.setTextSize(2);
  tft.drawString("BUBBLE DETECTED!", x + 50, y + 20);

  // Warning message
  tft.setTextSize(1);
  tft.drawString("Air bubble detected in IV line.", x + 20, y + 50);
  tft.drawString("Infusion has been automatically paused.", x + 20, y + 65);
  tft.drawString("Please clear the bubble and press OK to continue.", x + 20, y + 85);

  // Status indicator with cleaner text
  bool bubbleStillPresent = digitalRead(BUBBLE_PIN) == HIGH;
  
  if (bubbleStillPresent) {
    // Show warning status when bubble still present
    tft.setTextColor(TFT_YELLOW, COL_ERR);
    tft.drawString("Status: BUBBLE STILL PRESENT", x + 20, y + 105);
    tft.setTextColor(TFT_RED, COL_ERR);
    tft.drawString("Please clear the air bubble to continue", x + 20, y + 120);
    
    // No button when bubble present - just text
  } else {
    // Show success status when bubble cleared
    tft.setTextColor(TFT_GREEN, COL_ERR);
    tft.drawString("Status: BUBBLE CLEARED", x + 20, y + 105);
    tft.setTextColor(TFT_WHITE, COL_ERR);
    // tft.drawString("Ready to resume infusion", x + 20, y + 120);
    
    // Show Resume button only when bubble is cleared
    bubbleOK = { SCREEN_W / 2 - 50, y + h - 45, 100, 35, 
                 "RESUME", 
                 COL_OK, COL_TEXT, COL_TEXT };
    drawButton(bubbleOK);
  }
  
  bubbleModalDrawn = true;
}

// -------------------- Motor Control Functions ---------------------
// Motor control functionality has been removed

// -------------------- State switch ---------------------
void renderHome();
void renderManualInput();
void renderManualBolus();
void renderConfirm();
void renderRunning();
void renderSplash(const char*);

void gotoState(UIState s) {
  ui = s;
  if (ui == UI_SPLASH) {
    renderSplash("Powered by DISA IIT Delhi");
  } else if (ui == UI_HOME) {
    renderHome();
  } else if (ui == UI_MANUAL_INPUT) {
    if (inRate.value == "") focusField(&inRate);
    renderManualInput();
  } else if (ui == UI_MANUAL_BOLUS) {
    renderManualBolus();
  } else if (ui == UI_CONFIRM) {
    renderConfirm();
  } else if (ui == UI_RUNNING) {
    renderRunning();
  } else if (ui == UI_SCREENSAVER) {
    renderSplash("Powered by DISA IIT Delhi");
  }
}

// -------------------- MQTT Message Handling --------------------
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  // 🚨 FIRST THING: Confirm callback is being called
  Serial.println("");
  Serial.println("🎉 MQTT CALLBACK TRIGGERED!");
  Serial.println("=================================");
  
  String topicStr = String(topic);
  String message;
  message.reserve(length);
  for (unsigned int i = 0; i < length; i++) message += (char)payload[i];

  Serial.println("📥 MQTT Message Received:");
  Serial.println("   Topic: " + topicStr);
  Serial.println("   Length: " + String(length) + " bytes");
  Serial.println("   Raw Message: " + message);
  Serial.println("");

  String expectedTopic = "devices/" + String(DEVICE_ID) + "/commands";
  
  Serial.println("🔍 Topic Verification:");
  Serial.println("   Expected: " + expectedTopic);
  Serial.println("   Received: " + topicStr);
  Serial.println("   Match: " + String(topicStr == expectedTopic ? "YES" : "NO"));
  
  if (topicStr != expectedTopic) {
    Serial.println("❌ Topic mismatch!");
    Serial.println("   🚨 Your backend might be publishing to wrong topic!");
    Serial.println("   🚨 Check mqttService.publishCommand() topic construction!");
    return;
  }

  Serial.println("✅ Topic matches - parsing JSON...");

  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, message);
  if (error) {
    Serial.println("❌ JSON Parse Error: " + String(error.c_str()));
    Serial.println("   Raw message: " + message);
    return;
  }

  Serial.println("✅ JSON parsed successfully");

  String command = doc["command"];
  String commandId = doc["commandId"]; 
  String timestamp = doc["timestamp"];

  Serial.println("📋 Parsed Command Details:");
  Serial.println("   Command: " + command);
  Serial.println("   Command ID: " + commandId);
  Serial.println("   Timestamp: " + timestamp);

  Serial.println("");
  Serial.println("🎯 Routing command: " + command);
  
  if (command == "START_INFUSION") {
    Serial.println("   → Calling handleStartInfusion()");
    handleStartInfusion(doc);
  } else if (command == "STOP_INFUSION") {
    Serial.println("   → Calling handleStopInfusion()");
    handleStopInfusion(doc);
  } else if (command == "PAUSE_INFUSION") {
    Serial.println("   → Calling handlePauseInfusion()");
    handlePauseInfusion(doc);
  } else if (command == "RESUME_INFUSION") {
    Serial.println("   → Calling handleResumeInfusion()");
    handleResumeInfusion(doc);
  } else {
    Serial.println("❌ Unknown command: " + command);
    Serial.println("   Supported commands: START_INFUSION, STOP_INFUSION, PAUSE_INFUSION, RESUME_INFUSION");
  }
}

void handleStartInfusion(DynamicJsonDocument& doc) {
  Serial.println("");
  Serial.println("🚀 Processing START_INFUSION command...");

  // Debug: Check if payload exists
  if (!doc.containsKey("payload")) {
    Serial.println("❌ ERROR: No 'payload' key found in command!");
    return;
  }

  Serial.println("✅ Payload found - extracting parameters...");

  // Extract infusion parameters from payload
  pendingData.rate_ml_per_min = doc["payload"]["flowRateMlMin"].as<float>();
  pendingData.volume_ml = doc["payload"]["plannedVolumeMl"].as<float>();
  pendingData.time_min = doc["payload"]["plannedTimeMin"].as<float>();

  // Capture infusion ID for tracking (this is crucial for confirmation)
  if (doc["payload"].containsKey("infusionId")) {
    currentInfusionId = doc["payload"]["infusionId"].as<String>();
    Serial.println("💉 ✅ Infusion ID Captured: " + currentInfusionId);
  } else {
    Serial.println("⚠️  WARNING: No infusion ID provided in START_INFUSION command");
    Serial.println("   Available payload keys:");
    JsonObject payload = doc["payload"];
    for (JsonPair kv : payload) {
      Serial.println("     - " + String(kv.key().c_str()));
    }
    currentInfusionId = "";
  }

  Serial.println("📋 Extracted Infusion Parameters:");
  Serial.println("   Flow Rate: " + String(pendingData.rate_ml_per_min) + " ml/min");
  Serial.println("   Volume: " + String(pendingData.volume_ml) + " ml");
  Serial.println("   Time: " + String(pendingData.time_min) + " min");

  // Parse bolus configuration properly
  if (doc["payload"]["bolus"]["enabled"].as<bool>()) {
    pendingData.bolusEnabled = true;
    pendingData.bolus_ml = doc["payload"]["bolus"]["volumeMl"].as<float>();
    Serial.println("   Bolus: Enabled - " + String(pendingData.bolus_ml) + " ml");
  } else {
    pendingData.bolusEnabled = false;
    pendingData.bolus_ml = 0;
    Serial.println("   Bolus: Disabled");
  }

  // Motor will be prepared and started after user confirmation in handleConfirmTouch
  Serial.println("");
  Serial.println("🎯 Infusion Parameters Stored Successfully!");
  Serial.println("   Stored Infusion ID: " + currentInfusionId);
  Serial.println("   Awaiting user confirmation on device...");
  Serial.println("   When user taps ACCEPT → publishInfusionConfirmation() will be called");
  Serial.println("");
  
  gotoState(UI_CONFIRM);
  publishDeviceStatus("received_start_command");
  Serial.println("📱 Switched to confirmation screen - waiting for user input");
}

void handleStopInfusion(DynamicJsonDocument& doc) {
  Serial.println("Processing STOP_INFUSION command...");

  String reason = doc["payload"]["reason"];
  bool emergency = doc["payload"]["emergency"];

  Serial.println("Reason: " + reason);
  Serial.println("Emergency: " + String(emergency ? "true" : "false"));

  // Stop motor
  stopMotor();
  totalSteps = 0;  // Clear remaining steps
  
  // Clear infusion tracking
  Serial.println("🛑 MQTT STOP command - clearing infusion ID: " + currentInfusionId);
  currentInfusionId = "";
  
  pump = PUMP_IDLE;
  publishDeviceStatus("stopped");
  gotoState(UI_HOME);
  Serial.println("Infusion stopped and returned to home screen");
}

void handlePauseInfusion(DynamicJsonDocument& doc) {
  Serial.println("Processing PAUSE_INFUSION command...");
  String reason = doc["payload"]["reason"];
  Serial.println("Reason: " + reason);

  if (pump == PUMP_RUNNING) {
    // Pause motor
    infusionActive = false;
    motorEnable(false);
    
    pump = PUMP_PAUSED;
    pauseStartMs = millis();
    publishDeviceStatus("paused");
    if (ui == UI_RUNNING) {
      renderRunning();
    }
    Serial.println("Infusion paused successfully");
  } else {
    Serial.println("Cannot pause - pump is not running");
  }
}

void handleResumeInfusion(DynamicJsonDocument& doc) {
  Serial.println("Processing RESUME_INFUSION command...");

  if (pump == PUMP_PAUSED) {
    pump = PUMP_RUNNING;
    pausedAccumMs += (millis() - pauseStartMs);
    pauseStartMs = 0;
    
    // Resume motor stepping
    if (totalSteps > 0) {
      motorEnable(true);
      infusionActive = true;
      lastStepTime = micros();
    }
    
    publishDeviceStatus("running");
    if (ui == UI_RUNNING) {
      renderRunning();
    }
    Serial.println("Infusion resumed successfully");
  } else {
    Serial.println("Cannot resume - pump is not paused");
  }
}

void publishDeviceStatus(const char* status) {
  DynamicJsonDocument doc(512);
  doc["deviceId"] = DEVICE_ID;
  doc["status"] = status;
  doc["timestamp"] = millis();

  if (pump != PUMP_IDLE) {
    doc["currentInfusion"]["rate"] = activeData.rate_ml_per_min;
    doc["currentInfusion"]["volume"] = activeData.volume_ml;
    doc["currentInfusion"]["time"] = activeData.time_min;
    doc["currentInfusion"]["bolusEnabled"] = activeData.bolusEnabled;
    doc["currentInfusion"]["bolusVolume"] = activeData.bolus_ml;

    if (pump == PUMP_RUNNING || pump == PUMP_PAUSED) {
      // Calculate progress based on motor steps delivered
      long totalStepsRequired = activeData.volume_ml * STEPS_PER_ML;
      long stepsDelivered = totalStepsRequired - totalSteps;  // totalSteps decrements as steps are delivered
      
      float deliveredVol = stepsDelivered / STEPS_PER_ML;
      
      // Time calculation for elapsed time reporting
      uint32_t now = millis();
      uint32_t elapsedMs = 0;
      if (pump == PUMP_RUNNING) {
        elapsedMs = (now - infusionStartMs - pausedAccumMs);
      } else {
        uint32_t pausedNow = pausedAccumMs + (pauseStartMs ? (now - pauseStartMs) : 0);
        elapsedMs = (now - infusionStartMs - pausedNow);
      }
      float elapsedMin = elapsedMs / 60000.0f;
      
      doc["progress"]["elapsedMin"] = elapsedMin;
      doc["progress"]["deliveredVol"] = deliveredVol;
      doc["progress"]["remainingSteps"] = totalSteps;
      doc["progress"]["percentComplete"] = (deliveredVol / max(0.001f, activeData.volume_ml)) * 100.0f;
    }
  }

  String statusTopic = "device/" + String(DEVICE_ID) + "/status";
  String message;
  serializeJson(doc, message);

  mqttClient.publish(statusTopic.c_str(), message.c_str());
  Serial.println("Published status: " + message);
}

// -------------------- MQTT Infusion Tracking --------------------
void publishInfusionConfirmation() {
  if (currentInfusionId.length() == 0) {
    Serial.println("❌ ERROR: Cannot publish infusion confirmation - no infusion ID stored!");
    Serial.println("   This means START_INFUSION command didn't include infusionId");
    return;
  }

  // Create confirmation payload matching temp.js format
  DynamicJsonDocument doc(512);
  doc["confirmed"] = true;
  doc["infusionId"] = currentInfusionId;
  doc["confirmedAt"] = millis(); // Use millis() as timestamp (like temp.js)
  
  // Include parameters as sent in temp.js
  doc["parameters"]["flowRateMlMin"] = activeData.rate_ml_per_min;
  doc["parameters"]["plannedVolumeMl"] = activeData.volume_ml;
  doc["parameters"]["plannedTimeMin"] = activeData.time_min;
  
  // Add bolus parameters
  if (activeData.bolusEnabled) {
    doc["parameters"]["bolusEnabled"] = true;
    doc["parameters"]["bolusVolumeMl"] = activeData.bolus_ml;
  } else {
    doc["parameters"]["bolusEnabled"] = false;
    doc["parameters"]["bolusVolumeMl"] = 0;
  }

  String topic = "devices/" + String(DEVICE_ID) + "/infusion";
  String message;
  serializeJson(doc, message);

  Serial.println("");
  Serial.println("💉 Publishing Infusion Confirmation (like temp.js):");
  Serial.println("   Topic: " + topic);
  Serial.println("   Infusion ID: " + currentInfusionId);
  Serial.println("   Device ID: " + String(DEVICE_ID));
  Serial.println("   Confirmed: true");
  Serial.println("   Flow Rate: " + String(activeData.rate_ml_per_min) + " ml/min");
  Serial.println("   Volume: " + String(activeData.volume_ml) + " ml");
  Serial.println("   Time: " + String(activeData.time_min) + " min");
  Serial.println("   Bolus: " + String(activeData.bolusEnabled ? "Enabled" : "Disabled"));
  Serial.println("   Full Message: " + message);
  Serial.println("");

  mqttClient.publish(topic.c_str(), message.c_str(), true); // retained = true (QoS 1 like temp.js)
  
  Serial.println("✅ Infusion confirmation published successfully!");
  Serial.println("📋 Expected backend workflow:");
  Serial.println("   1. Backend receives MQTT confirmation");
  Serial.println("   2. Backend validates infusion ID: " + currentInfusionId);
  Serial.println("   3. Backend updates device status to 'running'");
  Serial.println("   4. Backend updates infusion status to 'confirmed'");
  Serial.println("   5. Backend streams confirmation to Socket.IO");
  Serial.println("   6. Frontend receives confirmation and starts monitoring");
  Serial.println("");
}

void publishProgressUpdate() {
  if (currentInfusionId.length() == 0 || !infusionActive) {
    return;
  }

  // Calculate progress accounting for bolus delivered at start
  float originalTotalVolume = activeData.volume_ml + (activeData.bolusEnabled ? activeData.bolus_ml : 0);
  float bolusDelivered = activeData.bolusEnabled ? activeData.bolus_ml : 0;
  
  long totalStepsRequired = activeData.volume_ml * STEPS_PER_ML;  // Steps for remaining volume only
  long stepsDelivered = totalStepsRequired - totalSteps;
  
  float normalInfusionDelivered = stepsDelivered / STEPS_PER_ML;
  float totalDeliveredVol = bolusDelivered + normalInfusionDelivered;
  float totalRemainingVol = originalTotalVolume - totalDeliveredVol;
  
  // Time calculation
  uint32_t now = millis();
  uint32_t elapsedMs = 0;
  if (pump == PUMP_RUNNING) {
    elapsedMs = (now - infusionStartMs - pausedAccumMs);
  } else {
    uint32_t pausedNow = pausedAccumMs + (pauseStartMs ? (now - pauseStartMs) : 0);
    elapsedMs = (now - infusionStartMs - pausedNow);
  }
  float elapsedMin = elapsedMs / 60000.0f;
  
  // Calculate progress and remaining time based on original total volume
  float progressPercent = (totalDeliveredVol / max(0.001f, originalTotalVolume)) * 100.0f;
  float timeRemainingMin = max(0.0f, activeData.time_min * (1.0f - (progressPercent / 100.0f)));

  DynamicJsonDocument doc(512);
  doc["timeRemainingMin"] = round(timeRemainingMin * 100.0f) / 100.0f;
  doc["volumeRemainingMl"] = round(totalRemainingVol * 100.0f) / 100.0f;
  doc["timestamp"] = now;
  doc["elapsedTimeMin"] = round(elapsedMin * 100.0f) / 100.0f;
  doc["deliveredVolumeMl"] = round(totalDeliveredVol * 100.0f) / 100.0f;
  doc["progressPercent"] = round(progressPercent * 100.0f) / 100.0f;
  doc["flowRate"] = activeData.rate_ml_per_min;
  doc["status"] = (pump == PUMP_RUNNING) ? "running" : "paused";
  
  // Include bolus information
  if (activeData.bolusEnabled) {
    doc["bolusDelivered"] = round(bolusDelivered * 100.0f) / 100.0f;
    doc["normalInfusionDelivered"] = round(normalInfusionDelivered * 100.0f) / 100.0f;
    doc["originalTotalVolume"] = round(originalTotalVolume * 100.0f) / 100.0f;
  }

  String topic = "devices/" + String(DEVICE_ID) + "/progress";
  String message;
  serializeJson(doc, message);

  mqttClient.publish(topic.c_str(), message.c_str());
  
  // Debug output every 10 seconds instead of every update
  static uint32_t lastProgressLog = 0;
  if (now - lastProgressLog >= 10000) {
    lastProgressLog = now;
    Serial.printf("📈 Progress Update: %.1f%% | Total: %.2f/%.2fmL (Bolus: %.1f + Normal: %.1f) | %.1fmin remaining\n", 
                  progressPercent, totalDeliveredVol, originalTotalVolume, bolusDelivered, normalInfusionDelivered, timeRemainingMin);
  }
}

void publishBolusCompletion(float bolusVolume, float deliveryTime) {
  if (currentInfusionId.length() == 0) {
    Serial.println("Warning: Cannot publish bolus completion - no infusion ID");
    return;
  }

  DynamicJsonDocument doc(512);
  doc["action"] = "BOLUS_COMPLETED";
  doc["deviceId"] = DEVICE_ID;
  doc["infusionId"] = currentInfusionId;
  doc["timestamp"] = millis();
  doc["bolusDelivered"] = bolusVolume;
  doc["deliveryTimeSeconds"] = deliveryTime;
  doc["remainingSteps"] = totalSteps;
  doc["remainingVolume"] = totalSteps / STEPS_PER_ML;
  doc["status"] = "bolus_completed_resuming_normal";

  String topic = "devices/" + String(DEVICE_ID) + "/bolus";
  String message;
  serializeJson(doc, message);

  Serial.println("💉 Publishing Bolus Completion:");
  Serial.println("   Topic: " + topic);
  Serial.println("   Bolus Volume: " + String(bolusVolume, 2) + " ml");
  Serial.println("   Delivery Time: " + String(deliveryTime, 2) + " seconds");
  Serial.println("   Remaining Volume: " + String(totalSteps / STEPS_PER_ML, 2) + " ml");
  
  mqttClient.publish(topic.c_str(), message.c_str(), true);
  Serial.println("✅ Bolus completion published successfully!");
}

void publishInfusionCompletion() {
  if (currentInfusionId.length() == 0) {
    Serial.println("Warning: Cannot publish infusion completion - no infusion ID");
    return;
  }

  // Calculate final statistics
  float totalTime = (millis() - infusionStartMs - pausedAccumMs) / 60000.0f; // in minutes
  float totalVolume = activeData.volume_ml;
  float avgFlowRate = (totalVolume / totalTime);
  float efficiency = (totalVolume / activeData.volume_ml) * 100.0f;

  // Final progress data showing completion
  DynamicJsonDocument finalProgressDoc(512);
  finalProgressDoc["timeRemainingMin"] = 0;
  finalProgressDoc["volumeRemainingMl"] = 0;
  finalProgressDoc["timestamp"] = millis();
  finalProgressDoc["elapsedTimeMin"] = round(totalTime * 100.0f) / 100.0f;
  finalProgressDoc["deliveredVolumeMl"] = round(totalVolume * 100.0f) / 100.0f;
  finalProgressDoc["progressPercent"] = 100;
  finalProgressDoc["flowRate"] = activeData.rate_ml_per_min;
  finalProgressDoc["status"] = "completed";

  String progressTopic = "devices/" + String(DEVICE_ID) + "/progress";
  String finalProgressMessage;
  serializeJson(finalProgressDoc, finalProgressMessage);
  mqttClient.publish(progressTopic.c_str(), finalProgressMessage.c_str());

  // Completion notification
  DynamicJsonDocument completionDoc(512);
  completionDoc["completed"] = true;
  completionDoc["completedAt"] = millis();
  completionDoc["summary"]["totalTimeMin"] = round(totalTime * 100.0f) / 100.0f;
  completionDoc["summary"]["totalVolumeMl"] = round(totalVolume * 100.0f) / 100.0f;
  completionDoc["summary"]["plannedTimeMin"] = activeData.time_min;
  completionDoc["summary"]["plannedVolumeMl"] = activeData.volume_ml;
  completionDoc["summary"]["avgFlowRate"] = round(avgFlowRate * 100.0f) / 100.0f;
  completionDoc["summary"]["efficiency"] = round(efficiency);
  completionDoc["deviceStatus"] = "healthy";

  String completionTopic = "devices/" + String(DEVICE_ID) + "/completion";
  String completionMessage;
  serializeJson(completionDoc, completionMessage);

  Serial.println("🏆 Publishing Infusion Completion:");
  Serial.println("   Topic: " + completionTopic);
  Serial.println("   Infusion ID: " + currentInfusionId);
  Serial.println("   Total Time: " + String(totalTime, 2) + " min");
  Serial.println("   Total Volume: " + String(totalVolume, 2) + " ml");
  Serial.println("   Efficiency: " + String(efficiency, 0) + "%");
  
  mqttClient.publish(completionTopic.c_str(), completionMessage.c_str(), true); // retained = true
  Serial.println("✅ Infusion completion published successfully!");
}

// -------------------- Manual Device Action MQTT Publishing --------------------
void publishManualPause() {
  DynamicJsonDocument doc(512);
  doc["action"] = "MANUAL_PAUSE";
  doc["deviceId"] = DEVICE_ID;
  doc["timestamp"] = millis();
  doc["source"] = "device_screen";
  doc["reason"] = "manual_user_action";
  
  if (currentInfusionId.length() > 0) {
    doc["infusionId"] = currentInfusionId;
  }

  String topic = "devices/" + String(DEVICE_ID) + "/actions";
  String message;
  serializeJson(doc, message);

  Serial.println("⏸️  Publishing Manual PAUSE Action:");
  Serial.println("   Topic: " + topic);
  Serial.println("   Action: MANUAL_PAUSE");
  Serial.println("   Source: Device Screen");
  Serial.println("   Message: " + message);

  mqttClient.publish(topic.c_str(), message.c_str(), true); // retained = true
  Serial.println("✅ Manual pause action published successfully!");
}

void publishManualResume() {
  DynamicJsonDocument doc(512);
  doc["action"] = "MANUAL_RESUME";
  doc["deviceId"] = DEVICE_ID;
  doc["timestamp"] = millis();
  doc["source"] = "device_screen";
  doc["reason"] = "manual_user_action";
  
  if (currentInfusionId.length() > 0) {
    doc["infusionId"] = currentInfusionId;
  }

  String topic = "devices/" + String(DEVICE_ID) + "/actions";
  String message;
  serializeJson(doc, message);

  Serial.println("▶️  Publishing Manual RESUME Action:");
  Serial.println("   Topic: " + topic);
  Serial.println("   Action: MANUAL_RESUME");
  Serial.println("   Source: Device Screen");
  Serial.println("   Message: " + message);

  mqttClient.publish(topic.c_str(), message.c_str(), true); // retained = true
  Serial.println("✅ Manual resume action published successfully!");
}

void publishManualStop() {
  DynamicJsonDocument doc(512);
  doc["action"] = "MANUAL_STOP";
  doc["deviceId"] = DEVICE_ID;
  doc["timestamp"] = millis();
  doc["source"] = "device_screen";
  doc["reason"] = "manual_user_action";
  
  if (currentInfusionId.length() > 0) {
    doc["infusionId"] = currentInfusionId;
  }

  String topic = "devices/" + String(DEVICE_ID) + "/actions";
  String message;
  serializeJson(doc, message);

  Serial.println("🛑 Publishing Manual STOP Action:");
  Serial.println("   Topic: " + topic);
  Serial.println("   Action: MANUAL_STOP");
  Serial.println("   Source: Device Screen");
  Serial.println("   Message: " + message);

  mqttClient.publish(topic.c_str(), message.c_str(), true); // retained = true
  Serial.println("✅ Manual stop action published successfully!");
}

void publishBubbleError(bool bubbleDetected) {
  DynamicJsonDocument doc(512);
  
  // Use format matching error-simulator.js structure
  doc["type"] = bubbleDetected ? "bubble_detected" : "bubble_cleared";
  doc["severity"] = "high";  // High severity to trigger modal and error sound
  doc["message"] = bubbleDetected ? "Air bubble detected in IV line - infusion automatically paused for patient safety" : "Bubble cleared - infusion ready to resume";
  doc["deviceId"] = DEVICE_ID;
  doc["timestamp"] = getISOTimestamp();
  
  // Add details object like error simulator
  JsonObject details = doc.createNestedObject("details");
  details["sensorPin"] = BUBBLE_PIN;
  details["sensorValue"] = digitalRead(BUBBLE_PIN);
  details["autoAction"] = bubbleDetected ? "PAUSED_INFUSION" : "READY_TO_RESUME";
  details["pumpStatus"] = pump == PUMP_RUNNING ? "running" : pump == PUMP_PAUSED ? "paused" : "idle";
  
  if (currentInfusionId.length() > 0) {
    details["infusionId"] = currentInfusionId;
    details["wasRunningBeforeBubble"] = wasRunningBeforeBubble;
  }

  String topic = "devices/" + String(DEVICE_ID) + "/error";
  String message;
  serializeJson(doc, message);

  Serial.println(bubbleDetected ? "🚨 Publishing HIGH SEVERITY Bubble Error:" : "✅ Publishing Bubble Cleared Notification:");
  Serial.println("   Topic: " + topic);
  Serial.println("   Type: " + String(bubbleDetected ? "bubble_detected" : "bubble_cleared"));
  Serial.println("   Severity: high (triggers modal + error sound)");
  Serial.println("   Auto Action: " + String(bubbleDetected ? "PAUSED_INFUSION" : "READY_TO_RESUME"));
  Serial.println("   Message: " + message);

  mqttClient.publish(topic.c_str(), message.c_str(), true); // retained = true
  Serial.println(bubbleDetected ? "🚨 HIGH severity bubble error published!" : "✅ Bubble cleared notification published!");
}

// -------------------- Bubble Detection ---------------------
void pollBubble() {
  // Only check bubbles during infusion (running or paused states)
  if (pump == PUMP_IDLE || ui != UI_RUNNING) return;
  
  // Throttle bubble checking for performance
  uint32_t now = millis();
  if (now - lastBubbleCheck < BUBBLE_CHECK_INTERVAL) return;
  lastBubbleCheck = now;
  
  bool nowHigh = (digitalRead(BUBBLE_PIN) == HIGH);  // HIGH = bubble detected

  // Bubble detected (transition from no bubble to bubble)
  if (nowHigh && !bubblePresent) {
    Serial.println("");
    Serial.println("🚨 BUBBLE DETECTED! Pausing infusion...");
    Serial.println("   Sensor GPIO" + String(BUBBLE_PIN) + ": HIGH (air detected)");
    
    bubblePresent = true;
    
    // Auto-pause infusion if running
    if (pump == PUMP_RUNNING) {
      wasRunningBeforeBubble = true;
      
      // Pause motor immediately
      infusionActive = false;
      motorEnable(false);
      
      pump = PUMP_PAUSED;
      pauseStartMs = millis();
      
      // Publish MQTT error only once per bubble detection event
      if (!bubbleErrorSent) {
        publishBubbleError(true);
        bubbleErrorSent = true;  // Prevent rapid MQTT messages
        Serial.println("📡 MQTT bubble error sent (state locked to prevent spam)");
      }
      
      // Publish device status as paused due to bubble
      publishDeviceStatus("paused");
      
      Serial.println("✅ Infusion automatically paused due to bubble detection");
    } else {
      wasRunningBeforeBubble = false;
    }
    
    // Show bubble modal (overlay only, no full screen redraw)
    if (!showBubbleModal) {
      showBubbleModal = true;
      bubbleModalDrawn = false;  // Only redraw modal, not entire screen
      Serial.println("📱 Showing bubble detection modal (overlay mode)");
    }
  }
  
  // Bubble cleared (transition from bubble to no bubble)
  else if (!nowHigh && bubblePresent) {
    Serial.println("");
    Serial.println("✅ BUBBLE CLEARED!");
    Serial.println("   Sensor GPIO" + String(BUBBLE_PIN) + ": LOW (liquid detected)");
    
    bubblePresent = false;
    bubbleErrorSent = false;  // Reset error state flag for next bubble detection
    
    // Publish bubble cleared notification (only once)
    publishBubbleError(false);
    Serial.println("📡 MQTT bubble cleared notification sent");
    
    // Update modal display to show bubble is cleared (OK button enabled)
    if (showBubbleModal) {
      bubbleModalDrawn = false;  // Force modal redraw only with updated button state
      Serial.println("📱 Updating bubble modal - OK button now enabled (overlay update)");
    }
  }
}

// -------------------- Touch Handling ------------------
bool getTouch(uint16_t& x, uint16_t& y) {
  if (!tft.getTouch(&x, &y)) return false;

  Serial.print("Raw touch: x=");
  Serial.print(x);
  Serial.print(", y=");
  Serial.println(y);

  uint32_t now = millis();
  if (now - lastTouchMs < touchDebounce) {
    Serial.println("Touch debounced");
    return false;
  }
  lastTouchMs = now;
  lastInteractionMs = now;

  Serial.print("Valid touch: x=");
  Serial.print(x);
  Serial.print(", y=");
  Serial.print(y);
  Serial.print(", UI state: ");
  Serial.println(ui);
  return true;
}

void handleManualInputTouch(uint16_t x, uint16_t y) {
  if (x >= inRate.x && x <= inRate.x + inRate.w && y >= inRate.y && y <= inRate.y + inRate.h) {
    focusField(&inRate);
    return;
  }
  if (x >= inVol.x && x <= inVol.x + inVol.w && y >= inVol.y && y <= inVol.y + inVol.h) {
    focusField(&inVol);
    return;
  }
  if (x >= inTime.x && x <= inTime.x + inTime.w && y >= inTime.y && y <= inTime.y + inTime.h) {
    focusField(&inTime);
    return;
  }

  if (inBtn(btnDiscard, x, y)) {
    inRate.value = "";
    inVol.value = "";
    inTime.value = "";
    activeField = nullptr;
    gotoState(UI_HOME);
    return;
  }

  if (inBtn(btnNext, x, y)) {
    if (inRate.value.length() == 0 && inVol.value.length() == 0 && inTime.value.length() == 0) {
      return;
    }

    pendingData.rate_ml_per_min = inRate.value.toFloat();
    pendingData.volume_ml = inVol.value.toFloat();
    pendingData.time_min = inTime.value.toFloat();

    if (pendingData.rate_ml_per_min <= 0 && pendingData.time_min > 0 && pendingData.volume_ml > 0)
      pendingData.rate_ml_per_min = pendingData.volume_ml / pendingData.time_min;
    if (pendingData.time_min <= 0 && pendingData.rate_ml_per_min > 0 && pendingData.volume_ml > 0)
      pendingData.time_min = pendingData.volume_ml / pendingData.rate_ml_per_min;
    if (pendingData.volume_ml <= 0 && pendingData.rate_ml_per_min > 0 && pendingData.time_min > 0)
      pendingData.volume_ml = pendingData.rate_ml_per_min * pendingData.time_min;

    if (pendingData.volume_ml < 0) pendingData.volume_ml = 0;
    if (pendingData.time_min < 0) pendingData.time_min = 0;
    if (pendingData.rate_ml_per_min < 0) pendingData.rate_ml_per_min = 0;

    pendingData.bolusEnabled = false;
    pendingData.bolus_ml = 0;
    gotoState(UI_MANUAL_BOLUS);
    return;
  }
}

void handleManualBolusTouch(uint16_t x, uint16_t y) {
  int cardX = 30, cardY = STATUS_H + 10;
  int overviewY = cardY + 50;
  int toggleY = overviewY + 30;
  Button btnToggleBolus = { cardX + 20, toggleY, 120, 32, "", COL_OK, COL_TEXT, COL_TEXT };

  if (inBtn(btnToggleBolus, x, y)) {
    pendingData.bolusEnabled = !pendingData.bolusEnabled;
    if (!pendingData.bolusEnabled) pendingData.bolus_ml = 0;
    renderManualBolus();
    return;
  }

  if (pendingData.bolusEnabled && x >= bolusSlider.x && x <= bolusSlider.x + bolusSlider.w && y >= bolusSlider.y - 8 && y <= bolusSlider.y + bolusSlider.h + 8) {
    float t = float(x - bolusSlider.x) / float(bolusSlider.w);
    bolusSlider.value = constrain(bolusSlider.minV + t * (bolusSlider.maxV - bolusSlider.minV),
                                  bolusSlider.minV, bolusSlider.maxV);
    pendingData.bolus_ml = bolusSlider.value;
    updateBolusSlider();
    return;
  }

  if (inBtn(btnBack, x, y)) {
    gotoState(UI_MANUAL_INPUT);
    return;
  }
  if (inBtn(btnNext, x, y)) {
    gotoState(UI_CONFIRM);
    return;
  }
}

void handleConfirmTouch(uint16_t x, uint16_t y) {
  if (inBtn(btnReject, x, y)) {
    // Clear infusion tracking when rejected
    Serial.println("❌ User REJECTED infusion - clearing infusion ID: " + currentInfusionId);
    currentInfusionId = "";
    publishDeviceStatus("rejected");
    gotoState(UI_HOME);
    return;
  }
  if (inBtn(btnAccept, x, y)) {
    Serial.println("✅ User ACCEPTED infusion!");
    Serial.println("   Infusion ID: " + currentInfusionId);
    Serial.println("   Starting infusion sequence...");
    
    activeData = pendingData;
    
    pump = PUMP_RUNNING;
    infusionStartMs = millis();
    pausedAccumMs = 0;
    pauseStartMs = 0;
    infusionCompleted = false;
    showCompletionModal = false;
    completionModalDrawn = false;
    
    // Reset recenter tracking for new infusion
    totalStepsDelivered = 0;
    needsRecenter = false;
    
    Serial.println("========== NEW INFUSION STARTING ==========");
    Serial.printf("Volume: %.2f mL | Rate: %.1f mL/min\n", activeData.volume_ml, activeData.rate_ml_per_min);
    Serial.printf("Bolus enabled: %s | Bolus volume: %.2f mL\n", 
                  activeData.bolusEnabled ? "YES" : "NO", activeData.bolus_ml);
    Serial.printf("Reset totalStepsDelivered to: %ld\n", totalStepsDelivered);
    Serial.println("===========================================");
    
    // Step 1: Deliver bolus first if enabled
    if (activeData.bolusEnabled && activeData.bolus_ml > 0) {
      Serial.println("🚀 STEP 1: Delivering preset bolus at start of infusion");
      deliverBolusAtStart(activeData.bolus_ml);
    }
    
    // Step 2: Calculate remaining volume after bolus
    float remainingVolume = activeData.volume_ml - (activeData.bolusEnabled ? activeData.bolus_ml : 0);
    
    // Step 3: Prepare and start normal infusion with remaining volume
    if (remainingVolume > 0) {
      Serial.println("🚀 STEP 2: Starting normal infusion with remaining volume");
      prepareInfusion(remainingVolume, activeData.rate_ml_per_min);
      startMotor();
    } else {
      Serial.println("✅ Infusion completed with bolus only");
      infusionCompleted = true;
      showCompletionModal = true;
      pump = PUMP_IDLE;
    }
    
    // 🚨 CRITICAL: Publish infusion confirmation to MQTT (matches temp.js flow)
    publishInfusionConfirmation();
    
    publishDeviceStatus("started");
    gotoState(UI_RUNNING);
    return;
  }
}

void handleRunningTouch(uint16_t x, uint16_t y) {
  if (pump == PUMP_RUNNING && inBtn(btnPause, x, y)) {
    drawProblemModal("Pause infusion?");
    delay(200);
    int okx = SCREEN_W / 2 - 40, oky = SCREEN_H / 2 + 10, okw = 80, okh = 36;
    uint16_t tx, ty;
    while (true) {
      if (getTouch(tx, ty)) {
        if (tx >= okx && tx <= okx + okw && ty >= oky && ty <= oky + okh) {
          // Pause motor
          infusionActive = false;
          motorEnable(false);
          
          pump = PUMP_PAUSED;
          pauseStartMs = millis();
          
          // 🚨 MQTT: Notify backend of manual pause action
          publishManualPause();
          
          publishDeviceStatus("paused");
          renderRunning();
          break;
        } else {
          renderRunning();
          break;
        }
      }
    }
    return;
  }

  if (pump == PUMP_PAUSED && inBtn(btnResume, x, y)) {
    drawProblemModal("Resume infusion?");
    delay(200);
    int okx = SCREEN_W / 2 - 40, oky = SCREEN_H / 2 + 10, okw = 80, okh = 36;
    uint16_t tx, ty;
    while (true) {
      if (getTouch(tx, ty)) {
        if (tx >= okx && tx <= okx + okw && ty >= oky && ty <= oky + okh) {
          // Resume motor
          if (totalSteps > 0) {
            motorEnable(true);
            infusionActive = true;
            lastStepTime = micros();
          }
          
          pump = PUMP_RUNNING;
          pausedAccumMs += (millis() - pauseStartMs);
          pauseStartMs = 0;
          
          // 🚨 MQTT: Notify backend of manual resume action
          publishManualResume();
          
          publishDeviceStatus("running");
          renderRunning();
          break;
        } else {
          renderRunning();
          break;
        }
      }
    }
    return;
  }

  if (inBtn(btnStop, x, y)) {
    drawProblemModal("Stop infusion?");
    delay(200);
    int okx = SCREEN_W / 2 - 40, oky = SCREEN_H / 2 + 10, okw = 80, okh = 36;
    uint16_t tx, ty;
    while (true) {
      if (getTouch(tx, ty)) {
        if (tx >= okx && tx <= okx + okw && ty >= oky && ty <= oky + okh) {
          // 🚨 MQTT: Notify backend of manual stop action BEFORE clearing infusion ID
          publishManualStop();
          
          // Stop motor
          stopMotor();
          totalSteps = 0;  // Clear remaining steps
          
          // Clear infusion tracking
          Serial.println("🛑 Manual STOP - clearing infusion ID: " + currentInfusionId);
          currentInfusionId = "";
          
          pump = PUMP_IDLE;
          publishDeviceStatus("stopped");
          
          // Recenter pump if needed
          if (needsRecenter) {
            // Show recentering message
            tft.fillRect(0, STATUS_H, SCREEN_W, SCREEN_H - STATUS_H - 40, TFT_WHITE);
            tft.setTextColor(TFT_BLACK, TFT_WHITE);
            tft.setTextSize(2);
            tft.setCursor(60, SCREEN_H / 2 - 10);
            tft.print("Recentering syringe...");
            
            recenterPump();
            
            // Clear message
            tft.fillRect(0, STATUS_H, SCREEN_W, SCREEN_H - STATUS_H - 40, TFT_WHITE);
          }
          
          gotoState(UI_HOME);
          break;
        } else {
          renderRunning();
          break;
        }
      }
    }
    return;
  }
}

// void handleBubbleModalTouch(uint16_t x, uint16_t y) {
//   if (x >= bubbleOK.x && x <= bubbleOK.x + bubbleOK.w && y >= bubbleOK.y && y <= bubbleOK.y + bubbleOK.h) {
//     bubbleAckUntilClear = true;
//     bubbleModalShown = false;
//     if (ui == UI_HOME) renderHome();
//     else if (ui == UI_MANUAL_INPUT) renderManualInput();
//     else if (ui == UI_MANUAL_BOLUS) renderManualBolus();
//     else if (ui == UI_CONFIRM) renderConfirm();
//     else if (ui == UI_RUNNING) renderRunning();
//   }
// }

void handleCompletionModalTouch(uint16_t x, uint16_t y) {
  if (x >= completionOK.x && x <= completionOK.x + completionOK.w && y >= completionOK.y && y <= completionOK.y + completionOK.h) {
    showCompletionModal = false;
    completionModalDrawn = false;
    infusionCompleted = false;
    
    // Clear infusion tracking after completion
    Serial.println("🏁 Infusion completed - clearing infusion ID: " + currentInfusionId);
    currentInfusionId = "";
    
    publishDeviceStatus("idle");
    
    // Recenter pump if needed
    if (needsRecenter) {
      // Show recentering message
      tft.fillRect(0, STATUS_H, SCREEN_W, SCREEN_H - STATUS_H - 40, TFT_WHITE);
      tft.setTextColor(TFT_BLACK, TFT_WHITE);
      tft.setTextSize(2);
      tft.setCursor(60, SCREEN_H / 2 - 10);
      tft.print("Recentering syringe...");
      
      recenterPump();
      
      // Clear message
      tft.fillRect(0, STATUS_H, SCREEN_W, SCREEN_H - STATUS_H - 40, TFT_WHITE);
    }
    
    gotoState(UI_HOME);
  }
}

void handleBubbleModalTouch(uint16_t x, uint16_t y) {
  // Check if bubble is cleared
  bool bubbleStillPresent = digitalRead(BUBBLE_PIN) == HIGH;
  
  // Only process touch if bubble is cleared (button is visible)
  if (!bubbleStillPresent && x >= bubbleOK.x && x <= bubbleOK.x + bubbleOK.w && y >= bubbleOK.y && y <= bubbleOK.y + bubbleOK.h) {
    // Bubble cleared and user pressed RESUME button
    Serial.println("✅ User pressed RESUME - bubble cleared, dismissing modal");
    
    showBubbleModal = false;
    bubbleModalDrawn = false;
    bubbleAckUntilClear = false;
    bubbleErrorSent = false;  // Reset error state completely
    
    // Resume infusion if it was running before bubble detection
    if (wasRunningBeforeBubble && pump == PUMP_PAUSED) {
      Serial.println("▶️ Resuming infusion after bubble clearance...");
      
      // Resume motor
      if (totalSteps > 0) {
        motorEnable(true);
        infusionActive = true;
        lastStepTime = micros();
      }
      
      pump = PUMP_RUNNING;
      pausedAccumMs += (millis() - pauseStartMs);
      pauseStartMs = 0;
      
      // Publish manual resume action (bubble cleared resume)
      publishManualResume();
      
      publishDeviceStatus("running");
      
      Serial.println("✅ Infusion resumed successfully after bubble clearance");
    }
    
    wasRunningBeforeBubble = false;
    
    // Redraw the running screen to restore background after modal dismissal
    if (ui == UI_RUNNING) {
      renderRunning();
      Serial.println("🖥️ Running screen redrawn after bubble modal dismissal");
    }
  } else if (bubbleStillPresent) {
    // Bubble still present - user touched modal but can't proceed
    Serial.println("⚠️ Touch detected but bubble still present - showing visual feedback");
    
    // Brief visual feedback to indicate bubble must be cleared first
    Serial.println("💬 Showing 'Clear bubble first!' message to user");
    
    // Show temporary message at bottom of modal
    tft.setTextDatum(TC_DATUM);
    tft.setTextColor(TFT_RED, COL_ERR);
    tft.setTextSize(1);
    tft.drawString("Clear bubble first!", SCREEN_W / 2, SCREEN_H / 2 + 60);
    delay(1500);
    
    // Redraw modal to clear the message
    bubbleModalDrawn = false;
  }
}

void pollTouch() {
  uint16_t x, y;
  if (!getTouch(x, y)) return;

  Serial.print("pollTouch: x=");
  Serial.print(x);
  Serial.print(", y=");
  Serial.print(y);
  Serial.print(", UI=");
  Serial.println(ui);

  if (ui == UI_SCREENSAVER) {
    Serial.println("Screensaver touched - going to home");
    gotoState(UI_HOME);
    return;
  }

  if (showCompletionModal) {
    Serial.println("Completion modal active");
    handleCompletionModalTouch(x, y);
    return;
  }

  if (showBubbleModal) {
    Serial.println("Bubble modal active");
    handleBubbleModalTouch(x, y);
    return;
  }

  switch (ui) {
    case UI_HOME:
      Serial.println("Processing UI_HOME touch");
      if (inBtn(btnManual, x, y)) {
        Serial.println("Manual button touched");
        gotoState(UI_MANUAL_INPUT);
      } else {
        Serial.println("Home touch outside manual button");
      }
      break;

    case UI_MANUAL_INPUT:
      Serial.println("Processing UI_MANUAL_INPUT touch");
      handleManualInputTouch(x, y);
      break;

    case UI_MANUAL_BOLUS:
      Serial.println("Processing UI_MANUAL_BOLUS touch");
      handleManualBolusTouch(x, y);
      break;

    case UI_CONFIRM:
      Serial.println("Processing UI_CONFIRM touch");
      handleConfirmTouch(x, y);
      break;

    case UI_RUNNING:
      Serial.println("Processing UI_RUNNING touch");
      handleRunningTouch(x, y);
      break;

    default:
      Serial.print("Unknown UI state: ");
      Serial.println(ui);
      break;
  }
}

// -------------------- Setup & Loop ---------------------
bool setupWiFiNonBlocking() {
  static bool wifiStarted = false;

  if (!wifiStarted) {
    WiFi.mode(WIFI_STA);
    Serial.println("=== WiFi Configuration ===");
    Serial.println("SSID: " + String(WIFI_SSID));
    Serial.println("Mode: Station (STA)");
    Serial.println("==========================");
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    Serial.print("Connecting to WiFi");
    wifiStarted = true;
  }

  if (WiFi.status() == WL_CONNECTED && !isWiFiConnected) {
    isWiFiConnected = true;
    Serial.println(" SUCCESS!");
    Serial.println("");
    Serial.println("=== WiFi Connection Successful ===");
    Serial.println("SSID: " + String(WIFI_SSID));
    Serial.println("IP Address: " + WiFi.localIP().toString());
    Serial.println("MAC Address: " + WiFi.macAddress());
    Serial.println("Signal Strength: " + String(WiFi.RSSI()) + " dBm");
    Serial.println("==================================");
    Serial.println("");
    return true;
  } else if (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    return false;
  }

  return isWiFiConnected;
}

bool setupMQTTNonBlocking() {
  static bool mqttConfigured = false;

  if (!mqttConfigured) {
    wifiClient.setInsecure();  // Demo only; use proper CA in production
    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    
    // 🚨 CRITICAL: Set callback BEFORE connecting
    mqttClient.setCallback(onMqttMessage);
    
    // Increase buffer size for larger JSON messages
    mqttClient.setBufferSize(1024);

    Serial.println("=== MQTT Configuration ===");
    Serial.println("Server: " + String(MQTT_SERVER));
    Serial.println("Port: " + String(MQTT_PORT) + " (SSL/TLS)");
    Serial.println("Device ID: " + String(DEVICE_ID));
    Serial.println("Username: " + String(MQTT_USERNAME));
    Serial.println("Connection: Secure (WiFiClientSecure)");
    Serial.println("Buffer Size: 1024 bytes");
    Serial.println("Callback: onMqttMessage SET");
    Serial.println("==========================");
    Serial.println("");
    mqttConfigured = true;
  }

  if (!mqttClient.connected() && !isMQTTConnected) {
    Serial.print("Attempting MQTT connection to HiveMQ Cloud...");
    String clientId = "MediTechPump-" + String(DEVICE_ID);

    Serial.println("");
    Serial.println("Client ID: " + clientId);
    Serial.println("Connecting with SSL/TLS...");

    if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      isMQTTConnected = true;
      Serial.println("SUCCESS!");
      Serial.println("");
      Serial.println("=== MQTT Connection Successful ===");
      Serial.println("Client ID: " + clientId);
      Serial.println("Connected to: " + String(MQTT_SERVER) + ":" + String(MQTT_PORT));
      Serial.println("Device ID: " + String(DEVICE_ID));
      Serial.println("Connection Status: ONLINE");

      String commandTopic = "devices/" + String(DEVICE_ID) + "/commands";
      bool subscribed = mqttClient.subscribe(commandTopic.c_str(), 1); // QoS 1
      Serial.println("📡 Subscription to topic: " + commandTopic);
      Serial.println("   Subscription result: " + String(subscribed ? "SUCCESS" : "FAILED"));
      Serial.println("   QoS Level: 1");
      Serial.println("   Expected message topic: " + commandTopic);
      Serial.println("   Callback function set: onMqttMessage");
      
      // Also subscribe to a test topic to verify subscription works
      String testTopic = "devices/" + String(DEVICE_ID) + "/test";
      bool testSubscribed = mqttClient.subscribe(testTopic.c_str(), 1);
      Serial.println("   Test topic: " + testTopic + " - " + String(testSubscribed ? "SUCCESS" : "FAILED"));

      publishDeviceStatus("online");
      Serial.println("Published initial status: ONLINE");
      Serial.println("=================================");
      Serial.println("");

      return true;
    } else {
      Serial.print("FAILED, rc=");
      Serial.print(mqttClient.state());
      switch (mqttClient.state()) {
        case -4: Serial.print(" - Connection timeout"); break;
        case -3: Serial.print(" - Connection lost"); break;
        case -2: Serial.print(" - Connect failed"); break;
        case -1: Serial.print(" - Disconnected"); break;
        case 1: Serial.print(" - Wrong protocol"); break;
        case 2: Serial.print(" - ID rejected"); break;
        case 3: Serial.print(" - Server unavailable"); break;
        case 4: Serial.print(" - Bad username/password"); break;
        case 5: Serial.print(" - Not authorized"); break;
        default: Serial.print(" - Unknown error"); break;
      }
      Serial.println(" - Will retry...");
      return false;
    }
  }

  return isMQTTConnected;
}

void maintainMQTT() {
  static uint32_t lastMqttStatus = 0;
  
  if (!mqttClient.connected() && isMQTTConnected) {
    Serial.println("❌ MQTT connection lost - attempting reconnection...");
    isMQTTConnected = false;
    setupMQTTNonBlocking();
  }
  
  // Debug MQTT status every 30 seconds
  if (millis() - lastMqttStatus > 30000) {
    lastMqttStatus = millis();
    Serial.println("🔍 MQTT Status Check:");
    Serial.println("   Connected: " + String(mqttClient.connected() ? "YES" : "NO"));
    Serial.println("   State: " + String(mqttClient.state()));
    Serial.println("   Device ID: " + String(DEVICE_ID));
    Serial.println("   Subscribed Topic: devices/" + String(DEVICE_ID) + "/commands");
    Serial.println("   Waiting for commands...");
  }
  
  mqttClient.loop();
}

void setup() {
  Serial.begin(115200);
  Serial.println("");
  Serial.println("========================================");
  Serial.println("    MediTech Infusion Pump v2.0");
  Serial.println("    MQTT-Enabled Medical Device");
  Serial.println("========================================");
  Serial.println("Starting system initialization...");
  Serial.println("");

  Serial.println("Initializing display...");
  tft.init();
  tft.setRotation(1);  // Flipped landscape (was 1)
  tft.fillScreen(COL_BG);
  tft.setTouch(calData);
  Serial.println("Display initialized successfully!");
  Serial.println("");

  Serial.println("Configuring bubble detector...");
  pinMode(BUBBLE_PIN, INPUT_PULLUP);  // NPN open-collector expects pull-up
  Serial.println("Bubble detector configured on GPIO" + String(BUBBLE_PIN));
  Serial.println("  HIGH = Bubble detected (air)");
  Serial.println("  LOW  = Liquid present (normal)");
  Serial.println("");

  Serial.println("Configuring stepper motor control...");
  pinMode(MOTOR_STEP_PIN, OUTPUT);
  pinMode(MOTOR_DIR_PIN, OUTPUT);
  pinMode(MOTOR_EN_PIN, OUTPUT);
  digitalWrite(MOTOR_STEP_PIN, LOW);
  digitalWrite(MOTOR_DIR_PIN, HIGH);  // Set forward direction from start

  motorEnable(false);  // keep disabled at boot
  Serial.println("Motor control pins configured.");
  Serial.println("  STEP: GPIO" + String(MOTOR_STEP_PIN));
  Serial.println("  DIR:  GPIO" + String(MOTOR_DIR_PIN) + " (HIGH=Forward)");
  Serial.println("  EN:   GPIO" + String(MOTOR_EN_PIN) + " (LOW=Enabled)");
  Serial.println("");

  // Show splash screen immediately
  gotoState(UI_SPLASH);
  drawSpinner();
  updateConnectionStatus();

  // Connection process with splash & spinner
  uint32_t lastSpinnerUpdate = 0;
  uint32_t lastConnectionAttempt = 0;
  bool lastWiFiState = false;
  bool lastMQTTState = false;

  while (!connectionComplete) {
    if (millis() - lastSpinnerUpdate >= 100) {
      lastSpinnerUpdate = millis();
      drawSpinner();
    }
    if (isWiFiConnected != lastWiFiState || isMQTTConnected != lastMQTTState) {
      updateConnectionStatus();
      lastWiFiState = isWiFiConnected;
      lastMQTTState = isMQTTConnected;
    }
    if (millis() - lastConnectionAttempt >= 500) {
      lastConnectionAttempt = millis();
      if (!isWiFiConnected) {
        setupWiFiNonBlocking();
      } else if (!isMQTTConnected) {
        setupMQTTNonBlocking();
      } else if (isWiFiConnected && isMQTTConnected) {
        connectionComplete = true;
        updateConnectionStatus();
        delay(1000);
        Serial.println("All connections established! Going to home screen...");
      }
    }
    // pollBubble();
    delay(10);
  }

  // Final MQTT verification
  Serial.println("");
  Serial.println("🔍 Final MQTT Setup Verification:");
  Serial.println("   Device ID: " + String(DEVICE_ID));
  Serial.println("   Command Topic: devices/" + String(DEVICE_ID) + "/commands");
  Serial.println("   MQTT Connected: " + String(mqttClient.connected() ? "YES" : "NO"));
  Serial.println("   Ready to receive commands!");
  
  // 🧪 Send a test message to verify MQTT publishing works
  if (mqttClient.connected()) {
    String testTopic = "devices/" + String(DEVICE_ID) + "/test";
    String testMessage = "{\"test\":\"ESP32 MQTT working\",\"timestamp\":" + String(millis()) + "}";
    bool published = mqttClient.publish(testTopic.c_str(), testMessage.c_str());
    Serial.println("   Test publish result: " + String(published ? "SUCCESS" : "FAILED"));
    Serial.println("   Test topic: " + testTopic);
    Serial.println("   Test message: " + testMessage);
  }
  Serial.println("");

  gotoState(UI_HOME);
  lastInteractionMs = millis();
}

void loop() {
  // 🚨 CRITICAL: Call MQTT loop frequently
  maintainMQTT();

  // Non-blocking motor stepping, tied to computed stepDelay
  if (infusionActive && pump == PUMP_RUNNING && !showCompletionModal) {
    runMotorStep();
  }
  
  // Motor activity monitor - log every 10 seconds when motor is active
  static uint32_t lastMotorStatusLog = 0;
  if (infusionActive && (millis() - lastMotorStatusLog >= 10000)) {
    lastMotorStatusLog = millis();
    float deliveredML = (activeData.volume_ml * STEPS_PER_ML - totalSteps) / STEPS_PER_ML;
    float elapsedMin = (millis() - infusionStartMs - pausedAccumMs) / 60000.0;
    Serial.printf("MOTOR_STATUS: Active | Steps_Remaining=%ld | Delivered=%.2fmL | Elapsed=%.1fmin\n", 
                  totalSteps, deliveredML, elapsedMin);
  }

  if (ui == UI_HOME && (millis() - lastInteractionMs > IDLE_MS)) {
    gotoState(UI_SCREENSAVER);
  }

  if (ui == UI_RUNNING) {
    uint32_t now = millis();
    if (now - lastRunningUpdate >= RUNNING_UPDATE_INTERVAL) {
      lastRunningUpdate = now;
      // Only update progress if no modals are shown (prevents overlap issues)
      if (!showCompletionModal && !showBubbleModal) {
        updateRunningProgress();
        // Publish progress updates to MQTT (similar to temp.js)
        publishProgressUpdate();
      }
      if (infusionCompleted) {
        // no-op
      } else if (pump == PUMP_RUNNING) {
        publishDeviceStatus("running");
      } else if (pump == PUMP_PAUSED) {
        publishDeviceStatus("paused");
      } else if (pump == PUMP_IDLE) {
        publishDeviceStatus("idle");
      }
    }
    if (showCompletionModal && !completionModalDrawn) {
      drawCompletionModal();
      completionModalDrawn = true;
      // Publish infusion completion to MQTT (similar to temp.js)
      publishInfusionCompletion();
      publishDeviceStatus("completed");
    }
  }

  // Draw modals AFTER all UI updates to ensure highest z-index (prevents overlap)
  if (showBubbleModal && !bubbleModalDrawn) {
    drawBubbleModal();
    bubbleModalDrawn = true;
    Serial.println("📱 Bubble modal overlay drawn with highest z-index");
  }

  pollTouch();
  pollBubble();
  
  // 🚨 CRITICAL: Additional MQTT loop call to ensure message processing
  if (mqttClient.connected()) {
    mqttClient.loop();
  }
}
