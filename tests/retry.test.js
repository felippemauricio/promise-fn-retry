import retry from '../src';


describe('Retry', () => {
  const success = 'ok';
  const fail = 'fail';
  const promiseFnSuccess = () => Promise.resolve(success);
  const promiseFnFail = () => Promise.reject(fail);

  it('Should return a success string if Promise Resolve', async (done) => {
    const result = await retry(promiseFnSuccess);
    expect(result).toBe(success);
    done();
  });

  it('Shouldn`t retry if promise success', async (done) => {
    const onRetry = jest.fn();
    await retry(promiseFnSuccess, { onRetry });
    expect(onRetry).not.toHaveBeenCalled();
    done();
  });

  it('Should return a fail if Promise Fail', async (done) => {
    try {
      await retry(promiseFnFail);
    } catch (err) {
      expect(err).toBe(fail);
    }
    done();
  });

  it('Should retry if Promise Fail', async (done) => {
    const onRetry = jest.fn();
    try {
      await retry(promiseFnFail, { onRetry });
    } catch (_err) {
      expect(onRetry).toHaveBeenCalled();
    }
    done();
  });

  it('Should retry using times if Promise Fail', async (done) => {
    const onRetry = jest.fn();
    const times = 3;
    try {
      await retry(promiseFnFail, { onRetry, times });
    } catch (_err) {
      expect(onRetry).toHaveBeenCalledTimes(times);
    }
    done();
  });

  it('Should return a success string if Promise Resolve in retry', async (done) => {
    let toHaveBeemCalled = false;
    const promiseFnSuccessAfterFail = () => {
      if (toHaveBeemCalled) {
        return promiseFnSuccess();
      }
      toHaveBeemCalled = true;
      return promiseFnFail();
    };
    const result = await retry(promiseFnSuccessAfterFail);
    expect(result).toBe(success);
    done();
  });

  it('Shouldn`t retry more if Promise Resolve in retry', async (done) => {
    let toHaveBeemCalled = false;
    const onRetry = jest.fn();
    const times = 5;
    const expectedTimes = 1;
    const promiseFnSuccessAfterFail = () => {
      if (toHaveBeemCalled) {
        return promiseFnSuccess();
      }
      toHaveBeemCalled = true;
      return promiseFnFail();
    };
    await retry(promiseFnSuccessAfterFail, { onRetry, times });
    expect(onRetry).toHaveBeenCalledTimes(expectedTimes);
    done();
  });

  it('Should call shouldRetry if Promise Fail and shouldRetry option exists', async (done) => {
    const onRetry = () => {};
    const shouldRetry = jest.fn(() => false);
    try {
      await retry(promiseFnFail, { onRetry, shouldRetry });
    } catch (_err) {
      expect(shouldRetry).toHaveBeenCalled();
    }
    done();
  });

  it('Should retry using times if Promise Fail and shouldRetry option returns true', async (done) => {
    const onRetry = jest.fn();
    const shouldRetry = () => true;
    const times = 3;
    try {
      await retry(promiseFnFail, { onRetry, shouldRetry, times });
    } catch (_err) {
      expect(onRetry).toHaveBeenCalledTimes(times);
    }
    done();
  });

  it('Shouldn`t retry using times if Promise Fail and shouldRetry option returns false', async (done) => {
    const onRetry = jest.fn();
    const shouldRetry = () => false;
    const times = 3;
    try {
      await retry(promiseFnFail, { onRetry, shouldRetry, times });
    } catch (_err) {
      expect(onRetry).not.toHaveBeenCalled();
    }
    done();
  });
});
