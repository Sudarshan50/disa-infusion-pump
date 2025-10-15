/**
 * ESP32 MQTT Client Example (Arduino C++)
 * 
 * This is a conceptual example of how the ESP32 device would
 * connect to HiveMQ and handle commands from the backend
 */

/*
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "your-wifi-ssid";
const char* password = "your-wifi-password";

// HiveMQ credentials
const char* mqtt_server = "your-hivemq-cluster.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_user = "your-hivemq-username";
const char* mqtt_password = "your-hivemq-password";

// Device configuration
const char* deviceId = "PUMP_0001";
char commandTopic[50];
char statusTopic[50];
char telemetryTopic[50];
char errorTopic[50];
char responseTopic[50];

WiFiClientSecure espClient;
PubSubClient client(espClient);

// Infusion pump state
struct InfusionState {
    bool isRunning = false;
    bool isPaused = false;
    float flowRate = 0.0;
    int duration = 0;
    float volume = 0.0;
    float currentVolume = 0.0;
    unsigned long startTime = 0;
    String medication = "";
    String priority = "normal";
} pumpState;

void setup() {
    Serial.begin(115200);
    
    // Initialize topic names
    sprintf(commandTopic, "devices/%s/commands", deviceId);
    sprintf(statusTopic, "devices/%s/status", deviceId);
    sprintf(telemetryTopic, "devices/%s/telemetry", deviceId);
    sprintf(errorTopic, "devices/%s/error", deviceId);
    sprintf(responseTopic, "devices/%s/response", deviceId);
    
    // Connect to WiFi
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("WiFi connected");
    
    // Configure MQTT client
    espClient.setInsecure(); // For HiveMQ Cloud
    client.setServer(mqtt_server, mqtt_port);
    client.setCallback(onMqttMessage);
    
    connectToMQTT();
}

void connectToMQTT() {
    while (!client.connected()) {
        Serial.print("Attempting MQTT connection...");
        String clientId = "ESP32Client-" + String(random(0xffff), HEX);
        
        if (client.connect(clientId.c_str(), mqtt_user, mqtt_password)) {
            Serial.println("Connected to HiveMQ");
            
            // Subscribe to command topic
            client.subscribe(commandTopic);
            Serial.printf("Subscribed to: %s\n", commandTopic);
            
            // Send initial status
            sendStatus("healthy");
            
        } else {
            Serial.printf("Failed, rc=%d. Retrying in 5 seconds...\n", client.state());
            delay(5000);
        }
    }
}

void onMqttMessage(char* topic, byte* message, unsigned int length) {
    String messageString = "";
    for (int i = 0; i < length; i++) {
        messageString += (char)message[i];
    }
    
    Serial.printf("Message received on topic: %s\n", topic);
    Serial.printf("Message: %s\n", messageString.c_str());
    
    // Parse JSON command
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, messageString);
    
    String command = doc["command"];
    JsonObject payload = doc["payload"];
    String commandId = doc["commandId"];
    
    // Handle different commands
    if (command == "START_INFUSION") {
        handleStartCommand(payload, commandId);
    } else if (command == "STOP_INFUSION") {
        handleStopCommand(payload, commandId);
    } else if (command == "PAUSE_INFUSION") {
        handlePauseCommand(payload, commandId);
    } else if (command == "RESUME_INFUSION") {
        handleResumeCommand(commandId);
    }
}

void handleStartCommand(JsonObject payload, String commandId) {
    pumpState.flowRate = payload["flowRate"];
    pumpState.duration = payload["duration"];
    pumpState.volume = payload["volume"];
    pumpState.medication = payload["medication"].as<String>();
    pumpState.priority = payload["priority"].as<String>();
    
    pumpState.isRunning = true;
    pumpState.isPaused = false;
    pumpState.currentVolume = 0.0;
    pumpState.startTime = millis();
    
    // Start physical pump hardware here
    startPumpHardware();
    
    sendCommandResponse(commandId, "START_INFUSION", "success", "Infusion started");
    sendStatus("running");
    
    Serial.println("Infusion started");
}

void handleStopCommand(JsonObject payload, String commandId) {
    pumpState.isRunning = false;
    pumpState.isPaused = false;
    
    // Stop physical pump hardware here
    stopPumpHardware();
    
    String reason = payload["reason"].as<String>();
    bool emergency = payload["emergency"];
    
    sendCommandResponse(commandId, "STOP_INFUSION", "success", "Infusion stopped");
    sendStatus("stopped");
    
    Serial.println("Infusion stopped - Reason: " + reason);
}

void handlePauseCommand(JsonObject payload, String commandId) {
    if (pumpState.isRunning) {
        pumpState.isPaused = true;
        
        // Pause physical pump hardware here
        pausePumpHardware();
        
        sendCommandResponse(commandId, "PAUSE_INFUSION", "success", "Infusion paused");
        sendStatus("paused");
        
        Serial.println("Infusion paused");
    }
}

void handleResumeCommand(String commandId) {
    if (pumpState.isRunning && pumpState.isPaused) {
        pumpState.isPaused = false;
        
        // Resume physical pump hardware here
        resumePumpHardware();
        
        sendCommandResponse(commandId, "RESUME_INFUSION", "success", "Infusion resumed");
        sendStatus("running");
        
        Serial.println("Infusion resumed");
    }
}

void sendStatus(String status) {
    DynamicJsonDocument doc(512);
    doc["status"] = status;
    doc["deviceId"] = deviceId;
    doc["timestamp"] = millis();
    doc["isRunning"] = pumpState.isRunning;
    doc["isPaused"] = pumpState.isPaused;
    
    String jsonString;
    serializeJson(doc, jsonString);
    client.publish(statusTopic, jsonString.c_str());
}

void sendTelemetry() {
    if (pumpState.isRunning && !pumpState.isPaused) {
        // Calculate current progress
        unsigned long elapsed = millis() - pumpState.startTime;
        float elapsedMinutes = elapsed / 60000.0;
        pumpState.currentVolume = pumpState.flowRate * elapsedMinutes;
        
        if (pumpState.currentVolume >= pumpState.volume) {
            // Infusion complete
            handleStopCommand(JsonObject(), "auto_complete");
            return;
        }
    }
    
    DynamicJsonDocument doc(1024);
    doc["deviceId"] = deviceId;
    doc["timestamp"] = millis();
    doc["flowRate"] = pumpState.flowRate;
    doc["currentVolume"] = pumpState.currentVolume;
    doc["targetVolume"] = pumpState.volume;
    doc["progress"] = (pumpState.currentVolume / pumpState.volume) * 100;
    doc["isRunning"] = pumpState.isRunning;
    doc["isPaused"] = pumpState.isPaused;
    doc["medication"] = pumpState.medication;
    doc["priority"] = pumpState.priority;
    
    // Add hardware sensor readings
    doc["pressure"] = readPressureSensor();
    doc["temperature"] = readTemperatureSensor();
    doc["batteryLevel"] = readBatteryLevel();
    
    String jsonString;
    serializeJson(doc, jsonString);
    client.publish(telemetryTopic, jsonString.c_str());
}

void sendCommandResponse(String commandId, String command, String status, String message) {
    DynamicJsonDocument doc(512);
    doc["commandId"] = commandId;
    doc["command"] = command;
    doc["status"] = status;
    doc["message"] = message;
    doc["timestamp"] = millis();
    doc["deviceId"] = deviceId;
    
    String jsonString;
    serializeJson(doc, jsonString);
    client.publish(responseTopic, jsonString.c_str());
}

void sendError(String errorCode, String errorMessage) {
    DynamicJsonDocument doc(512);
    doc["deviceId"] = deviceId;
    doc["errorCode"] = errorCode;
    doc["errorMessage"] = errorMessage;
    doc["timestamp"] = millis();
    doc["severity"] = "high";
    
    String jsonString;
    serializeJson(doc, jsonString);
    client.publish(errorTopic, jsonString.c_str());
}

// Hardware control functions (implement based on your pump design)
void startPumpHardware() {
    // Control pump motor, valves, etc.
}

void stopPumpHardware() {
    // Stop pump motor, close valves, etc.
}

void pausePumpHardware() {
    // Temporarily stop pump motor
}

void resumePumpHardware() {
    // Restart pump motor
}

float readPressureSensor() {
    // Read from pressure sensor
    return 0.0;
}

float readTemperatureSensor() {
    // Read from temperature sensor
    return 25.0;
}

float readBatteryLevel() {
    // Read battery level
    return 85.0;
}

void loop() {
    if (!client.connected()) {
        connectToMQTT();
    }
    client.loop();
    
    // Send telemetry every 5 seconds
    static unsigned long lastTelemetry = 0;
    if (millis() - lastTelemetry > 5000) {
        sendTelemetry();
        lastTelemetry = millis();
    }
    
    // Send status heartbeat every 30 seconds
    static unsigned long lastHeartbeat = 0;
    if (millis() - lastHeartbeat > 30000) {
        String currentStatus = pumpState.isRunning ? 
            (pumpState.isPaused ? "paused" : "running") : "stopped";
        sendStatus(currentStatus);
        lastHeartbeat = millis();
    }
    
    delay(100);
}
*/