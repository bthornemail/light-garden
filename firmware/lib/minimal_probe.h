#ifndef MINIMAL_PROBE_H
#define MINIMAL_PROBE_H

#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <stdio.h>

#ifdef ARDUINO
#include <Arduino.h>
#endif

#define FANO_VERSION 0x01
#define FANO_MAGIC "FANO"

typedef enum {
    FANO_OK = 0,
    FANO_ERR_NULL = -1,
    FANO_ERR_NO_MEM = -2,
    FANO_ERR_NOT_FOUND = -3,
    FANO_ERR_INVALID = -4,
    FANO_ERR_TIMEOUT = -5
} FanoError;

typedef enum {
    Q_KK = 0,
    Q_KU = 1,
    Q_UK = 2,
    Q_UU = 3
} Quadrant;

typedef struct {
    uint8_t matrix[7];
    float angle;
    uint32_t seed;
    uint8_t fano_point;
} FanoState;

typedef struct {
    uint8_t magic[4];
    uint8_t version;
    uint16_t source_id;
    uint16_t dest_id;
    uint8_t fano_point;
    uint8_t matrix[7];
    uint16_t angle;
    uint32_t seed;
    uint16_t checksum;
    uint8_t reserved[2];
} __attribute__((packed)) FanoPacket;

#ifdef __cplusplus
extern "C" {
#endif

FanoState fano_create_empty(void);
FanoState fano_from_sensors(uint16_t analog[8], uint8_t analog_count, 
                            uint8_t digital[8], uint8_t digital_count);
FanoState fano_from_seed(uint32_t seed);
FanoState fano_from_matrix_angle(uint8_t matrix[7], float angle);
uint32_t fano_to_seed(FanoState* state);
void fano_to_packet(FanoState* state, uint16_t source, uint16_t dest, FanoPacket* pkt);
int fano_from_packet(FanoPacket* pkt, FanoState* state);
uint16_t fano_checksum(FanoPacket* pkt);
bool fano_validate_packet(FanoPacket* pkt);

const char* fano_point_name(uint8_t point);
const char* fano_quadrant_name(uint8_t q);
uint32_t fano_hash(const char* str);

#ifdef __cplusplus
}
#endif

#ifdef ARDUINO
typedef struct {
    uint8_t pin;
    uint16_t value;
    float voltage;
    uint32_t timestamp;
} AnalogReading;

AnalogReading probe_analog(uint8_t pin, float vref) {
    AnalogReading r;
    r.pin = pin;
    r.value = analogRead(pin);
    r.voltage = (r.value * vref) / 1024.0;
    r.timestamp = millis();
    return r;
}

typedef struct {
    uint8_t pin;
    uint8_t value;
    uint32_t timestamp;
} DigitalReading;

DigitalReading probe_digital(uint8_t pin) {
    DigitalReading r;
    r.pin = pin;
    r.value = digitalRead(pin);
    r.timestamp = millis();
    return r;
}
#endif

FanoState fano_create_empty(void) {
    FanoState s = {0};
    for (int i = 0; i < 7; i++) s.matrix[i] = Q_KK;
    s.angle = 0.0f;
    s.seed = 0;
    s.fano_point = 1;
    return s;
}

FanoState fano_from_sensors(uint16_t analog[8], uint8_t analog_count,
                            uint8_t digital[8], uint8_t digital_count) {
    FanoState s = {0};
    
    for (int i = 0; i < 7; i++) {
        uint32_t val = 0;
        if (i < analog_count) {
            val = analog[i];
        } else if (i < analog_count + digital_count) {
            val = digital[i - analog_count] * 1023;
        } else {
            val = millis() % 1024;
        }
        s.matrix[i] = (val >> 8) & 0x03;
    }
    
    s.angle = (millis() % 36000) / 100.0f;
    s.seed = fano_to_seed(&s);
    
    uint8_t counts[4] = {0,0,0,0};
    for (int i = 0; i < 7; i++) counts[s.matrix[i]]++;
    
    uint8_t max_q = 0;
    for (int i = 1; i < 4; i++) {
        if (counts[i] > counts[max_q]) max_q = i;
    }
    s.fano_point = max_q + 1;
    
    return s;
}

FanoState fano_from_seed(uint32_t seed) {
    FanoState s = {0};
    s.seed = seed;
    
    for (int i = 0; i < 7; i++) {
        s.matrix[i] = (seed >> (i * 2)) & 0x03;
    }
    
    uint16_t angle_raw = (seed >> 14) & 0x3FF;
    s.angle = (angle_raw * 360.0f) / 1024.0f;
    
    uint8_t counts[4] = {0,0,0,0};
    for (int i = 0; i < 7; i++) counts[s.matrix[i]]++;
    
    uint8_t max_q = 0;
    for (int i = 1; i < 4; i++) {
        if (counts[i] > counts[max_q]) max_q = i;
    }
    s.fano_point = max_q + 1;
    
    return s;
}

FanoState fano_from_matrix_angle(uint8_t matrix[7], float angle) {
    FanoState s = {0};
    memcpy(s.matrix, matrix, 7);
    s.angle = angle;
    s.seed = fano_to_seed(&s);
    
    uint8_t counts[4] = {0,0,0,0};
    for (int i = 0; i < 7; i++) counts[s.matrix[i]]++;
    
    uint8_t max_q = 0;
    for (int i = 1; i < 4; i++) {
        if (counts[i] > counts[max_q]) max_q = i;
    }
    s.fano_point = max_q + 1;
    
    return s;
}

uint32_t fano_to_seed(FanoState* state) {
    uint32_t bits = 0;
    for (int i = 0; i < 7; i++) {
        bits |= (state->matrix[i] << (i * 2));
    }
    uint16_t angle_raw = (uint16_t)((state->angle / 360.0f) * 1024.0f);
    return (bits << 10) | (angle_raw & 0x3FF);
}

void fano_to_packet(FanoState* state, uint16_t source, uint16_t dest, FanoPacket* pkt) {
    memcpy(pkt->magic, "FANO", 4);
    pkt->version = FANO_VERSION;
    pkt->source_id = source;
    pkt->dest_id = dest;
    pkt->fano_point = state->fano_point;
    memcpy(pkt->matrix, state->matrix, 7);
    pkt->angle = (uint16_t)(state->angle * 10);
    pkt->seed = state->seed;
    pkt->checksum = 0;
    pkt->checksum = fano_checksum(pkt);
}

int fano_from_packet(FanoPacket* pkt, FanoState* state) {
    if (!fano_validate_packet(pkt)) return FANO_ERR_INVALID;
    
    state->fano_point = pkt->fano_point;
    memcpy(state->matrix, pkt->matrix, 7);
    state->angle = pkt->angle / 10.0f;
    state->seed = pkt->seed;
    
    return FANO_OK;
}

uint16_t fano_checksum(FanoPacket* pkt) {
    uint16_t sum = 0;
    uint8_t* bytes = (uint8_t*)pkt;
    for (int i = 0; i < 22; i++) {
        sum += bytes[i];
    }
    return sum;
}

bool fano_validate_packet(FanoPacket* pkt) {
    if (memcmp(pkt->magic, "FANO", 4) != 0) return false;
    if (pkt->version != FANO_VERSION) return false;
    if (pkt->fano_point < 1 || pkt->fano_point > 8) return false;
    
    uint16_t expected = pkt->checksum;
    pkt->checksum = 0;
    uint16_t actual = fano_checksum(pkt);
    pkt->checksum = expected;
    
    return expected == actual;
}

const char* fano_point_name(uint8_t point) {
    static const char* names[8] = {
        "Metatron", "Solomon", "Solon", "Asabiyyah",
        "Enoch", "Speaker", "Genesis", "Observer"
    };
    if (point < 1 || point > 8) return "?";
    return names[point - 1];
}

const char* fano_quadrant_name(uint8_t q) {
    static const char* names[4] = {"KK", "KU", "UK", "UU"};
    if (q > 3) return "?";
    return names[q];
}

uint32_t fano_hash(const char* str) {
    uint32_t h = 2166136261U;
    while (*str) {
        h ^= (uint32_t)*str++;
        h *= 16777619U;
    }
    return h;
}

#endif
