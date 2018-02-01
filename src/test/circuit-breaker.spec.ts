import 'jasmine';
import { Test } from '@nestjs/testing';
import { Component, HttpStatus } from '@nestjs/common';
import {
  addCircuitBreakerSupportTo, CircuitBreakerProtected, makeCircuitBreakerStateObserver,
  resetAllCircuitBreakerCaches
} from '../circuit-breaker';
import * as _ from 'lodash/fp';

@Component()
class DumbService {
  name = 'DumbService';

  @CircuitBreakerProtected()
  async doSomeAsyncStuff() {
    return {answer: 43};
  }

  @CircuitBreakerProtected({timeout: 100})
  async doSomeAsyncStuffInLimitedTime() {
    return waitMillis(200);
  }

  async doSomeAsyncStuffUnprotected() {
    return {answer: 42};
  }

  @CircuitBreakerProtected({
    circuitBreakerSleepWindowInMilliseconds: 400,
    shouldErrorBeConsidered: error => error.status !== HttpStatus.UNAUTHORIZED
  })
  async doSomeAsyncStuffAndDoNotOpenCircuitWhenParticularErrorsOccur() {
    const error = new Error('Boom! You are unauthorized');
    (error as any).status = HttpStatus.UNAUTHORIZED;
    throw error;
  }

  @CircuitBreakerProtected({
    circuitBreakerErrorThresholdPercentage: 50,
    circuitBreakerSleepWindowInMilliseconds: 400
  })
  async doSomeAsyncStuffAndThrow(shouldThrow = true) {
    if (shouldThrow) {
      throw new Error('DumbService.doSomeAsyncStuffAndThrow exploded');
    }

    return 'healthy';
  }

  @CircuitBreakerProtected({fallbackTo: (error, args: any[]) => Promise.resolve({fallbackValue: error.message, args})})
  async doSomeAsyncStuffAndThrowWithFallback(paramA: any, paramB: any, paramC: any) {
    throw new Error('DumbService.doSomeAsyncStuffAndThrow exploded');
  }
}

let dumbService: DumbService;

describe('CircuitBreaker', () => {
  beforeEach(async() => {
    const module = await Test.createTestingModule({
      components: [
        {
          provide: DumbService,
          useFactory: () => {
            return addCircuitBreakerSupportTo(new DumbService(), DumbService);
          }
        }
      ]
    }).compile();

    dumbService = module.get(DumbService);
  });

  afterEach(resetAllCircuitBreakerCaches);

  describe('addCircuitBreakerSupportTo', () => {
    it('manages to create a service', () => {
      expect(dumbService).toBeDefined();
    });

    it('manages to use a service with added circuit breaker support as before', async done => {
      expect(dumbService.name).toBe('DumbService');
      expect(await dumbService.doSomeAsyncStuff()).toEqual({answer: 43});
      expect(await dumbService.doSomeAsyncStuffUnprotected()).toEqual({answer: 42});
      done();
    });

    it('protects a method and falls back to the specified value in case of an error', async done => {
      const result = await dumbService.doSomeAsyncStuffAndThrowWithFallback('foo', 'bar', [ 'baz' ]) as any;
      expect(result).toEqual({
        fallbackValue: 'DumbService.doSomeAsyncStuffAndThrow exploded',
        args: [ 'foo', 'bar', [ 'baz' ] ]
      });
      done();
    });

    it('protects a method and rejects with OpenCircuitError when error threshold exceeds the limit', done => {
      _.range(0, 100).forEach(() => dumbService.doSomeAsyncStuffAndThrow().catch(() => { /* noop */
      }));

      setImmediate(() => {
        dumbService.doSomeAsyncStuffAndThrow().catch(error => {
          expect(error.message).toBe('OpenCircuitError');
          done();
        });
      });
    });

    it('gives up when method was not executed within a specified time range', done => {
      dumbService.doSomeAsyncStuffInLimitedTime().catch(error => {
        expect(error.message).toBe('CommandTimeOut');
        done();
      });
    });

    it('does not consider an error in the circuit breaker metrics when config.shouldErrorBeConsidered says so', async done => {
      await Promise.all(_.range(0, 100).map(() =>
        dumbService.doSomeAsyncStuffAndDoNotOpenCircuitWhenParticularErrorsOccur())).catch(() => { /* noop */
      });

      setImmediate(() => {
        dumbService.doSomeAsyncStuffAndDoNotOpenCircuitWhenParticularErrorsOccur().catch(error => {
          expect(error.message).toBe('Boom! You are unauthorized');
          done();
        });
      });
    });

    it('allows to call a method when back off time has passed', async done => {
      await Promise.all(_.range(0, 10).map(() => dumbService.doSomeAsyncStuffAndThrow().catch(() => { /* noop */
      })));

      setImmediate(() => {
        dumbService.doSomeAsyncStuffAndThrow(false).catch(() => { /* noop */
        });
        setTimeout(async() => {
          await dumbService.doSomeAsyncStuffAndThrow(false).then(status => {
            expect(status).toBe('healthy');
            done();
          });
        }, 500);
      });
    });
  });

  describe('makeCircuitBreakerStateObserver', () => {
    let sendgrid: any;
    let logger: any;
    let config: any;

    let metricsSource: any;
    let circuitBreaker: any;
    let circuitSource: any;

    let startObserving;

    beforeEach(() => {
      jasmine.clock().install();

      sendgrid = {
        sendEmail: jasmine.createSpy('sendgrid.sendEmail'),
        createEmail: jasmine.createSpy('sendgrid.createEmail').and.returnValue('email content')
      };

      logger = {
        error: jasmine.createSpy('logger.error')
      };

      config = {
        circuitBreakerNotificationEmail: 'circuit-notify@cb.com'
      };

      metricsSource = {
        getAllMetrics: jasmine.createSpy('metricsSource.getAllMetrics').and.returnValue([])
      };

      circuitBreaker = {
        isOpen: jasmine.createSpy('circuitBreaker').and.returnValue(true)
      };

      circuitSource = {
        getOrCreate: jasmine.createSpy('circuitSource.getOrCreate').and.returnValue(circuitBreaker)
      };

      startObserving = makeCircuitBreakerStateObserver(sendgrid, logger, config);
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('logs opened circuit breakers and sends email notification', () => {
      const metric: any = {
        commandKey: `${DumbService.name}.someMethod`,
        update: jasmine.createSpy('metric.update'),
        getHealthCounts: () => ({
          errorCount: 1,
          totalCount: 1,
          errorPercentage: 100
        })
      };

      metricsSource.getAllMetrics = jasmine.createSpy('metricsSource.getAllMetrics').and.returnValue([ metric ]);

      startObserving(5000, undefined, metricsSource, circuitSource);
      jasmine.clock().tick(5001);

      const expectedErrorMessage = `"Back off" is active for DumbService.someMethod. Health stats: ${JSON.stringify(metric.getHealthCounts())}`;

      expect(metric.update).toHaveBeenCalled();

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(expectedErrorMessage);

      expect(sendgrid.createEmail).toHaveBeenCalledWith(
        expectedErrorMessage,
        'circuit-notify@cb.com',
        '"Back off" is active for DumbService.someMethod',
        'circuit-notify@cb.com',
        'Back off'
      );

      expect(sendgrid.sendEmail).toHaveBeenCalledWith('email content');
    });

    it(`does not log closed circuit breaker's stats`, () => {
      const metric: any = {
        commandKey: `${DumbService.name}.someMethod`,
        update: jasmine.createSpy('metric.update'),
        getHealthCounts: () => ({
          errorCount: 1,
          totalCount: 1,
          errorPercentage: 100
        })
      };

      metricsSource.getAllMetrics = jasmine.createSpy('metricsSource.getAllMetrics').and.returnValue([ metric ]);
      circuitBreaker.isOpen = jasmine.createSpy('circuitBreaker.isOpen').and.returnValue(false);

      startObserving(5000, undefined, metricsSource, circuitSource);
      jasmine.clock().tick(5001);

      expect(logger.error).not.toHaveBeenCalled();
      expect(sendgrid.createEmail).not.toHaveBeenCalled();
      expect(sendgrid.sendEmail).not.toHaveBeenCalled();
    });

    it(`does not log zero errors stats`, () => {
      const metric: any = {
        commandKey: `${DumbService.name}.someMethod`,
        update: jasmine.createSpy('metric.update'),
        getHealthCounts: () => ({
          errorCount: 0,
          totalCount: 1,
          errorPercentage: 0
        })
      };

      metricsSource.getAllMetrics = jasmine.createSpy('metricsSource.getAllMetrics').and.returnValue([ metric ]);

      startObserving(5000, undefined, metricsSource, circuitSource);
      jasmine.clock().tick(5001);

      expect(logger.error).not.toHaveBeenCalled();
      expect(sendgrid.createEmail).not.toHaveBeenCalled();
      expect(sendgrid.sendEmail).not.toHaveBeenCalled();
    });

    it(`does not send email notification when there is no value for "circuitBreakerNotificationEmail" in the config`, () => {
      const metric: any = {
        commandKey: `${DumbService.name}.someMethod`,
        update: jasmine.createSpy('metric.update'),
        getHealthCounts: () => ({
          errorCount: 1,
          totalCount: 1,
          errorPercentage: 100
        })
      };

      config.circuitBreakerNotificationEmail = null;

      metricsSource.getAllMetrics = jasmine.createSpy('metricsSource.getAllMetrics').and.returnValue([ metric ]);

      startObserving(5000, undefined, metricsSource, circuitSource);
      jasmine.clock().tick(5001);

      expect(logger.error).toHaveBeenCalled();
      expect(sendgrid.createEmail).not.toHaveBeenCalled();
      expect(sendgrid.sendEmail).not.toHaveBeenCalled();
    });

    it(`does not send email notification when there is no sendgrid service given`, () => {
      const metric: any = {
        commandKey: `${DumbService.name}.someMethod`,
        update: jasmine.createSpy('metric.update'),
        getHealthCounts: () => ({
          errorCount: 1,
          totalCount: 1,
          errorPercentage: 100
        })
      };

      metricsSource.getAllMetrics = jasmine.createSpy('metricsSource.getAllMetrics').and.returnValue([ metric ]);

      startObserving = startObserving = makeCircuitBreakerStateObserver(null, logger, config);
      startObserving(5000, undefined, metricsSource, circuitSource);

      jasmine.clock().tick(5001);

      expect(logger.error).toHaveBeenCalled();
      expect(sendgrid.createEmail).not.toHaveBeenCalled();
      expect(sendgrid.sendEmail).not.toHaveBeenCalled();
    });
  });
});

async function waitMillis(millis: number) {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
}
