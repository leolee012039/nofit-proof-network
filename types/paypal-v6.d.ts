// Minimal typings for the PayPal JavaScript SDK v6 surface used by this app.
// Source: https://developer.paypal.com/sdk/js/set-up (verified 2026-10-26).

export interface PayPalOneTimePaymentSession {
  start(options: { presentationMode: "auto" | "popup" | "modal" | "redirect" }, orderPromise: Promise<{ orderId: string }>): Promise<void>;
}

export interface PayPalSdkInstance {
  findEligibleMethods(options: { currencyCode: string }): Promise<{ isEligible(method: string): boolean }>;
  createPayPalOneTimePaymentSession(options: {
    onApprove: (data: { orderId: string }) => Promise<void> | void;
    onCancel?: (data: unknown) => void;
    onError?: (error: unknown) => void;
  }): PayPalOneTimePaymentSession;
}

declare global {
  interface Window {
    paypal?: {
      createInstance(options: {
        clientId?: string;
        clientToken?: string;
        components?: string[];
        pageType?: string;
        locale?: string;
      }): Promise<PayPalSdkInstance>;
    };
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "paypal-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { type?: string };
    }
  }
}
