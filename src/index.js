/**
 * Default options to options param on retry function
 */
const defaultOptions = {
  times: 1, // Default retries
  initialDelayTime: 100, // Initial delay to first retry (ms)
  onRetry: null, // Function called in all retries. Is good to metrics, for example
  shouldRetry: null, // Verify if is necessary to call retry. Is good to API error of auth.
};

/**
 * Internal controls
 */
const controlOptions = {
  retained: 0, // retries already made
  currentDelay: null, // current delay that used in current retry
};

/**
 * Build the options parsed object in order
 */
const buildOptionsParsed = options => ({
  ...defaultOptions,
  ...controlOptions,
  ...options,
});

/**
 * Used to calc new delay on the next retry
 * Today, this lib double the currentDelay
 */
const calcNewDelay = currentDelay => currentDelay * 2;

/**
 * Build the options to retry object
 * This count the retry
 * This calculate the new delay
 */
const buildOptionsToRetry = (optionsParsed) => {
  const { currentDelay, initialDelayTime, retained } = optionsParsed;
  return {
    ...optionsParsed,
    retained: retained + 1,
    currentDelay: currentDelay ? calcNewDelay(currentDelay) : initialDelayTime,
  };
};

/**
 * Verify if this lib should retry again
 */
const shouldRetryByExecutedTimes = ({ retained, times }) => retained < times;

/**
 * Use the setTimeout to delay retry
 */
const delay = delayTime => new Promise(resolve => setTimeout(resolve, delayTime));

/**
 * This run the lib
 * Receive the promiseFn
 */
const retry = (requestFn, options = defaultOptions) => {
  const optionsParsed = buildOptionsParsed(options);
  const { onRetry, shouldRetry } = optionsParsed;
  const promise = requestFn();

  return promise.catch((err) => {
    if (shouldRetryByExecutedTimes(optionsParsed) && (!shouldRetry || shouldRetry(err))) {
      if (onRetry) onRetry(err, { ...optionsParsed });
      const optionsToRetry = buildOptionsToRetry(optionsParsed);
      return delay(optionsToRetry.retained).then(() => retry(requestFn, optionsToRetry));
    }
    throw err;
  });
};


export default retry;
module.exports = retry;
