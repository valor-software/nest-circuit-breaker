import { CustomEmailService, CustomLogger, CustomConfig, CircuitBreakerConfig } from './interfaces';
export declare const CircuitBreakerProtected: (config?: CircuitBreakerConfig) => (target: object, key?: any, descriptor?: any) => any;
export declare function addCircuitBreakerSupportTo<T>(service: T, group: any): T;
export declare function makeCircuitBreakerStateObserver(mailer: CustomEmailService, logger: CustomLogger, config: CustomConfig): any;
export declare function resetAllCircuitBreakerCaches(): void;
