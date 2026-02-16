#ifndef SSE_H
#define SSE_H

#include <pthread.h>
#include <stdint.h>

#define SSE_MAX_CLIENTS 1000

typedef struct {
    int fd;
    uint8_t active;
} SSEClient;

typedef struct {
    int client_count;
    pthread_mutex_t mutex;
} SSEContext;

int sse_init(SSEContext* sse);
void sse_shutdown(SSEContext* sse);
int sse_add_client(SSEContext* sse, int fd);
void sse_remove_client(SSEContext* sse, int fd);
void sse_broadcast_canon(SSEContext* sse, uint32_t chunk_index, uint8_t matrix[7], float angle);
void sse_broadcast_status(SSEContext* sse, uint32_t chunks, uint32_t current, uint8_t playing, float speed);

#endif
