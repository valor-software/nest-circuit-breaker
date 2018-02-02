export interface CircuitBreakerConfig {
    circuitBreakerSleepWindowInMilliseconds?: number;
    circuitBreakerErrorThresholdPercentage?: number;
    circuitBreakerRequestVolumeThreshold?: number;
    timeout?: number;
    statisticalWindowLength?: number;
    statisticalWindowNumberOfBuckets?: number;
    percentileWindowLength?: number;
    percentileWindowNumberOfBuckets?: number;
    requestVolumeRejectionThreshold?: number;
    fallbackTo?: (error: Error, args?: any[]) => PromiseLike<any>;
    shouldErrorBeConsidered?: (error: any) => boolean;
}
