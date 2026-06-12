import { useState } from "react";

export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  function update(nextValue: T | ((current: T) => T)) {
    setValue((current) => {
      const resolved = typeof nextValue === "function" ? (nextValue as (current: T) => T)(current) : nextValue;
      localStorage.setItem(key, JSON.stringify(resolved));
      return resolved;
    });
  }

  return [value, update] as const;
}
