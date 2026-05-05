export {};

declare global {
  interface Window {
    desktopBridge?: {
      isDesktop: boolean;
    };
  }
}
