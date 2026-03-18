/**
 * Global Recharts mock for vitest.
 * Imported in setup.js so all test files get a working recharts mock.
 * Individual tests can override with their own vi.mock('recharts', ...) if needed.
 */
import { vi } from 'vitest'

vi.mock('recharts', () => {
  const MockChart = ({ children }) => <div data-testid="recharts-mock">{children}</div>
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    BarChart: MockChart,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    PieChart: MockChart,
    Pie: ({ data }) => (
      <div data-testid="pie-data">
        {data?.map((d, i) => <span key={i}>{d.party || d.name}: {d.seats || d.value}</span>)}
      </div>
    ),
    Cell: () => null,
    Legend: () => null,
    LineChart: MockChart,
    Line: () => null,
    AreaChart: MockChart,
    Area: () => null,
    ComposedChart: MockChart,
    ScatterChart: MockChart,
    Scatter: () => null,
    ZAxis: () => null,
    RadarChart: MockChart,
    Radar: () => null,
    PolarGrid: () => null,
    PolarAngleAxis: () => null,
    PolarRadiusAxis: () => null,
    ReferenceLine: () => null,
    Brush: () => null,
    Treemap: MockChart,
  }
})
