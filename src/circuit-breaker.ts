/* tslint:disable: prefer-method-signature */
import { CircuitBreaker, circuitFactory, Command, commandFactory, CommandMetrics, metricsFactory } from 'hystrixjs';
import { ReflectMetadata } from '@nestjs/common';
import { Metatype } from '@nestjs/common/interfaces';
import { interval } from 'rxjs/observable/interval';
import { from } from 'rxjs/observable/from';
import { mergeMap } from 'rxjs/operators/mergeMap';
import { map } from 'rxjs/operators/map';
import { filter } from 'rxjs/operators/filter';
import * as _ from 'lodash/fp';

import { CustomEmailService, HystrixInfo, CustomLogger, CustomConfig, CircuitBreakerConfig } from './interfaces';

const CircuitBreakerConfigDefaults: CircuitBreakerConfig = {
  circuitBreakerSleepWindowInMilliseconds: 3000,
  circuitBreakerErrorThresholdPercentage: 50,
  circuitBreakerRequestVolumeThreshold: 10,
  timeout: 10000,
  statisticalWindowLength: 10000,
  statisticalWindowNumberOfBuckets: 10,
  percentileWindowLength: 10000,
  percentileWindowNumberOfBuckets: 10,
  requestVolumeRejectionThreshold: 0,
  fallbackTo: undefined,
  shouldErrorBeConsidered: undefined
};

const CIRCUIT_BREAKER_CONFIG = 'CircuitBreakerConfig';
export const CircuitBreakerProtected = (config?: CircuitBreakerConfig) =>
  ReflectMetadata(CIRCUIT_BREAKER_CONFIG, _.defaults(CircuitBreakerConfigDefaults, config));

export function addCircuitBreakerSupportTo<T>(service: T, group: Metatype<T>): T {
  const commandCache = new Map<string, Command>();

  return new Proxy(service as any, {
    get(target: any, prop: string) {
      const propertyValue = Reflect.get(target, prop);
      if (typeof propertyValue !== 'function') {
        return propertyValue;
      }

      if (commandCache.has(prop)) {
        return commandCache.get(prop);
      }

      const circuitBreakerConfig = Reflect.getMetadata(CIRCUIT_BREAKER_CONFIG, propertyValue) as CircuitBreakerConfig;
      if (!circuitBreakerConfig) {
        return propertyValue;
      }

      const command = toCommand(
        `${group.name}.${prop}`,
        group.name,
        propertyValue.bind(target),
        circuitBreakerConfig
      );

      commandCache.set(prop, command.execute.bind(command));

      return commandCache.get(prop);
    }
  });
}

function toCommand(name: string, group: string, func: (...args: any[]) => Promise<any>, config: CircuitBreakerConfig): Command {
  return commandFactory.getOrCreate(name, group)
    .run(func)
    .circuitBreakerSleepWindowInMilliseconds(config.circuitBreakerSleepWindowInMilliseconds)
    .circuitBreakerErrorThresholdPercentage(config.circuitBreakerErrorThresholdPercentage)
    .circuitBreakerRequestVolumeThreshold(config.circuitBreakerRequestVolumeThreshold)
    .timeout(config.timeout)
    .statisticalWindowLength(config.statisticalWindowLength)
    .statisticalWindowNumberOfBuckets(config.statisticalWindowNumberOfBuckets)
    .percentileWindowLength(config.percentileWindowLength)
    .percentileWindowNumberOfBuckets(config.percentileWindowNumberOfBuckets)
    .requestVolumeRejectionThreshold(config.requestVolumeRejectionThreshold)
    .fallbackTo(config.fallbackTo)
    .errorHandler(config.shouldErrorBeConsidered)
    .build();
}

export function makeCircuitBreakerStateObserver(mailer: CustomEmailService, logger: CustomLogger, config: CustomConfig): any {
  return function startObservingCircuitBreakersState(pollIntervalInMillis = 5000, spawnPollEvent = interval, metricsSource = metricsFactory, circuitSource = circuitFactory) {
    spawnPollEvent(pollIntervalInMillis).pipe(
      mergeMap(() => from(metricsSource.getAllMetrics())),
      map((metrics: CommandMetrics) => {
        (metrics as any).update();
        const commandKey = (metrics as any).commandKey;
        const circuitBreaker = (circuitSource as any).getOrCreate({commandKey}) as CircuitBreaker;

        return {metrics, commandKey, circuitBreaker};
      }),
      filter(({circuitBreaker}: HystrixInfo) => circuitBreaker.isOpen())
    ).subscribe(alertAboutOpenCircuitBreaker(mailer, logger, config));
  };
}

function alertAboutOpenCircuitBreaker(mailer: CustomEmailService, logger: CustomLogger, config: CustomConfig): any {
  return ({metrics, commandKey}: HystrixInfo) => {
    const healthCounts = metrics.getHealthCounts();
    if (healthCounts.errorCount > 0) {
      const group = 'Back off';
      const subject = `"${group}" is active for ${commandKey}`;
      const message = `${subject}. Health stats: ${JSON.stringify(healthCounts)}`;

      logger.error(message);
      if (mailer && config.circuitBreakerNotificationEmail) {
        const email = mailer.createEmail(
          message,
          config.circuitBreakerNotificationEmail,
          subject,
          config.circuitBreakerNotificationEmail,
          group
        );

        mailer.sendEmail(email);
      }
    }
  };
}

export function resetAllCircuitBreakerCaches() {
  commandFactory.resetCache();
  metricsFactory.resetCache();
  circuitFactory.resetCache();
}
