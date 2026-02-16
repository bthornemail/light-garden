# MQTT Broker Configuration
# 
# This file contains configuration for running an MQTT broker
# for the Fano Light Garden distributed system.
#
# You have several options:

# OPTION 1: Mosquitto (Recommended for local development)
# 
# Install: apt install mosquitto mosquitto-clients
# Run: mosquitto -c mosquitto.conf
#
# mosquitto.conf:
# listener 1883
# allow_anonymous true
# persistence false

# OPTION 2: EMQX (Cloud/Enterprise)
#
# docker run -d --name emqx -p 1883:1883 -p 8083:8083 -p 8883:8883 -p 8084:8084 emqx/emqx

# OPTION 3: HiveMQ (Public Broker for Testing)
# 
# Use: broker.hivemq.com:1883 (no auth)
# Note: Not for production!

# WEBSOCKET BRIDGE (for browser MQTT over WebSockets)
# 
# If using Mosquitto, add to mosquitto.conf:
# listener 9001
# protocol websockets

# MQTT TOPICS STRUCTURE
#
# Garden LEDs:
#   m/240'/ring'/led'/dim'  - 241-bit garden
#   m/60'/ring'/led'/dim'  - 61-bit personal
#   m/7'/led               - 7-bit talisman
#   m/256'/row'/col        - 256-bit window
#
# System topics:
#   garden/sync/request    - Request full sync
#   garden/sync/response  - Full state broadcast
#   garden/peers/join     - Peer joined
#   garden/peers/leave    - Peer left

# EXAMPLE CLIENT CODE
#
# const mqtt = require('mqtt');
# const client = mqtt.connect('mqtt://localhost:1883');
#
# client.on('connect', () => {
#   console.log('Connected to MQTT broker');
#   client.subscribe('m/240/#');
#   client.subscribe('garden/sync/#');
# });
#
# client.on('message', (topic, message) => {
#   const state = JSON.parse(message.toString());
#   updateGardenLED(topic, state);
# });
#
# function publishLED(path, h, s, v) {
#   client.publish(path, JSON.stringify({
#     h, s, v,
#     t: Date.now(),
#     sig: generateSignature(path)
#   }), { retain: true });
# }
