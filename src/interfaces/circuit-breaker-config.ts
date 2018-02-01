export interface CircuitBreakerConfig {
  /**
   * How long the circuit breaker should stay opened,
   * before allowing a single request to test the health of the service
   */
  circuitBreakerSleepWindowInMilliseconds?: number;
  /**
   * Error percentage threshold to trip the circuit
   */
  circuitBreakerErrorThresholdPercentage?: number;
  /**
   * Minimum number of requests in a rolling window that needs to be exceeded,
   * before the circuit breaker will bother at all to calculate the health
   */
  circuitBreakerRequestVolumeThreshold?: number;
  /**
   * It will reject this method in case it wasn't resolved within a specified time window (in millis)
   */
  timeout?: number;
  /**
   * length of the window (in millis) to keep track of execution counts metrics (success, failure)
   */
  statisticalWindowLength?: number;
  /**
   * Number of buckets within the statistical window
   */
  statisticalWindowNumberOfBuckets?: number;
  /**
   * length of the window (in millis) to keep track of execution times
   */
  percentileWindowLength?: number;
  /**
   * Number of buckets within the percentile window
   */
  percentileWindowNumberOfBuckets?: number;
  /**
   * Maximum number of concurrent requests, which can be executed. Defaults to 0, i.e. no limitation
   */
  requestVolumeRejectionThreshold?: number;
  /**
   * Function, which will be executed if the request fails.
   * The function will be called with the error as the 1st argument and an array of the original args as the 2nd argument
   */
  fallbackTo?: (error: Error, args ?: any[]) => PromiseLike<any>;
  /**
   * Function to validate if the error response from the service is an actual error.
   * If this function returns an error object (default implementation),
   * this request call will be marked as failure, which will influence the error percentage.
   * If it returns null or false, the call will not be marked as failure.
   * An example could be a 404 error, if the customer is not found.
   */
  shouldErrorBeConsidered?: (error: any) => boolean;
}
