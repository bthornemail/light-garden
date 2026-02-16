#include "sse.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define MAX_CLIENTS 1000

static int sse_clients[MAX_CLIENTS] = {0};

int sse_init(SSEContext* sse) {
    memset(sse_clients, 0, sizeof(sse_clients));
    sse->client_count = 0;
    pthread_mutex_init(&sse->mutex, NULL);
    return 0;
}

void sse_shutdown(SSEContext* sse) {
    pthread_mutex_lock(&sse->mutex);
    for (int i = 0; i < MAX_CLIENTS; i++) {
        if (sse_clients[i] > 0) {
            close(sse_clients[i]);
            sse_clients[i] = 0;
        }
    }
    sse->client_count = 0;
    pthread_mutex_unlock(&sse->mutex);
    pthread_mutex_destroy(&sse->mutex);
}

int sse_add_client(SSEContext* sse, int fd) {
    pthread_mutex_lock(&sse->mutex);
    if (sse->client_count >= MAX_CLIENTS) {
        pthread_mutex_unlock(&sse->mutex);
        return -1;
    }
    for (int i = 0; i < MAX_CLIENTS; i++) {
        if (sse_clients[i] == 0) {
            sse_clients[i] = fd;
            sse->client_count++;
            pthread_mutex_unlock(&sse->mutex);
            return 0;
        }
    }
    pthread_mutex_unlock(&sse->mutex);
    return -1;
}

void sse_remove_client(SSEContext* sse, int fd) {
    pthread_mutex_lock(&sse->mutex);
    for (int i = 0; i < MAX_CLIENTS; i++) {
        if (sse_clients[i] == fd) {
            sse_clients[i] = 0;
            sse->client_count--;
            break;
        }
    }
    pthread_mutex_unlock(&sse->mutex);
}

void sse_broadcast_canon(SSEContext* sse, uint32_t chunk_index, uint8_t matrix[7], float angle) {
    char msg[512];
    int len = snprintf(msg, sizeof(msg),
        "event: canon\ndata: {\"chunk\":%u,\"matrix\":[%d,%d,%d,%d,%d,%d,%d],\"angle\":%.2f}\n\n",
        chunk_index,
        matrix[0], matrix[1], matrix[2], matrix[3],
        matrix[4], matrix[5], matrix[6], angle);
    
    pthread_mutex_lock(&sse->mutex);
    for (int i = 0; i < MAX_CLIENTS; i++) {
        if (sse_clients[i] > 0) {
            write(sse_clients[i], msg, len);
        }
    }
    pthread_mutex_unlock(&sse->mutex);
}

void sse_broadcast_status(SSEContext* sse, uint32_t chunks, uint32_t current, uint8_t playing, float speed) {
    char msg[256];
    int len = snprintf(msg, sizeof(msg),
        "event: status\ndata: {\"chunks\":%u,\"current\":%u,\"playing\":%d,\"speed\":%.1f}\n\n",
        chunks, current, playing, speed);
    
    pthread_mutex_lock(&sse->mutex);
    for (int i = 0; i < MAX_CLIENTS; i++) {
        if (sse_clients[i] > 0) {
            write(sse_clients[i], msg, len);
        }
    }
    pthread_mutex_unlock(&sse->mutex);
}
