"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hystrixjs_1 = require("hystrixjs");
const common_1 = require("@nestjs/common");
const interval_1 = require("rxjs/observable/interval");
const from_1 = require("rxjs/observable/from");
const mergeMap_1 = require("rxjs/operators/mergeMap");
const map_1 = require("rxjs/operators/map");
const filter_1 = require("rxjs/operators/filter");
const _ = require("lodash/fp");
const CircuitBreakerConfigDefaults = {
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
exports.CircuitBreakerProtected = (config) => common_1.SetMetadata(CIRCUIT_BREAKER_CONFIG, _.defaults(CircuitBreakerConfigDefaults, config));
function addCircuitBreakerSupportTo(service, group) {
    const commandCache = new Map();
    return new Proxy(service, {
        get(target, prop) {
            const propertyValue = Reflect.get(target, prop);
            if (typeof propertyValue !== 'function') {
                return propertyValue;
            }
            if (commandCache.has(prop)) {
                return commandCache.get(prop);
            }
            const circuitBreakerConfig = Reflect.getMetadata(CIRCUIT_BREAKER_CONFIG, propertyValue);
            if (!circuitBreakerConfig) {
                return propertyValue;
            }
            const command = toCommand(`${group.name}.${prop}`, group.name, propertyValue.bind(target), circuitBreakerConfig);
            commandCache.set(prop, command.execute.bind(command));
            return commandCache.get(prop);
        }
    });
}
exports.addCircuitBreakerSupportTo = addCircuitBreakerSupportTo;
function toCommand(name, group, func, config) {
    return hystrixjs_1.commandFactory.getOrCreate(name, group)
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
function makeCircuitBreakerStateObserver(mailer, logger, config) {
    return function startObservingCircuitBreakersState(pollIntervalInMillis = 5000, spawnPollEvent = interval_1.interval, metricsSource = hystrixjs_1.metricsFactory, circuitSource = hystrixjs_1.circuitFactory) {
        spawnPollEvent(pollIntervalInMillis).pipe(mergeMap_1.mergeMap(() => from_1.from(metricsSource.getAllMetrics())), map_1.map((metrics) => {
            metrics.update();
            const commandKey = metrics.commandKey;
            const circuitBreaker = circuitSource.getOrCreate({ commandKey });
            return { metrics, commandKey, circuitBreaker };
        }), filter_1.filter(({ circuitBreaker }) => circuitBreaker.isOpen())).subscribe(alertAboutOpenCircuitBreaker(mailer, logger, config));
    };
}
exports.makeCircuitBreakerStateObserver = makeCircuitBreakerStateObserver;
function alertAboutOpenCircuitBreaker(mailer, logger, config) {
    return ({ metrics, commandKey }) => {
        const healthCounts = metrics.getHealthCounts();
        if (healthCounts.errorCount > 0) {
            const group = 'Back off';
            const subject = `"${group}" is active for ${commandKey}`;
            const message = `${subject}. Health stats: ${JSON.stringify(healthCounts)}`;
            logger.error(message);
            if (mailer && config.circuitBreakerNotificationEmail) {
                const email = mailer.createEmail(message, config.circuitBreakerNotificationEmail, subject, config.circuitBreakerNotificationEmail, group);
                mailer.sendEmail(email);
            }
        }
    };
}
function resetAllCircuitBreakerCaches() {
    hystrixjs_1.commandFactory.resetCache();
    hystrixjs_1.metricsFactory.resetCache();
    hystrixjs_1.circuitFactory.resetCache();
}
exports.resetAllCircuitBreakerCaches = resetAllCircuitBreakerCaches;
//# sourceMappingURL=circuit-breaker.js.map