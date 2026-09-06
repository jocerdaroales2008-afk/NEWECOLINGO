import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecyclingLog } from '@/types';

const STORAGE_KEY = 'ecolingo-recycling-log';

export function useRecyclingLog() {
  const [logs, setLogs] = useState<RecyclingLog[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    } catch {
      // ignore
    }
  }, [logs]);

  const addLog = useCallback((item: Omit<RecyclingLog, 'id' | 'timestamp'>) => {
    const entry: RecyclingLog = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    setLogs((prev) => [entry, ...prev]);
  }, []);

  const removeLog = useCallback((id: string) => {
    setLogs((prev) => prev.filter((log) => log.id !== id));
  }, []);

  const stats = useMemo(() => {
    const total = logs.reduce((sum, log) => sum + log.quantity, 0);
    const points = logs.reduce((sum, log) => sum + log.quantity * 10, 0);
    const categories = new Set(logs.map((log) => log.category));
    const thisWeek = logs.filter((log) => Date.now() - log.timestamp < 7 * 24 * 60 * 60 * 1000);
    return { total, points, categoryCount: categories.size, thisWeek: thisWeek.length };
  }, [logs]);

  return { logs, addLog, removeLog, stats };
}
