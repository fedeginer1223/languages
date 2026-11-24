import type { Table } from '@tanstack/react-table';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  tableId?: string;
}

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100];

export function DataTablePagination<TData>({ table, tableId }: DataTablePaginationProps<TData>) {
  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex + 1;
  const totalRows = table.getFilteredRowModel().rows.length;
  const pageSize = table.getState().pagination.pageSize;
  const startRow = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalRows);

  const handlePageSizeChange = (value: string) => {
    const newSize = parseInt(value);
    table.setPageSize(newSize);
    if (tableId) {
      try { localStorage.setItem(`datatable-pagesize-${tableId}`, String(newSize)); } catch {}
    }
  };

  // Generate page numbers with smart ellipsis
  const pages: (number | 'ellipsis')[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis');
    }
  }

  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Mostrando {startRow}-{endRow} de {totalRows}
        </p>
        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
          <SelectTrigger className="h-8 w-[70px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map(size => (
              <SelectItem key={size} value={String(size)}>{size}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pages.map((page, idx) =>
            page === 'ellipsis' ? (
              <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground text-sm">...</span>
            ) : (
              <Button
                key={page}
                variant={page === currentPage ? 'default' : 'outline'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => table.setPageIndex(page - 1)}
              >
                {page}
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
