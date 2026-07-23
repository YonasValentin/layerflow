export interface Deferred<Value> {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
}

export function createDeferred<Value>(): Deferred<Value> {
  let settled = false;
  let resolvePromise: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value) {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    },
  };
}
