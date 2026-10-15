// Minimal typings for the parts of Google Identity Services we use.
interface GoogleCredentialResponse {
  credential: string;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize(options: {
          client_id: string;
          callback: (r: GoogleCredentialResponse) => void;
          auto_select?: boolean;
        }): void;
        renderButton(parent: HTMLElement, options: { theme?: string; size?: string; text?: string }): void;
        disableAutoSelect(): void;
      };
    };
  };
}
