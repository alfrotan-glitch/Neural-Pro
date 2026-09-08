import { useSyncExternalStore } from 'react';
import { TransportClock } from './transportClock';

let transportClock: TransportClock | null = null;

export function getTransportClock(): TransportClock {
  if (!transportClock) {
    transportClock = new TransportClock({ publishFps: 30 });
  }
  return transportClock;
}

const subscribeTransportClock = (onStoreChange: () => void): (() => void) => {
  return getTransportClock().subscribe(onStoreChange);
};

const getTransportSnapshot = (): number => {
  return getTransportClock().currentTime;
};

export function useTransportTime(): number {
  return useSyncExternalStore(
    subscribeTransportClock,
    getTransportSnapshot,
    getTransportSnapshot,
  );
}
