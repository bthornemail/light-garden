// Fano Garden ESP32 Firmware
// Works with ESP32, ESP32-C3, ESP32-S3
// Requires: FastLED, LoRa (SX1276), WiFi

#include <Arduino.h>
#include <WiFi.h>
#include <FastLED.h>
#include <LoRa.h>

// Configuration
#define LED_PIN 2
#define NUM_LEDS 7
#define LORA_SCK 5
#define LORA_MISO 19
#define LORA_MOSI 27
#define LORA_CS 18
#define LORA_RST 23
#define LORA_DIO0 26

#define DEVICE_ID 1

CRGB leds[NUM_LEDS];

// Fano colors
const CRGB FANO_COLORS[8] = {
    CRGB(255, 0, 0),     // Red - Metatron
    CRGB(255, 136, 0),   // Orange - Solomon
    CRGB(255, 255, 0),   // Yellow - Solon
    CRGB(0, 255, 0),     // Green - Asabiyyah
    CRGB(0, 0, 255),     // Blue - Enoch
    CRGB(75, 0, 130),    // Indigo - Speaker
    CRGB(128, 0, 128),   // Violet - Genesis
    CRGB(255, 255, 255)  // White - Observer
};

#include "../lib/minimal_probe.h"

FanoState current_state;
bool led_pattern[7] = {false};

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("Fano Garden ESP32 Node");
    
    // Initialize LEDs
    FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS);
    FastLED.setBrightness(128);
    clear_leds();
    
    // Initialize LoRa
    LoRa.setPins(LORA_CS, LORA_RST, LORA_DIO0);
    if (!LoRa.begin(868E6)) {
        Serial.println("LoRa init failed!");
        while (1);
    }
    LoRa.setSpreadingFactor(7);
    LoRa.setSignalBandwidth(125E3);
    Serial.println("LoRa initialized");
    
    // Connect to WiFi for WebSocket
    WiFi.begin("YourSSID", "YourPassword");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi connected");
    Serial.println(WiFi.localIP());
    
    // Initial state
    current_state = fano_create_empty();
    Serial.println("Fano Node ready");
}

void loop() {
    // Read sensors and update state
    uint16_t analog_vals[4];
    for (int i = 0; i < 4; i++) {
        analog_vals[i] = analogRead(i);
    }
    
    current_state = fano_from_sensors(analog_vals, 4, NULL, 0);
    
    // Render to LEDs
    render_fano_state(&current_state);
    
    // Send via LoRa
    send_lora_packet(&current_state);
    
    // Receive LoRa packets
    receive_lora_packet();
    
    FastLED.show();
    delay(100);
}

void clear_leds() {
    for (int i = 0; i < NUM_LEDS; i++) {
        leds[i] = CRGB::Black;
    }
    FastLED.show();
}

void render_fano_state(FanoState* state) {
    // Render 7-point Fano matrix
    for (int i = 0; i < 7; i++) {
        uint8_t quadrant = state->matrix[i];
        
        // Color based on quadrant
        CRGB color;
        switch (quadrant) {
            case Q_KK: color = CRGB(255, 0, 0); break;     // Red
            case Q_KU: color = CRGB(0, 255, 0); break;      // Green
            case Q_UK: color = CRGB(0, 0, 255); break;      // Blue
            case Q_UU: color = CRGB(128, 0, 128); break;    // Purple
            default: color = CRGB::White;
        }
        
        leds[i] = color;
    }
    
    // Light up current Fano point
    if (state->fano_point >= 1 && state->fano_point <= 7) {
        leds[state->fano_point - 1] = FANO_COLORS[state->fano_point - 1];
        leds[state->fano_point - 1] %= 200;
    }
    
    // Angle indicator on 8th LED
    uint8_t angle_led = (uint8_t)(state->angle / 51.4) % 7;
    if (state->fano_point >= 1 && state->fano_point <= 7) {
        uint8_t pos = (angle_led + state->fano_point - 1) % 7;
        leds[pos] += CRGB(50, 50, 50);
    }
}

void send_lora_packet(FanoState* state) {
    FanoPacket pkt;
    fano_to_packet(state, DEVICE_ID, 0xFFFF, &pkt);
    
    LoRa.beginPacket();
    LoRa.write((uint8_t*)&pkt, sizeof(FanoPacket));
    LoRa.endPacket();
}

void receive_lora_packet() {
    int pktSize = LoRa.parsePacket();
    if (pktSize == sizeof(FanoPacket)) {
        FanoPacket pkt;
        int i = 0;
        while (LoRa.available() && i < sizeof(FanoPacket)) {
            ((uint8_t*)&pkt)[i++] = LoRa.read();
        }
        
        if (fano_validate_packet(&pkt)) {
            FanoState state;
            fano_from_packet(&pkt, &state);
            
            Serial.print("Received from ");
            Serial.print(pkt.source_id);
            Serial.print(": Point ");
            Serial.print(state.fano_point);
            Serial.print(" (");
            Serial.print(fano_point_name(state.fano_point));
            Serial.println(")");
            
            // Display received state
            render_fano_state(&state);
        }
    }
}

void SerialPrintFanoState(FanoState* s) {
    Serial.print("Fano Point: ");
    Serial.print(s->fano_point);
    Serial.print(" (");
    Serial.print(fano_point_name(s->fano_point));
    Serial.println(")");
    
    Serial.print("Matrix: [");
    for (int i = 0; i < 7; i++) {
        Serial.print(fano_quadrant_name(s->matrix[i]));
        if (i < 6) Serial.print(", ");
    }
    Serial.println("]");
    
    Serial.print("Angle: ");
    Serial.print(s->angle, 1);
    Serial.println("°");
    
    Serial.print("Seed: ");
    Serial.println(s->seed);
}
