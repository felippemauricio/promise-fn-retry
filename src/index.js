const delay = delayTime => new Promise(resolve => setTimeout(resolve, delayTime));

const retry = (requestFn, times, delayTime) => {
  const promise = requestFn();
  return promise.catch((err) => {
    if (times > 0) {
      return delay(delayTime).then(() => retry(requestFn, times - 1, delayTime));
    }
    throw err;
  });
};


export default retry;
