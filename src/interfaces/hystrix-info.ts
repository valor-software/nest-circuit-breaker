import { CircuitBreaker, CommandMetrics } from 'hystrixjs';

export interface HystrixInfo {
  metrics: CommandMetrics;
  commandKey: string;
  circuitBreaker: CircuitBreaker;
}
