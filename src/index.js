const defaultOptions = {
  times: 1,
  initialDelayTime: 100,
  onRetry: null,
  shouldRetry: null,
};

const controlOptions = {
  retained: 0,
  currentDelay: null,
};

const buildOptionsParsed = options => ({
  ...defaultOptions,
  ...controlOptions,
  ...options,
});

const calcNewDelay = currentDelay => currentDelay * 2;

const buildOptionsToRetry = (optionsParsed) => {
  const { currentDelay, initialDelayTime, retained } = optionsParsed;
  return {
    ...optionsParsed,
    retained: retained + 1,
    currentDelay: currentDelay ? calcNewDelay(currentDelay) : initialDelayTime,
  };
};

const shouldRetryByExecutedTimes = ({ retained, times }) => retained < times;

const delay = delayTime => new Promise(resolve => setTimeout(resolve, delayTime));

const retry = (requestFn, options = defaultOptions) => {
  const optionsParsed = buildOptionsParsed(options);
  const { onRetry, shouldRetry } = optionsParsed;
  const promise = requestFn();

  return promise.catch((err) => {
    if (shouldRetryByExecutedTimes(optionsParsed) && (!shouldRetry || shouldRetry(err))) {
      if (onRetry) onRetry(err, optionsParsed);
      const optionsToRetry = buildOptionsToRetry(optionsParsed);
      return delay(optionsToRetry.retained).then(() => retry(requestFn, optionsToRetry));
    }
    throw err;
  });
};


export default retry;
