import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

export type SparklineTrendColor = 'auto' | 'success' | 'danger' | 'neutral';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  trendColor?: SparklineTrendColor;
  strokeWidth?: number;
}

function getCssHsl(token: string): string {
  if (typeof window === 'undefined') return 'hsl(0 0% 60%)';
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value ? `hsl(${value})` : 'hsl(0 0% 60%)';
}

/** Linear-regression slope on (i, v_i). Positive = up, negative = down. */
function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function resolveColor(trendColor: SparklineTrendColor, data: number[]): string {
  if (trendColor === 'success') return getCssHsl('--success');
  if (trendColor === 'danger') return getCssHsl('--danger');
  if (trendColor === 'neutral') return getCssHsl('--text-muted');
  // auto: slope-based
  const m = slope(data);
  const mean = data.length > 0 ? data.reduce((s, v) => s + v, 0) / data.length : 0;
  const threshold = mean === 0 ? 0.5 : Math.abs(mean) * 0.05;
  if (m > threshold) return getCssHsl('--success');
  if (m < -threshold) return getCssHsl('--danger');
  return getCssHsl('--text-muted');
}

export function Sparkline({
  data,
  width = 60,
  height = 16,
  trendColor = 'auto',
  strokeWidth = 1.5,
}: SparklineProps) {
  if (!data || data.length === 0) {
    return <span style={{ display: 'inline-block', width, height }} />;
  }

  const color = resolveColor(trendColor, data);
  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <span style={{ display: 'inline-block', width, height, verticalAlign: 'middle' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={strokeWidth}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </span>
  );
}

export default Sparkline;
