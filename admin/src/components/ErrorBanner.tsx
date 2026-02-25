interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-red-50 border border-red-200 px-4 py-3">
      <p className="text-sm text-red-700">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 text-sm font-medium text-red-700 underline hover:text-red-800"
        >
          Retry
        </button>
      )}
    </div>
  );
}
