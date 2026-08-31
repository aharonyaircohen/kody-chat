declare module "@novnc/novnc" {
  export default class RFB extends EventTarget {
    constructor(
      target: HTMLElement,
      url: string,
      options?: { shared?: boolean; credentials?: { password?: string } },
    );
    scaleViewport: boolean;
    resizeSession: boolean;
    clipViewport: boolean;
    background: string;
    focus(options?: FocusOptions): void;
    disconnect(): void;
  }
}
