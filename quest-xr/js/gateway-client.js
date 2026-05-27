import { Component, Property } from '@wonderlandengine/api';

export class GatewayClient extends Component {
    static TypeName = 'gateway-client';
    static Properties = {
        url: Property.string('ws://localhost:8787'),
        autoReconnect: Property.bool(true),
        logMessages: Property.bool(true),
        exposeGlobal: Property.bool(true),
        captureQuality: Property.float(0.7),
        captureMaxWidth: Property.int(768),
        usePositionalAudio: Property.bool(false),
        audioPosX: Property.float(0.0),
        audioPosY: Property.float(0.0),
        audioPosZ: Property.float(-1.0),
        meshSpawnerObject: Property.object(),
    };

    start() {
        this._socket = null;
        this._queue = [];
        this._audioContext = null;
        this._connect();

        if (this.exposeGlobal && typeof window !== 'undefined') {
            window.questXRGateway = this;
        }
    }

    onDeactivate() {
        if (this._socket) {
            this._socket.close();
            this._socket = null;
        }
    }

    sendText(text, options = {}) {
        if (!text) return;
        this._sendPayload({ text, ...options });
    }

    sendResearchQuery(text, options = {}) {
        if (!text) return;
        this._sendPayload({ text, mode: 'INVESTIGAR', ...options });
    }

    sendObjectQuery(text, options = {}) {
        if (!text) return;
        this._sendPayload({ text, mode: 'OBJETO', ...options });
    }

    async sendVisionQuery(text, options = {}) {
        const frame = this._captureFrame();
        this._sendPayload({
            text: text || '',
            image: frame.data,
            imageMimeType: frame.mimeType,
            mode: 'VISION',
            ...options,
        });
    }

    _connect() {
        if (this._socket) return;
        this._socket = new WebSocket(this.url);

        this._socket.onopen = () => {
            if (this.logMessages) console.log('Gateway connected.');
            this._flushQueue();
        };

        this._socket.onmessage = (event) => {
            this._handleMessage(event.data);
        };

        this._socket.onclose = () => {
            if (this.logMessages) console.log('Gateway disconnected.');
            this._socket = null;
            if (this.autoReconnect) {
                setTimeout(() => this._connect(), 1500);
            }
        };

        this._socket.onerror = (err) => {
            if (this.logMessages) console.warn('Gateway error', err);
        };
    }

    _sendPayload(payload) {
        const message = JSON.stringify(payload);
        if (this._socket && this._socket.readyState === WebSocket.OPEN) {
            this._socket.send(message);
        } else {
            this._queue.push(message);
        }
    }

    _flushQueue() {
        if (!this._socket || this._socket.readyState !== WebSocket.OPEN) return;
        while (this._queue.length > 0) {
            this._socket.send(this._queue.shift());
        }
    }

    _handleMessage(data) {
        if (data instanceof Blob) {
            data.text().then((text) => this._handleMessage(text));
            return;
        }

        let payload = null;
        try {
            payload = JSON.parse(typeof data === 'string' ? data : data.toString());
        } catch (err) {
            if (this.logMessages) console.warn('Unparsed payload', data);
            return;
        }

        if (!payload?.action) return;

        switch (payload.action) {
            case 'VOICE_AUDIO':
                this._handleVoiceAudio(payload);
                break;
            case 'VOICE_TEXT':
                if (this.logMessages) console.log('Voice text:', payload.text);
                break;
            case 'UI_TREE':
                this._dispatchEvent('quest-ui-tree', payload.tree);
                break;
            case 'VISION_RESULT':
                this._dispatchEvent('quest-vision-result', payload);
                break;
            case 'OBJECT_REQUEST':
                this._dispatchEvent('quest-object-request', payload);
                break;
            case 'OBJECT_SPAWN':
                this._handleObjectSpawn(payload);
                break;
            case 'UI_LOG':
                if (this.logMessages) console.log(payload.message);
                break;
            default:
                this._dispatchEvent('quest-gateway-payload', payload);
                break;
        }
    }

    _dispatchEvent(name, detail) {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent(name, { detail }));
    }

    _captureFrame() {
        const canvas = this.engine.canvas;
        if (!canvas) return { data: '', mimeType: 'image/jpeg' };

        const maxWidth = Math.max(1, this.captureMaxWidth || canvas.width);
        const scale = Math.min(1, maxWidth / canvas.width);
        if (scale >= 1) {
            const dataUrl = canvas.toDataURL('image/jpeg', this.captureQuality);
            return { data: dataUrl.split(',')[1] || '', mimeType: 'image/jpeg' };
        }

        const target = document.createElement('canvas');
        target.width = Math.floor(canvas.width * scale);
        target.height = Math.floor(canvas.height * scale);
        const ctx = target.getContext('2d');
        ctx.drawImage(canvas, 0, 0, target.width, target.height);
        const dataUrl = target.toDataURL('image/jpeg', this.captureQuality);
        return { data: dataUrl.split(',')[1] || '', mimeType: 'image/jpeg' };
    }

    async _handleVoiceAudio(payload) {
        if (!payload?.data) return;
        const mimeType = payload.mimeType || 'audio/pcm;rate=24000';
        const sampleRate = payload.sampleRate || parseSampleRate(mimeType) || 24000;
        const buffer = base64ToArrayBuffer(payload.data);
        const audioContext = this._getAudioContext();

        if (mimeType.startsWith('audio/pcm')) {
            const audioBuffer = pcm16ToAudioBuffer(buffer, audioContext, sampleRate);
            this._playAudioBuffer(audioBuffer);
            return;
        }

        try {
            const decoded = await decodeAudioData(audioContext, buffer.slice(0));
            this._playAudioBuffer(decoded);
        } catch (err) {
            if (this.logMessages) console.warn('Audio decode failed', err);
        }
    }

    _playAudioBuffer(audioBuffer) {
        if (!audioBuffer) return;
        const source = this._getAudioContext().createBufferSource();
        source.buffer = audioBuffer;

        if (this.usePositionalAudio) {
            const panner = this._getAudioContext().createPanner();
            panner.positionX.value = this.audioPosX;
            panner.positionY.value = this.audioPosY;
            panner.positionZ.value = this.audioPosZ;
            source.connect(panner);
            panner.connect(this._getAudioContext().destination);
        } else {
            source.connect(this._getAudioContext().destination);
        }

        source.start();
    }

    _handleObjectSpawn(payload) {
        const url = payload?.url || payload?.modelUrl;
        if (!url) return;

        const targetObject = this.meshSpawnerObject || this.object;
        const spawner = targetObject.getComponent('mesh-spawner');
        if (spawner && spawner.spawnFromUrl) {
            spawner.spawnFromUrl(url, targetObject);
        } else if (this.logMessages) {
            console.warn('Mesh spawner component not found.');
        }
    }

    _getAudioContext() {
        if (!this._audioContext) {
            this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this._audioContext;
    }
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function decodeAudioData(context, buffer) {
    return new Promise((resolve, reject) => {
        context.decodeAudioData(buffer, resolve, reject);
    });
}

function parseSampleRate(mimeType) {
    const match = /rate=(\d+)/.exec(mimeType || '');
    return match ? Number(match[1]) : null;
}

function pcm16ToAudioBuffer(buffer, context, sampleRate) {
    const input = new Int16Array(buffer);
    const audioBuffer = context.createBuffer(1, input.length, sampleRate);
    const channel = audioBuffer.getChannelData(0);

    for (let i = 0; i < input.length; i++) {
        channel[i] = input[i] / 32768;
    }

    return audioBuffer;
}
