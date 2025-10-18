// ESP32 MQTT Test - Infusion Device Simulator
// This simulates an ESP32 device responding to infusion commands

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// MQTT settings (HiveMQ Cloud)
const char* mqtt_server = "your-hivemq-cluster.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_username = "your-username";
const char* mqtt_password = "your-password";

// Device configuration
const char* deviceId = "PUMP_0001";

// Topics
char commandTopic[100];
char progressTopic[100];
char errorTopic[100];
char statusTopic[100];
char infusionTopic[100];

WiFiClientSecure espClient;
PubSubClient client(espClient);

// Infusion state
bool infusionRunning = false;
String currentInfusionId = "";
float timeRemainingMin = 0;
float volumeRemainingMl = 0;
float flowRateMlMin = 0;
float plannedTimeMin = 0;
float plannedVolumeMl = 0;
bool bolusEnabled = false;
float bolusVolumeMl = 0;

unsigned long lastProgressUpdate = 0;
unsigned long progressInterval = 2000; // Send progress every 2 seconds

void setup() {
  Serial.begin(115200);
  
  // Initialize topics
  sprintf(commandTopic, "devices/%s/commands", deviceId);
  sprintf(progressTopic, "devices/%s/progress", deviceId);
  sprintf(errorTopic, "devices/%s/error", deviceId);
  sprintf(statusTopic, "devices/%s/status", deviceId);
  sprintf(infusionTopic, "devices/%s/infusion", deviceId);
  
  Serial.println("ESP32 Infusion Device Simulator Starting...");
  Serial.printf("Device ID: %s\n", deviceId);
  
  setup_wifi();
  
  espClient.setInsecure(); // For testing only - use proper certificates in production
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    
    String clientId = "ESP32Client-";
    clientId += String(random(0xffff), HEX);
    
    if (client.connect(clientId.c_str(), mqtt_username, mqtt_password)) {
      Serial.println("connected");
      
      // Subscribe to command topic
      client.subscribe(commandTopic);
      Serial.printf("Subscribed to: %s\n", commandTopic);
      
      // Send initial status
      sendStatus("healthy");
      
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void callback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("Message received on topic: %s\n", topic);
  
  // Convert payload to string
  char message[length + 1];
  for (int i = 0; i < length; i++) {
    message[i] = (char)payload[i];
  }
  message[length] = '\0';
  
  Serial.printf("Payload: %s\n", message);
  
  // Parse JSON message
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    Serial.print("Failed to parse JSON: ");
    Serial.println(error.c_str());
    return;
  }
  
  String command = doc["command"];
  JsonObject payload_obj = doc["payload"];
  
  if (command == "START_INFUSION") {
    handleStartInfusion(payload_obj);
  } else if (command == "STOP_INFUSION") {
    handleStopInfusion(payload_obj);
  } else if (command == "PAUSE_INFUSION") {
    handlePauseInfusion(payload_obj);
  } else if (command == "RESUME_INFUSION") {
    handleResumeInfusion(payload_obj);
  } else {
    Serial.printf("Unknown command: %s\n", command.c_str());
  }
}

void handleStartInfusion(JsonObject payload) {
  Serial.println("📋 Received START_INFUSION command");
  
  // Extract parameters
  flowRateMlMin = payload["flowRateMlMin"];
  plannedTimeMin = payload["plannedTimeMin"];
  plannedVolumeMl = payload["plannedVolumeMl"];
  currentInfusionId = payload["infusionId"].as<String>();
  
  JsonObject bolus = payload["bolus"];
  bolusEnabled = bolus["enabled"];
  bolusVolumeMl = bolus["volumeMl"];
  
  // Initialize infusion state
  timeRemainingMin = plannedTimeMin;
  volumeRemainingMl = plannedVolumeMl;
  infusionRunning = true;
  
  Serial.printf("💉 Starting infusion:\n");
  Serial.printf("  - Flow Rate: %.1f ml/min\n", flowRateMlMin);
  Serial.printf("  - Planned Time: %.1f min\n", plannedTimeMin);
  Serial.printf("  - Planned Volume: %.1f ml\n", plannedVolumeMl);
  Serial.printf("  - Infusion ID: %s\n", currentInfusionId.c_str());
  Serial.printf("  - Bolus: %s (%.1f ml)\n", bolusEnabled ? "enabled" : "disabled", bolusVolumeMl);
  
  // Send infusion confirmation
  sendInfusionConfirmation();
  
  // Update status
  sendStatus("running");
  
  // If bolus is enabled, simulate bolus delivery
  if (bolusEnabled && bolusVolumeMl > 0) {
    Serial.printf("💊 Delivering bolus: %.1f ml\n", bolusVolumeMl);
    volumeRemainingMl -= bolusVolumeMl;
  }
}

void handleStopInfusion(JsonObject payload) {
  Serial.println("🛑 Received STOP_INFUSION command");
  
  infusionRunning = false;
  timeRemainingMin = 0;
  volumeRemainingMl = 0;
  
  sendStatus("stopped");
  sendProgress(); // Send final progress
  
  Serial.println("✅ Infusion stopped");
}

void handlePauseInfusion(JsonObject payload) {
  Serial.println("⏸️ Received PAUSE_INFUSION command");
  
  infusionRunning = false; // Stop progress updates
  sendStatus("paused");
  
  Serial.println("✅ Infusion paused");
}

void handleResumeInfusion(JsonObject payload) {
  Serial.println("▶️ Received RESUME_INFUSION command");
  
  infusionRunning = true; // Resume progress updates
  sendStatus("running");
  
  Serial.println("✅ Infusion resumed");
}

void sendInfusionConfirmation() {
  DynamicJsonDocument doc(512);
  
  doc["deviceId"] = deviceId;
  doc["infusionId"] = currentInfusionId;
  doc["status"] = "confirmed";
  doc["message"] = "Infusion started successfully";
  doc["timestamp"] = millis();
  doc["parameters"]["flowRateMlMin"] = flowRateMlMin;
  doc["parameters"]["plannedTimeMin"] = plannedTimeMin;
  doc["parameters"]["plannedVolumeMl"] = plannedVolumeMl;
  doc["parameters"]["bolusEnabled"] = bolusEnabled;
  doc["parameters"]["bolusVolumeMl"] = bolusVolumeMl;
  
  String message;
  serializeJson(doc, message);
  
  if (client.publish(infusionTopic, message.c_str())) {
    Serial.printf("✅ Infusion confirmation sent: %s\n", message.c_str());
  } else {
    Serial.println("❌ Failed to send infusion confirmation");
  }
}

void sendStatus(const char* status) {
  DynamicJsonDocument doc(256);
  
  doc["deviceId"] = deviceId;
  doc["status"] = status;
  doc["timestamp"] = millis();
  doc["uptime"] = millis() / 1000;
  
  String message;
  serializeJson(doc, message);
  
  if (client.publish(statusTopic, message.c_str())) {
    Serial.printf("📊 Status sent: %s\n", status);
  } else {
    Serial.printf("❌ Failed to send status: %s\n", status);
  }
}

void sendProgress() {
  if (!infusionRunning || currentInfusionId.isEmpty()) {
    return;
  }
  
  DynamicJsonDocument doc(256);
  
  doc["deviceId"] = deviceId;
  doc["infusionId"] = currentInfusionId;
  doc["timeRemainingMin"] = timeRemainingMin;
  doc["volumeRemainingMl"] = volumeRemainingMl;
  doc["timestamp"] = millis();
  
  // Calculate percentages
  float timeProgress = ((plannedTimeMin - timeRemainingMin) / plannedTimeMin) * 100;
  float volumeProgress = ((plannedVolumeMl - volumeRemainingMl) / plannedVolumeMl) * 100;
  
  doc["progressPercent"]["time"] = timeProgress;
  doc["progressPercent"]["volume"] = volumeProgress;
  
  String message;
  serializeJson(doc, message);
  
  if (client.publish(progressTopic, message.c_str())) {
    Serial.printf("📈 Progress: %.1f min remaining, %.1f ml remaining (%.1f%% complete)\n", 
                  timeRemainingMin, volumeRemainingMl, timeProgress);
  } else {
    Serial.println("❌ Failed to send progress");
  }
}

void sendError(const char* errorCode, const char* errorMessage) {
  DynamicJsonDocument doc(512);
  
  doc["deviceId"] = deviceId;
  doc["infusionId"] = currentInfusionId;
  doc["errorCode"] = errorCode;
  doc["message"] = errorMessage;
  doc["severity"] = "high";
  doc["timestamp"] = millis();
  
  String message;
  serializeJson(doc, message);
  
  if (client.publish(errorTopic, message.c_str())) {
    Serial.printf("🚨 Error sent: %s - %s\n", errorCode, errorMessage);
  } else {
    Serial.println("❌ Failed to send error");
  }
}

void updateInfusionProgress() {
  if (!infusionRunning || timeRemainingMin <= 0) {
    return;
  }
  
  // Calculate time elapsed since last update
  float deltaTimeMin = progressInterval / 60000.0; // Convert ms to minutes
  
  // Update remaining time and volume
  timeRemainingMin -= deltaTimeMin;
  volumeRemainingMl -= (flowRateMlMin * deltaTimeMin);
  
  // Ensure we don't go negative
  if (timeRemainingMin < 0) timeRemainingMin = 0;
  if (volumeRemainingMl < 0) volumeRemainingMl = 0;
  
  // Check if infusion is complete
  if (timeRemainingMin <= 0 || volumeRemainingMl <= 0) {
    Serial.println("✅ Infusion completed!");
    infusionRunning = false;
    timeRemainingMin = 0;
    volumeRemainingMl = 0;
    sendStatus("completed");
  }
  
  sendProgress();
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();
  
  // Send progress updates at regular intervals
  unsigned long now = millis();
  if (infusionRunning && (now - lastProgressUpdate > progressInterval)) {
    updateInfusionProgress();
    lastProgressUpdate = now;
  }
  
  // Simulate random health checks
  static unsigned long lastHealthCheck = 0;
  if (now - lastHealthCheck > 10000) { // Every 10 seconds
    sendStatus(infusionRunning ? "running" : "healthy");
    lastHealthCheck = now;
  }
  
  delay(100);
}