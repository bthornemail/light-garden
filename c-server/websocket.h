#ifndef WEBSOCKET_H
#define WEBSOCKET_H

#include <libwebsockets.h>
#include <pthread.h>
#include <stdint.h>

#define WS_MAX_CLIENTS 100

typedef struct {
    struct lws* wsi;
    uint8_t subscribed;
    char role[16];
} WSClient;

typedef struct {
    struct lws_context* context;
    WSClient* clients[WS_MAX_CLIENTS];
    int client_count;
    pthread_mutex_t mutex;
} WSContext;

int ws_init(WSContext* ws, int port);
void ws_shutdown(WSContext* ws);
void ws_broadcast_canon(WSContext* ws, uint32_t chunk_index, uint8_t matrix[7], float angle);
void ws_broadcast_status(WSContext* ws, uint32_t chunks, uint32_t current, uint8_t playing, float speed);
void* ws_service_thread(void* arg);

#endif
