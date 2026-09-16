import { useMemo, useState } from 'react';

export function usePagination<T>(rows: T[], defaultPageSize = 6) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const currentRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);
  return { page, pageSize, total: rows.length, currentRows, setPage, setPageSize };
}

