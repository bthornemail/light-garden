CC = gcc
CFLAGS = -O3 -march=native -Wall -pthread
LDFLAGS = -lwebsockets -lpthread

TARGET = fano_server
SOURCES = fano_server.c websocket.c
OBJECTS = $(SOURCES:.c=.o)

all: $(TARGET)

$(TARGET): $(OBJECTS)
	$(CC) $(OBJECTS) -o $(TARGET) $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJECTS) $(TARGET)

run: $(TARGET)
	./$(TARGET)

.PHONY: all clean run
