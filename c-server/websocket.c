#include "websocket.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <libwebsockets.h>

static WSClient* ws_clients[WS_MAX_CLIENTS] = {0};
static struct lws_context* ws_context = NULL;

static int ws_callback(struct lws* wsi, enum lws_callback_reasons reason, void* user, void* in, size_t len) {
    (void)user;
    (void)len;
    
    switch (reason) {
        case LWS_CALLBACK_ESTABLISHED: {
            printf("WebSocket client connected\n");
            for (int i = 0; i < WS_MAX_CLIENTS; i++) {
                if (!ws_clients[i]) {
                    ws_clients[i] = (WSClient*)malloc(sizeof(WSClient));
                    ws_clients[i]->wsi = wsi;
                    ws_clients[i]->subscribed = 1;
                    strcpy(ws_clients[i]->role, "observer");
                    break;
                }
            }
            break;
        }
        
        case LWS_CALLBACK_CLOSED: {
            printf("WebSocket client disconnected\n");
            for (int i = 0; i < WS_MAX_CLIENTS; i++) {
                if (ws_clients[i] && ws_clients[i]->wsi == wsi) {
                    free(ws_clients[i]);
                    ws_clients[i] = NULL;
                    break;
                }
            }
            break;
        }
        
        case LWS_CALLBACK_RECEIVE: {
            printf("WebSocket received: %s\n", (char*)in);
            break;
        }
        
        default:
            break;
    }
    
    return 0;
}

static struct lws_protocols ws_protocols[] = {
    {"fano-protocol", ws_callback, sizeof(WSClient), 4096},
    {NULL, NULL, 0, 0}
};

int ws_init(WSContext* ws, int port) {
    struct lws_context_creation_info info;
    memset(&info, 0, sizeof(info));
    
    info.port = port;
    info.protocols = ws_protocols;
    info.options = LWS_SERVER_OPTION_VALIDATE_UTF8;
    
    ws_context = lws_create_context(&info);
    if (!ws_context) {
        fprintf(stderr, "Failed to create WebSocket context\n");
        return -1;
    }
    
    memset(ws_clients, 0, sizeof(ws_clients));
    ws->context = ws_context;
    ws->client_count = 0;
    pthread_mutex_init(&ws->mutex, NULL);
    
    printf("WebSocket server initialized on port %d\n", port);
    return 0;
}

void ws_shutdown(WSContext* ws) {
    (void)ws;
    if (ws_context) {
        lws_context_destroy(ws_context);
        ws_context = NULL;
    }
    pthread_mutex_destroy(&ws->mutex);
}

void ws_broadcast_canon(WSContext* ws, uint32_t chunk_index, uint8_t matrix[7], float angle) {
    char msg[512];
    int len = snprintf(msg, sizeof(msg),
        "{\"type\":\"canon\",\"chunk\":%u,\"matrix\":[%d,%d,%d,%d,%d,%d,%d],\"angle\":%.2f}",
        chunk_index,
        matrix[0], matrix[1], matrix[2], matrix[3],
        matrix[4], matrix[5], matrix[6], angle);
    
    pthread_mutex_lock(&ws->mutex);
    for (int i = 0; i < WS_MAX_CLIENTS; i++) {
        if (ws_clients[i] && ws_clients[i]->subscribed) {
            lws_write(ws_clients[i]->wsi, (unsigned char*)msg, len, LWS_WRITE_TEXT);
        }
    }
    pthread_mutex_unlock(&ws->mutex);
}

void ws_broadcast_status(WSContext* ws, uint32_t chunks, uint32_t current, uint8_t playing, float speed) {
    char msg[256];
    int len = snprintf(msg, sizeof(msg),
        "{\"type\":\"status\",\"chunks\":%u,\"current\":%u,\"playing\":%d,\"speed\":%.1f}",
        chunks, current, playing, speed);
    
    pthread_mutex_lock(&ws->mutex);
    for (int i = 0; i < WS_MAX_CLIENTS; i++) {
        if (ws_clients[i] && ws_clients[i]->subscribed) {
            lws_write(ws_clients[i]->wsi, (unsigned char*)msg, len, LWS_WRITE_TEXT);
        }
    }
    pthread_mutex_unlock(&ws->mutex);
}

void* ws_service_thread(void* arg) {
    WSContext* ws = (WSContext*)arg;
    while (ws->context) {
        lws_service(ws->context, 50);
    }
    return NULL;
}
