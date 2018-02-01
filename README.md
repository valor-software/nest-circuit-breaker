# nest-circuitbreaker

This is a wrapper for implementaion of [Circuit Breaker][wiki] pattern(made by [hystrixjs][hystrix]) adapted
for NestJS framework

## Implementation assumptions and constraints

* Every protected method must return a Promise as a result (so async functions and methods are fine 
and this is very convenient with NestJS)
* We can protect only methods of instances that are within NestJS components (annotated with @Component).
This constraint comes from NestJS itself, cause it gives enough control (and possibilities for augmentation)
only over @Components.
* Points above imply that if some of the functionality inside of a @Controller instance needs to be protected
with a Circuit Breaker - this functionality must be extracted in to service (@Component instance).

## Protecting services (@Component instances) with CircuitBreaker

1. Augment service that needs protection.
1. Annotate methods that need protection inside of the service with @CuircuitBreakerProtected annotation
1. Provide an optional configuration for the @CuircuitBreakerProtected annotation
1. Start watching over circuit breaker events (they will be logged)

## Augment service that needs protection
#### Regular component creation
```
@Module({
 modules: [CoreModule],
 controllers: [
   CandidatesController
 ],
 components: [
   CandidatesService
 ]
})
export class NewCandidatesModule {
}
```
#### Circuit Breaker protected component creation

```
@Module({
 modules: [CoreModule],
 controllers: [
   CandidatesController
 ],
 components: [
   {
     provide: CandidatesService,
     useFactory: (logger: Logger, config: Config, api: ApiHelperService) => {
       return addCircuitBreakerSupportTo(new CandidatesService(config, api), CandidatesService);
     },
     inject: [
       Logger, Config, ApiHelperService
     ]
   }
 ]
})
export class NewCandidatesModule {
}
```

## Annotate methods that need protection
#### Annotated service method
```
@Component()
export class CandidatesService {
 // ... 

 @CircuitBreakerProtected({fallbackTo: defaultFallback})
 async searchResumesNode(body: any) {
   return await request({
	// required request options
   });
 }

 // ...
}
```

## @CircuitBreakerProtected annotation configuration
```
// All settings are optional and their default values provided below
@CircuitBreakerProtected({
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
})
```

## Start watching over circuit breaker events
``` 
export class CoreModule {
 constructor(private logger: Logger,
             private config: Config,
             private sendgridService: SendgridService) {
   const startObservingCircuitBreakerState = makeCircuitBreakerStateObserver(this.sendgridService, logger, config);
   
   // Every 5 seconds (be default) Circuit Breaker will be polled and all opened ones (this is when back off is active)
   //get logged along with health stats
   startObservingCircuitBreakerState();
 }
}
```

## When Circuit Breaker is active (back off is active)
#### This is what gets printed to the console:
```
> "CandidatesService.searchResumesNode" circuit breaker is active.
> Health stats: {totalCount: 100, errorCount: 80, errorsPercentage: 80}
```

[wiki]: https://en.wikipedia.org/wiki/Circuit_breaker_design_pattern
[hystrix]: https://www.npmjs.com/package/hystrixjs
