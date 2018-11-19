import retry from '../src';


describe('Retry', () => {
  const success = 'ok';
  const promiseFnSuccess = () => Promise.resolve(success);

  it('Should return a success string if Promise Resolve', async (done) => {
    const resp = await retry(promiseFnSuccess);
    expect(resp).toBe(success);
    done();
  });

  it('Should return a success string if Promise Resolve', async (done) => {
    const resp = await retry(promiseFnSuccess);
    expect(resp).toBe(success);
    done();
  });
});
