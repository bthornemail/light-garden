#ifndef MEMORY_POOL_H
#define MEMORY_POOL_H

#include <stdlib.h>
#include <stdint.h>
#include <string.h>

typedef struct {
    void* blocks;
    size_t block_size;
    size_t block_count;
    size_t free_count;
    uint8_t* free_list;
    size_t next_free;
} MemoryPool;

static MemoryPool* pool_create(size_t block_size, size_t block_count) {
    MemoryPool* pool = malloc(sizeof(MemoryPool));
    if (!pool) return NULL;
    
    pool->block_size = block_size;
    pool->block_count = block_count;
    pool->free_count = block_count;
    
    pool->blocks = malloc(block_size * block_count);
    pool->free_list = malloc(block_count * sizeof(uint8_t));
    
    if (!pool->blocks || !pool->free_list) {
        free(pool->blocks);
        free(pool->free_list);
        free(pool);
        return NULL;
    }
    
    memset(pool->free_list, 1, block_count);
    pool->next_free = 0;
    
    return pool;
}

static void* pool_alloc(MemoryPool* pool) {
    if (pool->free_count == 0) return NULL;
    
    size_t attempts = 0;
    while (!pool->free_list[pool->next_free] && attempts < pool->block_count) {
        pool->next_free = (pool->next_free + 1) % pool->block_count;
        attempts++;
    }
    
    if (attempts >= pool->block_count) return NULL;
    
    size_t idx = pool->next_free;
    pool->free_list[idx] = 0;
    pool->free_count--;
    pool->next_free = (pool->next_free + 1) % pool->block_count;
    
    return (char*)pool->blocks + (idx * pool->block_size);
}

static void pool_free(MemoryPool* pool, void* ptr) {
    if (!ptr) return;
    
    ptrdiff_t offset = (char*)ptr - (char*)pool->blocks;
    if (offset < 0 || offset % pool->block_size != 0) return;
    
    size_t idx = offset / pool->block_size;
    if (idx < pool->block_count) {
        pool->free_list[idx] = 1;
        pool->free_count++;
    }
}

static void pool_destroy(MemoryPool* pool) {
    if (!pool) return;
    free(pool->blocks);
    free(pool->free_list);
    free(pool);
}

#endif
