type CharCountProps = {
  current: number;
  max: number;
  className?: string;
};

export function CharCount({ current, max, className = "" }: CharCountProps) {
  const percentage = (current / max) * 100;
  const isNearLimit = percentage >= 80;
  const isOverLimit = current > max;

  return (
    <div
      className={`text-xs text-right ${
        isOverLimit
          ? "text-red-400"
          : isNearLimit
          ? "text-yellow-400"
          : "text-gray-500"
      } ${className}`}
    >
      {current} / {max}
    </div>
  );
}
