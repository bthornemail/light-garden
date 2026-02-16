#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <sys/epoll.h>
#include <pthread.h>
#include <signal.h>
#include <time.h>
#include <fcntl.h>
#include <errno.h>
#include <stdint.h>
#include <stddef.h>

#include "memory_pool.h"
#include "websocket.h"

#define MAX_EVENTS 10000
#define PORT 8080
#define WS_PORT 8081
#define BUFFER_SIZE 65536
#define MAX_PATH 256
#define MAX_CLIENTS 10000
#define MAX_CHUNKS 100000
#define CANON_TICK_MS 100

typedef struct {
    char path[MAX_PATH];
    uint8_t matrix[7];
    float angle;
    uint64_t timestamp;
    uint32_t seed;
} CanonChunk;

typedef struct {
    CanonChunk* chunks;
    size_t count;
    size_t capacity;
    uint32_t current_index;
    uint8_t playing;
    float speed;
} CanonState;

typedef struct {
    int fd;
    char buffer[BUFFER_SIZE];
    size_t buffer_len;
    size_t buffer_pos;
    uint64_t last_active;
    uint8_t authenticated;
    char role[16];
    char peer_id[64];
} Client;

typedef struct {
    int epoll_fd;
    int server_fd;
    Client* clients[MAX_CLIENTS];
    CanonState canon;
    pthread_mutex_t canon_mutex;
    uint8_t running;
    WSContext ws;
} ServerState;

static const uint8_t FANO_HUES[8] = {0, 30, 60, 120, 240, 150, 44, 0};
static const char* FANO_NAMES[8] = {
    "Metatron", "Solomon", "Solon", "Asabiyyah",
    "Enoch", "Speaker", "Genesis", "Observer"
};

static int load_canon(CanonState* canon, const char* filename) {
    FILE* file = fopen(filename, "r");
    if (!file) {
        fprintf(stderr, "Failed to open %s\n", filename);
        return -1;
    }
    
    canon->capacity = 1000;
    canon->chunks = malloc(sizeof(CanonChunk) * canon->capacity);
    if (!canon->chunks) {
        fclose(file);
        return -1;
    }
    canon->count = 0;
    
    char line[4096];
    while (fgets(line, sizeof(line), file)) {
        if (canon->count >= canon->capacity) {
            canon->capacity *= 2;
            CanonChunk* new_chunks = realloc(canon->chunks, sizeof(CanonChunk) * canon->capacity);
            if (!new_chunks) {
                fclose(file);
                return -1;
            }
            canon->chunks = new_chunks;
        }
        
        CanonChunk* chunk = &canon->chunks[canon->count];
        memset(chunk, 0, sizeof(CanonChunk));
        
        char* matrix_start = strstr(line, "\"matrix\":[");
        if (matrix_start) {
            matrix_start += 9;
            for (int i = 0; i < 7; i++) {
                chunk->matrix[i] = atoi(matrix_start);
                matrix_start = strchr(matrix_start, ',');
                if (matrix_start) matrix_start++;
                else break;
            }
        }
        
        char* angle_start = strstr(line, "\"angle\":");
        if (angle_start) {
            angle_start += 7;
            chunk->angle = atof(angle_start);
        }
        
        chunk->timestamp = (uint64_t)time(NULL) * 1000 + canon->count * 100;
        
        uint32_t quadrant_bits = 0;
        for (int i = 0; i < 7; i++) {
            quadrant_bits |= (chunk->matrix[i] & 3) << (i * 2);
        }
        uint32_t angle_bits = ((uint32_t)((chunk->angle / 360.0) * 1023)) & 0x3FF;
        chunk->seed = (quadrant_bits << 10) | angle_bits;
        
        canon->count++;
    }
    
    fclose(file);
    printf("Loaded %zu canon chunks from %s\n", canon->count, filename);
    return 0;
}

static int create_server_socket(int port) {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) return -1;
    
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_port = htons((uint16_t)port),
        .sin_addr.s_addr = INADDR_ANY
    };
    
    if (bind(server_fd, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        close(server_fd);
        return -1;
    }
    if (listen(server_fd, SOMAXCONN) < 0) {
        close(server_fd);
        return -1;
    }
    
    int flags = fcntl(server_fd, F_GETFL, 0);
    fcntl(server_fd, F_SETFL, flags | O_NONBLOCK);
    
    return server_fd;
}

static void send_response(int client_fd, const char* status, const char* content_type, const char* body, size_t body_len) {
    char header[512];
    int header_len = snprintf(header, sizeof(header),
        "HTTP/1.1 %s\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %zu\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Connection: close\r\n"
        "\r\n",
        status, content_type, body_len);
    
    write(client_fd, header, header_len);
    if (body && body_len > 0) {
        write(client_fd, body, body_len);
    }
}

static void send_json(int client_fd, const char* json) {
    send_response(client_fd, "200 OK", "application/json", json, strlen(json));
}

static void send_not_found(int client_fd) {
    send_response(client_fd, "404 Not Found", "text/plain", "Not Found", 9);
}

static void send_ok(int client_fd) {
    send_response(client_fd, "200 OK", "text/plain", "OK", 2);
}

static void handle_api_request(ServerState* state, Client* client, char* path) {
    char response[4096];
    int len;
    
    if (strcmp(path, "/") == 0 || strcmp(path, "/index.html") == 0 || strcmp(path, "/api") == 0) {
        len = snprintf(response, sizeof(response),
            "{\"server\":\"Fano Garden C Server\",\"port\":%d,\"chunks\":%zu}",
            PORT, state->canon.count);
        response[len] = '\0';
        send_json(client->fd, response);
    }
    else if (strcmp(path, "/api/canon") == 0 || strcmp(path, "/api/canon.json") == 0) {
        pthread_mutex_lock(&state->canon_mutex);
        len = snprintf(response, sizeof(response),
            "{\"chunks\":%zu,\"current\":%u,\"playing\":%d,\"speed\":%.1f}",
            state->canon.count, state->canon.current_index, state->canon.playing, state->canon.speed);
        pthread_mutex_unlock(&state->canon_mutex);
        response[len] = '\0';
        send_json(client->fd, response);
    }
    else if (strcmp(path, "/api/play") == 0) {
        pthread_mutex_lock(&state->canon_mutex);
        state->canon.playing = 1;
        pthread_mutex_unlock(&state->canon_mutex);
        send_ok(client->fd);
    }
    else if (strcmp(path, "/api/pause") == 0) {
        pthread_mutex_lock(&state->canon_mutex);
        state->canon.playing = 0;
        pthread_mutex_unlock(&state->canon_mutex);
        send_ok(client->fd);
    }
    else if (strcmp(path, "/api/stop") == 0) {
        pthread_mutex_lock(&state->canon_mutex);
        state->canon.playing = 0;
        state->canon.current_index = 0;
        pthread_mutex_unlock(&state->canon_mutex);
        send_ok(client->fd);
    }
    else if (strncmp(path, "/api/seek?", 10) == 0) {
        float pos = atof(path + 10);
        pthread_mutex_lock(&state->canon_mutex);
        if (state->canon.count > 0) {
            state->canon.current_index = (uint32_t)(pos * state->canon.count);
            if (state->canon.current_index >= state->canon.count) {
                state->canon.current_index = state->canon.count - 1;
            }
        }
        pthread_mutex_unlock(&state->canon_mutex);
        send_ok(client->fd);
    }
    else if (strncmp(path, "/api/speed?", 11) == 0) {
        float speed = atof(path + 11);
        pthread_mutex_lock(&state->canon_mutex);
        state->canon.speed = speed;
        pthread_mutex_unlock(&state->canon_mutex);
        send_ok(client->fd);
    }
    else if (strncmp(path, "/api/chunk/", 11) == 0) {
        uint32_t index = atoi(path + 11);
        pthread_mutex_lock(&state->canon_mutex);
        if (index < state->canon.count) {
            CanonChunk* chunk = &state->canon.chunks[index];
            len = snprintf(response, sizeof(response),
                "{\"index\":%u,\"matrix\":[%d,%d,%d,%d,%d,%d,%d],"
                "\"angle\":%.2f,\"seed\":%u,\"timestamp\":%lu}",
                index,
                chunk->matrix[0], chunk->matrix[1], chunk->matrix[2],
                chunk->matrix[3], chunk->matrix[4], chunk->matrix[5], chunk->matrix[6],
                chunk->angle, chunk->seed, (unsigned long)chunk->timestamp);
            response[len] = '\0';
            send_json(client->fd, response);
        } else {
            pthread_mutex_unlock(&state->canon_mutex);
            send_not_found(client->fd);
            return;
        }
        pthread_mutex_unlock(&state->canon_mutex);
    }
    else if (strncmp(path, "/api/fano/", 10) == 0) {
        uint8_t point = atoi(path + 10);
        if (point < 8) {
            len = snprintf(response, sizeof(response),
                "{\"point\":%d,\"name\":\"%s\",\"hue\":%d,\"ratio\":%.4f}",
                point + 1, FANO_NAMES[point], FANO_HUES[point],
                (float)FANO_HUES[point] / 360.0f);
            response[len] = '\0';
            send_json(client->fd, response);
        } else {
            send_not_found(client->fd);
        }
    }
    else if (strcmp(path, "/api/ws") == 0) {
        char ws_info[512];
        int len = snprintf(ws_info, sizeof(ws_info),
            "{\"ws_port\":%d,\"protocol\":\"fano-protocol\"}", WS_PORT);
        send_json(client->fd, ws_info);
    }
    else if (strcmp(path, "/api/models") == 0 || strcmp(path, "/api/models.json") == 0) {
        FILE* mf = fopen("storage/models/index.json", "r");
        if (mf) {
            fseek(mf, 0, SEEK_END);
            long fsize = ftell(mf);
            fseek(mf, 0, SEEK_SET);
            char* json = malloc(fsize + 1);
            fread(json, 1, fsize, mf);
            json[fsize] = '\0';
            fclose(mf);
            send_json(client->fd, json);
            free(json);
        } else {
            send_json(client->fd, "{\"samples\":[],\"error\":\"No models found\"}");
        }
    }
    else if (strcmp(path, "/api/assets") == 0 || strcmp(path, "/api/assets.ndjson") == 0) {
        FILE* af = fopen("storage/canon-assets.ndjson", "r");
        if (af) {
            fseek(af, 0, SEEK_END);
            long asize = ftell(af);
            fseek(af, 0, SEEK_SET);
            char* data = malloc(asize + 1);
            fread(data, 1, asize, af);
            data[asize] = '\0';
            fclose(af);
            
            char header[256];
            int header_len = snprintf(header, sizeof(header),
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: application/x-ndjson\r\n"
                "Content-Length: %ld\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "\r\n", asize);
            write(client->fd, header, header_len);
            write(client->fd, data, asize);
            free(data);
        } else {
            send_not_found(client->fd);
        }
    }
    else {
        send_not_found(client->fd);
    }
}

static void handle_client_message(ServerState* state, Client* client) {
    char* data = client->buffer;
    size_t len = client->buffer_len;
    
    if (len < 4) return;
    
    if (strncmp(data, "GET ", 4) == 0) {
        char* path_start = data + 4;
        char* path_end = strchr(path_start, ' ');
        if (!path_end) return;
        
        char path[256];
        size_t path_len = path_end - path_start;
        if (path_len >= sizeof(path)) path_len = sizeof(path) - 1;
        strncpy(path, path_start, path_len);
        path[path_len] = '\0';
        
        if (strncmp(path, "/api/", 5) == 0) {
            handle_api_request(state, client, path);
        }
        else if (strcmp(path, "/composer") == 0 || strcmp(path, "/composer.html") == 0) {
            FILE* hf = fopen("public/composer.html", "r");
            if (hf) {
                fseek(hf, 0, SEEK_END);
                long hsize = ftell(hf);
                fseek(hf, 0, SEEK_SET);
                char* html = malloc(hsize + 1);
                fread(html, 1, hsize, hf);
                html[hsize] = '\0';
                fclose(hf);
                char header[256];
                int header_len = snprintf(header, sizeof(header),
                    "HTTP/1.1 200 OK\r\n"
                    "Content-Type: text/html\r\n"
                    "Content-Length: %ld\r\n"
                    "Access-Control-Allow-Origin: *\r\n"
                    "\r\n", hsize);
                write(client->fd, header, header_len);
                write(client->fd, html, hsize);
                free(html);
            } else {
                send_not_found(client->fd);
            }
        }
        else if (strcmp(path, "/composer.js") == 0) {
            FILE* jf = fopen("public/composer.js", "r");
            if (jf) {
                fseek(jf, 0, SEEK_END);
                long jsize = ftell(jf);
                fseek(jf, 0, SEEK_SET);
                char* js = malloc(jsize + 1);
                fread(js, 1, jsize, jf);
                js[jsize] = '\0';
                fclose(jf);
                char header[256];
                int header_len = snprintf(header, sizeof(header),
                    "HTTP/1.1 200 OK\r\n"
                    "Content-Type: application/javascript\r\n"
                    "Content-Length: %ld\r\n"
                    "Access-Control-Allow-Origin: *\r\n"
                    "\r\n", jsize);
                write(client->fd, header, header_len);
                write(client->fd, js, jsize);
                free(js);
            } else {
                send_not_found(client->fd);
            }
        }
        else if (strcmp(path, "/composer.css") == 0) {
            FILE* cf = fopen("public/composer.css", "r");
            if (cf) {
                fseek(cf, 0, SEEK_END);
                long csize = ftell(cf);
                fseek(cf, 0, SEEK_SET);
                char* css = malloc(csize + 1);
                fread(css, 1, csize, cf);
                css[csize] = '\0';
                fclose(cf);
                char header[256];
                int header_len = snprintf(header, sizeof(header),
                    "HTTP/1.1 200 OK\r\n"
                    "Content-Type: text/css\r\n"
                    "Content-Length: %ld\r\n"
                    "Access-Control-Allow-Origin: *\r\n"
                    "\r\n", csize);
                write(client->fd, header, header_len);
                write(client->fd, css, csize);
                free(css);
            } else {
                send_not_found(client->fd);
            }
        }
        else if (strcmp(path, "/pipe.js") == 0) {
            FILE* pf = fopen("public/pipe.js", "r");
            if (pf) {
                fseek(pf, 0, SEEK_END);
                long psize = ftell(pf);
                fseek(pf, 0, SEEK_SET);
                char* js = malloc(psize + 1);
                fread(js, 1, psize, pf);
                js[psize] = '\0';
                fclose(pf);
                char header[256];
                int header_len = snprintf(header, sizeof(header),
                    "HTTP/1.1 200 OK\r\n"
                    "Content-Type: application/javascript\r\n"
                    "Content-Length: %ld\r\n"
                    "Access-Control-Allow-Origin: *\r\n"
                    "\r\n", psize);
                write(client->fd, header, header_len);
                write(client->fd, js, psize);
                free(js);
            } else {
                send_not_found(client->fd);
            }
        }
        else if (strcmp(path, "/fano-editor.js") == 0) {
            FILE* ef = fopen("public/fano-editor.js", "r");
            if (ef) {
                fseek(ef, 0, SEEK_END);
                long esize = ftell(ef);
                fseek(ef, 0, SEEK_SET);
                char* js = malloc(esize + 1);
                fread(js, 1, esize, ef);
                js[esize] = '\0';
                fclose(ef);
                char header[256];
                int header_len = snprintf(header, sizeof(header),
                    "HTTP/1.1 200 OK\r\n"
                    "Content-Type: application/javascript\r\n"
                    "Content-Length: %ld\r\n"
                    "Access-Control-Allow-Origin: *\r\n"
                    "\r\n", esize);
                write(client->fd, header, header_len);
                write(client->fd, js, esize);
                free(js);
            } else {
                send_not_found(client->fd);
            }
        }
        else if (strcmp(path, "/firmware.html") == 0 || strcmp(path, "/fano-minimal.html") == 0) {
            FILE* ff = fopen("public/fano-minimal.html", "r");
            if (ff) {
                fseek(ff, 0, SEEK_END);
                long fsize = ftell(ff);
                fseek(ff, 0, SEEK_SET);
                char* html = malloc(fsize + 1);
                fread(html, 1, fsize, ff);
                html[fsize] = '\0';
                fclose(ff);
                char header[256];
                int header_len = snprintf(header, sizeof(header),
                    "HTTP/1.1 200 OK\r\n"
                    "Content-Type: text/html\r\n"
                    "Content-Length: %ld\r\n"
                    "Access-Control-Allow-Origin: *\r\n"
                    "\r\n", fsize);
                write(client->fd, header, header_len);
                write(client->fd, html, fsize);
                free(html);
            } else {
                send_not_found(client->fd);
            }
        }
        else if (strcmp(path, "/") == 0 || strcmp(path, "/index.html") == 0) {
            char* html = "<html><body><h1>Fano Garden C Server</h1><p>Running on port 8080</p></body></html>";
            send_response(client->fd, "200 OK", "text/html", html, strlen(html));
        }
        else {
            send_not_found(client->fd);
        }
    }
}

static void* canon_player_thread(void* arg) {
    ServerState* state = (ServerState*)arg;
    uint64_t last_tick = 0;
    uint32_t last_index = 0;
    
    while (state->running) {
        usleep(10000);
        
        uint64_t now = (uint64_t)(time(NULL)) * 1000;
        if (now - last_tick < CANON_TICK_MS) continue;
        
        pthread_mutex_lock(&state->canon_mutex);
        
        if (state->canon.playing && state->canon.count > 0) {
            uint32_t steps = (uint32_t)((now - last_tick) / (CANON_TICK_MS / state->canon.speed));
            if (steps > 0) {
                state->canon.current_index += steps;
                if (state->canon.current_index >= state->canon.count) {
                    state->canon.current_index = 0;
                }
                
                if (state->canon.current_index != last_index) {
                    CanonChunk* chunk = &state->canon.chunks[state->canon.current_index];
                    ws_broadcast_canon(&state->ws, state->canon.current_index, chunk->matrix, chunk->angle);
                    float progress = (float)state->canon.current_index / state->canon.count;
                    ws_broadcast_status(&state->ws, state->canon.count, state->canon.current_index, state->canon.playing, state->canon.speed);
                    last_index = state->canon.current_index;
                }
            }
        }
        
        last_tick = now;
        pthread_mutex_unlock(&state->canon_mutex);
    }
    
    return NULL;
}

static void handle_client_close(ServerState* state, int client_fd) {
    close(client_fd);
    epoll_ctl(state->epoll_fd, EPOLL_CTL_DEL, client_fd, NULL);
    if (state->clients[client_fd]) {
        free(state->clients[client_fd]);
        state->clients[client_fd] = NULL;
    }
}

static int add_client(ServerState* state, int client_fd) {
    Client* client = calloc(1, sizeof(Client));
    if (!client) return -1;
    
    client->fd = client_fd;
    client->last_active = time(NULL);
    
    int flags = fcntl(client_fd, F_GETFL, 0);
    fcntl(client_fd, F_SETFL, flags | O_NONBLOCK);
    
    struct epoll_event ev;
    ev.events = EPOLLIN | EPOLLET;
    ev.data.fd = client_fd;
    
    if (epoll_ctl(state->epoll_fd, EPOLL_CTL_ADD, client_fd, &ev) < 0) {
        free(client);
        return -1;
    }
    
    state->clients[client_fd] = client;
    return 0;
}

static void signal_handler(int sig) {
    (void)sig;
    printf("\nShutting down...\n");
}

int main(int argc, char** argv) {
    (void)argc;
    (void)argv;
    
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    
    ServerState state;
    memset(&state, 0, sizeof(state));
    pthread_mutex_init(&state.canon_mutex, NULL);
    state.running = 1;
    
    if (load_canon(&state.canon, "../canon-manifest.ndjson") < 0) {
        fprintf(stderr, "Failed to load canon, using empty state\n");
        state.canon.capacity = 100;
        state.canon.chunks = calloc(100, sizeof(CanonChunk));
    }
    state.canon.speed = 1.0f;
    
    ws_init(&state.ws, WS_PORT);
    printf("WebSocket server initialized on port %d\n", WS_PORT);
    
    pthread_t ws_thread;
    pthread_create(&ws_thread, NULL, ws_service_thread, &state.ws);
    
    state.server_fd = create_server_socket(PORT);
    if (state.server_fd < 0) {
        fprintf(stderr, "Failed to create server socket\n");
        return 1;
    }
    
    state.epoll_fd = epoll_create1(0);
    if (state.epoll_fd < 0) {
        fprintf(stderr, "Failed to create epoll\n");
        return 1;
    }
    
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = state.server_fd;
    epoll_ctl(state.epoll_fd, EPOLL_CTL_ADD, state.server_fd, &ev);
    
    pthread_t player_thread;
    pthread_create(&player_thread, NULL, canon_player_thread, &state);
    
    printf("Fano C Server running on port %d\n", PORT);
    printf("Loaded %zu canon chunks\n", state.canon.count);
    printf("API endpoints:\n");
    printf("  GET /api/canon       - Get canon state\n");
    printf("  GET /api/play       - Start playback\n");
    printf("  GET /api/pause      - Pause playback\n");
    printf("  GET /api/stop       - Stop and reset\n");
    printf("  GET /api/seek?0.5   - Seek to position (0-1)\n");
    printf("  GET /api/speed?1.5  - Set playback speed\n");
    printf("  GET /api/chunk/N    - Get chunk N\n");
    printf("  GET /api/fano/N     - Get Fano point N info\n");
    
    struct epoll_event events[MAX_EVENTS];
    
    while (state.running) {
        int nfds = epoll_wait(state.epoll_fd, events, MAX_EVENTS, 1000);
        if (nfds < 0) {
            if (errno == EINTR) continue;
            break;
        }
        
        for (int i = 0; i < nfds; i++) {
            if (events[i].data.fd == state.server_fd) {
                while (1) {
                    struct sockaddr_in client_addr;
                    socklen_t client_len = sizeof(client_addr);
                    int client_fd = accept(state.server_fd, (struct sockaddr*)&client_addr, &client_len);
                    
                    if (client_fd < 0) break;
                    if (client_fd >= MAX_CLIENTS) {
                        close(client_fd);
                        continue;
                    }
                    
                    add_client(&state, client_fd);
                }
            }
            else {
                int client_fd = events[i].data.fd;
                Client* client = state.clients[client_fd];
                
                if (!client) continue;
                
                ssize_t count = read(client_fd, client->buffer + client->buffer_len,
                                     BUFFER_SIZE - client->buffer_len - 1);
                
                if (count <= 0) {
                    handle_client_close(&state, client_fd);
                    continue;
                }
                
                client->buffer_len += count;
                client->buffer[client->buffer_len] = '\0';
                
                char* end = strstr(client->buffer, "\r\n\r\n");
                if (end) {
                    *end = '\0';
                    handle_client_message(&state, client);
                    handle_client_close(&state, client_fd);
                }
                
                client->last_active = time(NULL);
            }
        }
    }
    
    state.running = 0;
    pthread_join(player_thread, NULL);
    
    close(state.server_fd);
    close(state.epoll_fd);
    pthread_mutex_destroy(&state.canon_mutex);
    free(state.canon.chunks);
    
    return 0;
}
