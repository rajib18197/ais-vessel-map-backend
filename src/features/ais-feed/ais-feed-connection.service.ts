import net from 'node:net';
import dgram from 'node:dgram';
import { logger } from '../../shared/logger/logger.js';
import { createSentenceDeduper } from './ais-feed-dedup.service.js';
import type { AisFeedConfig } from './ais-feed.types.js';

export interface AisFeedConnection {
  start: () => void;
  stop: () => void;
}

export function createAisFeedConnection(
  config: AisFeedConfig,
  onLine: (line: string) => void,
): AisFeedConnection {
  let socket: net.Socket | dgram.Socket | null = null;
  let stopped = false;
  let reconnectTimer: NodeJS.Timeout | null = null;

  const deduper = createSentenceDeduper();

  function handleLine(line: string): void {
    if (deduper.isDuplicate(line)) return;
    onLine(line);
  }

  function start(): void {
    stopped = false;
    config.protocol === 'tcp' ? startTcp() : startUdp();
  }

  function startTcp(): void {
    const tcpSocket: net.Socket = net.createConnection({ host: config.host, port: config.port });
    socket = tcpSocket;

    let buffer = '';
    tcpSocket.setEncoding('utf8');

    tcpSocket.on('connect', () => {
      logger.info({ host: config.host, port: config.port }, 'AIS TCP feed connected');
    });

    tcpSocket.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) handleLine(line.trim());
      }
    });

    tcpSocket.on('error', (err: Error) => {
      logger.error({ err: err.message }, 'AIS TCP feed socket error');
    });

    tcpSocket.on('close', () => {
      logger.warn({}, 'AIS TCP feed connection closed');
      scheduleReconnect();
    });
  }

  function startUdp(): void {
    const udpSocket: dgram.Socket = dgram.createSocket('udp4');
    socket = udpSocket;

    udpSocket.on('message', (msg: Buffer, _rinfo: dgram.RemoteInfo) => {
      const text = msg.toString('utf8');
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) handleLine(line.trim());
      }
    });

    udpSocket.on('error', (err: Error) => {
      logger.error({ err: err.message }, 'AIS UDP feed socket error');

      udpSocket.close(() => {
        socket = null;
        scheduleReconnect();
      });
    });

    udpSocket.on('close', () => {
      if (!stopped && socket === null) {
        logger.warn({}, 'AIS UDP socket closed unexpectedly');
      }
    });

    udpSocket.bind(config.port, () => {
      logger.info({ port: config.port }, 'AIS UDP feed listening');
    });
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!stopped) start();
    }, config.reconnectDelayMs);
  }

  function stop(): void {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (socket instanceof net.Socket) {
      socket.destroy();
    } else if (socket) {
      try {
        const udpSocket = socket;
        udpSocket.close();
      } catch {
        /* already closed */
      }
    }
    socket = null;
  }

  return { start, stop };
}
