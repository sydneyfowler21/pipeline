export type Clock = {
  now(): Date;
};

export const systemClock: Clock = {
  now: () => new Date(),
};

export function createClock(start: Date): Clock & { set(next: Date): void } {
  let current = start;
  return {
    now: () => current,
    set(next: Date) {
      current = next;
    },
  };
}
