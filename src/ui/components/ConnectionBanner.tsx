import type { ConnectionStatus } from '../client/GameClient';

const STATUS_MESSAGES: Record<ConnectionStatus, string | null> = {
  connecting: 'Connecting to the local game server…',
  open: null,
  reconnecting: 'Connection lost. Reconnecting… Unsent actions will be resent automatically and never applied twice.',
  offline: 'Cannot reach the game server. Check that "npm run dev" is still running; this page keeps retrying.',
};

interface ConnectionBannerProps {
  status: ConnectionStatus;
  error: { code: string; message: string } | null;
  notice: string | null;
  onDismissError(): void;
  onDismissNotice(): void;
}

export function ConnectionBanner({ status, error, notice, onDismissError, onDismissNotice }: ConnectionBannerProps) {
  const message = STATUS_MESSAGES[status];
  return (
    <div className="banners">
      {message && (
        <p role="status" className={`banner banner-${status}`}>
          {message}
        </p>
      )}
      {notice && (
        <p role="status" className="banner banner-notice">
          {notice}{' '}
          <button type="button" className="link-button" onClick={onDismissNotice}>
            Dismiss
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="banner banner-error">
          <strong>Not accepted:</strong> {error.message}{' '}
          <button type="button" className="link-button" onClick={onDismissError}>
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}
