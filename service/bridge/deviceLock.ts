export type DeviceLock = {
  exclusive: <T>(work: () => Promise<T>) => Promise<T>;
  getPendingRequests: () => number;
};

export function createDeviceLock(maxPending = 32): DeviceLock {
  let tail: Promise<unknown> = Promise.resolve();
  let pendingRequests = 0;

  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (pendingRequests >= maxPending) {
      return Promise.reject(Error('Device request queue is busy; try again'));
    }
    pendingRequests++;
    const next = tail.then(work).finally(() => {
      pendingRequests--;
    });
    tail = next.catch(ignoredError => {
      void ignoredError;
    });
    return next;
  }

  return {
    exclusive,
    getPendingRequests: () => pendingRequests,
  };
}
