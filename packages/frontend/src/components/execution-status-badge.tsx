import { useTranslation } from 'react-i18next';

/**
 * Status badge for the execution history (PEC-219).
 *
 * Supports all three eventual states up front, even though slice #03 only ever
 * renders `success`. Failures (`failed`, open) and recoveries (`resolved`)
 * arrive with the keeper channel in slice #05.
 */
export type ExecutionStatus = 'success' | 'failed' | 'resolved';

const STYLES: Record<ExecutionStatus, { className: string; dot: string }> = {
  success: {
    className: 'bg-green-100 text-green-700',
    dot: 'bg-green-500',
  },
  failed: {
    className: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
  },
  resolved: {
    className: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground',
  },
};

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  const { t } = useTranslation();
  const known = status in STYLES ? status : 'success';
  const style = STYLES[known];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${style.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {t(`executionStatus.${known}`)}
    </span>
  );
}
