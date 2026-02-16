class FanoPipe {
    constructor(config) {
        this.id = config.pipe_id || `pipe-${Date.now()}`;
        this.manifest = config;
        this.connection = null;
        this.eventHandlers = {};
        this.isConnected = false;
        this.reconnectTimer = null;
    }
    
    async connect() {
        const protocol = this.manifest.connection.protocol;
        
        switch(protocol) {
            case 'websocket':
                return this.connectWebSocket();
            case 'mqtt':
                return this.connectMQTT();
            case 'serial':
                return this.connectSerial();
            default:
                throw new Error(`Unsupported protocol: ${protocol}`);
        }
    }
    
    connectWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                this.connection = new WebSocket(this.manifest.connection.endpoint);
                
                this.connection.onopen = () => {
                    this.isConnected = true;
                    this.emit('connected', { pipe: this.id });
                    resolve();
                };
                
                this.connection.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.receive(data);
                    } catch (e) {
                        console.error('WS parse error:', e);
                    }
                };
                
                this.connection.onclose = () => {
                    this.isConnected = false;
                    this.emit('disconnected', { pipe: this.id });
                    
                    if (this.manifest.connection.config?.reconnect) {
                        this.reconnectTimer = setTimeout(() => {
                            this.connect();
                        }, 5000);
                    }
                };
                
                this.connection.onerror = (err) => {
                    console.error('WebSocket error:', err);
                    reject(err);
                };
            } catch (e) {
                reject(e);
            }
        });
    }
    
    connectMQTT() {
        console.log('MQTT connection not implemented in browser - use WebSocket');
        return Promise.reject(new Error('MQTT requires Node.js'));
    }
    
    connectSerial() {
        console.log('Serial connection not implemented in browser');
        return Promise.reject(new Error('Serial requires Node.js'));
    }
    
    send(data) {
        if (!this.isConnected || !this.connection) {
            console.warn('Pipe not connected');
            return;
        }
        
        let transformed = data;
        if (this.manifest.mapping?.output_transform) {
            try {
                const fn = new Function('data', this.manifest.mapping.output_transform);
                transformed = fn(data);
            } catch (e) {
                console.error('Output transform error:', e);
            }
        }
        
        if (this.manifest.connection.protocol === 'websocket') {
            this.connection.send(JSON.stringify(transformed));
        }
    }
    
    receive(rawData) {
        let data = rawData;
        
        if (this.manifest.mapping?.input_transform) {
            try {
                const fn = new Function('data', this.manifest.mapping.input_transform);
                data = fn(rawData);
            } catch (e) {
                console.error('Input transform error:', e);
            }
        }
        
        if (data.type && this.eventHandlers[data.type]) {
            this.eventHandlers[data.type].forEach(handler => handler(data));
        } else if (this.eventHandlers['data']) {
            this.eventHandlers['data'].forEach(handler => handler(data));
        }
    }
    
    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }
    
    off(event, handler) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
        }
    }
    
    emit(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => handler(data));
        }
    }
    
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.connection) {
            if (this.manifest.connection.protocol === 'websocket') {
                this.connection.close();
            }
            this.connection = null;
        }
        this.isConnected = false;
    }
}

class PipeManager {
    constructor() {
        this.pipes = new Map();
        this.templates = this.getTemplates();
    }
    
    getTemplates() {
        return {
            'esp32-led': {
                pipe_id: 'esp32-led',
                name: 'ESP32 LED Array',
                version: '1.0.0',
                type: 'bidirectional',
                connection: {
                    protocol: 'websocket',
                    endpoint: 'ws://192.168.1.100:8082',
                    config: { reconnect: true, timeout: 5000 }
                },
                capabilities: {
                    events: ['matrix_update', 'dice_roll'],
                    actions: ['set_led', 'set_pattern']
                }
            },
            'dice-random': {
                pipe_id: 'dice-random',
                name: 'Fano Dice Random Generator',
                version: '1.0.0',
                type: 'input',
                connection: {
                    protocol: 'websocket',
                    endpoint: 'ws://localhost:8083',
                    config: { reconnect: true, timeout: 5000 }
                },
                capabilities: {
                    events: ['dice_roll'],
                    queries: ['get_entropy']
                },
                mapping: {
                    input_transform: `(data) => { 
                        if (data.event === 'dice_roll') {
                            return { 
                                type: 'dice_roll', 
                                rolls: data.rolls,
                                entropy: data.entropy,
                                timestamp: data.timestamp 
                            };
                        }
                        return data;
                    }`
                }
            },
            'sensor-temp': {
                pipe_id: 'sensor-temp',
                name: 'Temperature Sensor',
                version: '1.0.0',
                type: 'input',
                connection: {
                    protocol: 'websocket',
                    endpoint: 'ws://192.168.1.101:8084',
                    config: { reconnect: true }
                },
                capabilities: {
                    events: ['temperature', 'humidity', 'pressure']
                },
                mapping: {
                    input_transform: `(data) => { 
                        return { 
                            type: 'temperature', 
                            value: data.temp,
                            unit: 'celsius',
                            timestamp: Date.now()
                        }; 
                    }`
                }
            },
            'mqtt-bridge': {
                pipe_id: 'mqtt-bridge',
                name: 'MQTT Bridge',
                version: '1.0.0',
                type: 'bidirectional',
                connection: {
                    protocol: 'websocket',
                    endpoint: 'ws://localhost:8085/mqtt',
                    config: { reconnect: true }
                },
                capabilities: {
                    events: ['mqtt_message'],
                    actions: ['publish']
                }
            }
        };
    }
    
    async createPipe(templateName, customConfig = {}) {
        const template = this.templates[templateName];
        if (!template) throw new Error(`Template ${templateName} not found`);
        
        const config = {
            ...template,
            pipe_id: `${templateName}-${Date.now()}`,
            ...customConfig,
            connection: {
                ...template.connection,
                ...customConfig.connection
            }
        };
        
        const pipe = new FanoPipe(config);
        
        pipe.on('connected', () => this.updateUI());
        pipe.on('disconnected', () => this.updateUI());
        pipe.on('data', (data) => this.handlePipeData(pipe.id, data));
        pipe.on('dice_roll', (data) => this.handleDiceRoll(data));
        pipe.on('temperature', (data) => this.handleTemperature(data));
        
        this.pipes.set(pipe.id, pipe);
        this.updateUI();
        
        try {
            await pipe.connect();
        } catch (e) {
            console.error('Pipe connection failed:', e);
        }
        
        return pipe;
    }
    
    handlePipeData(pipeId, data) {
        console.log(`Pipe ${pipeId}:`, data);
        
        if (window.fanoSocket && window.fanoSocket.readyState === WebSocket.OPEN) {
            window.fanoSocket.send(JSON.stringify({
                type: 'pipe_data',
                pipe: pipeId,
                data: data
            }));
        }
        
        this.processPipeData(data);
    }
    
    handleDiceRoll(data) {
        window.addLog?.(`🎲 Dice: ${JSON.stringify(data.rolls)}`, 'dice');
        
        if (window.composer) {
            const hue = (data.rolls[0]?.fano_point || 1) * 45;
            window.composer.scene.background.setHSL(hue / 360, 0.3, 0.1);
        }
    }
    
    handleTemperature(data) {
        if (window.composer) {
            const temp = data.value || 20;
            const hue = Math.max(0, Math.min(240, (temp - 10) * 4));
            window.composer.scene.background.setHSL(hue / 360, 0.2, 0.1);
        }
    }
    
    processPipeData(data) {
        if (!data || !data.type) return;
        
        switch(data.type) {
            case 'temperature':
                if (window.composer) {
                    const temp = data.value;
                    const hue = (temp / 100) * 240;
                    window.composer.scene.background.setHSL(hue / 360, 0.3, 0.1);
                }
                break;
                
            case 'matrix_update':
                if (window.epistemicSquare && data.matrix) {
                    window.epistemicSquare.setMatrix(data.matrix);
                    window.epistemicSquare.setAngle(data.angle || 0);
                }
                break;
                
            case 'dice_roll':
                window.addLog?.(`🎲 Dice roll: ${JSON.stringify(data.rolls)}`, 'dice');
                break;
        }
    }
    
    updateUI() {
        const list = document.getElementById('pipe-list');
        if (!list) return;
        
        list.innerHTML = '';
        
        this.pipes.forEach((pipe, id) => {
            const item = document.createElement('div');
            item.className = `pipe-item ${pipe.isConnected ? '' : 'offline'}`;
            item.innerHTML = `
                <span class="name">${pipe.manifest.name}</span>
                <span class="status ${pipe.isConnected ? 'online' : 'offline'}">
                    ${pipe.isConnected ? '● Online' : '○ Offline'}
                </span>
            `;
            list.appendChild(item);
        });
    }
    
    disconnectPipe(pipeId) {
        const pipe = this.pipes.get(pipeId);
        if (pipe) {
            pipe.disconnect();
            this.pipes.delete(pipeId);
            this.updateUI();
        }
    }
    
    broadcastToAll(data) {
        this.pipes.forEach(pipe => {
            if (pipe.isConnected) {
                pipe.send(data);
            }
        });
    }
}

window.FanoPipe = FanoPipe;
window.PipeManager = PipeManager;
