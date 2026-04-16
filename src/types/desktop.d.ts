export {};

declare global {
  interface Window {
    desktopBridge?: {
      isDesktop: boolean;
      getDeviceInfo: () => { deviceId: string; deviceName: string };
    };
  }
}
