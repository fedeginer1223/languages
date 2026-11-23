import { useState, useMemo, Fragment } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,





} from '@tanstack/react-table';
import type { SortingState, ColumnFiltersState, VisibilityState, RowSelectionState, FilterFn } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { DataTableColumnHeader } from './DataTableColumnHeader';
import { DataTablePagination } from './DataTablePagination';
import { DataTableToolbar } from './DataTableToolbar';
import type { DataTableColumn, DataTableColumnMeta } from './types';

// Global filter: search across all string-coercible column values
const globalFilterFn: FilterFn<any> = (row, _columnId, filterValue) => {
  const search = String(filterValue).toLowerCase();
  if (!search) return true;
  return row.getAllCells().some((cell) => {
    const value = cell.getValue();
    return String(value ?? '').toLowerCase().includes(search);
  });
};

// Default per-column filter: multi-select array match
const multiSelectFilterFn: FilterFn<any> = (row, columnId, filterValues: string[]) => {
  if (!filterValues || filterValues.length === 0) return true;
  const value = row.getValue(columnId);
  return filterValues.includes(String(value));
};

interface DataTableProps<TData> {
  columns: DataTableColumn<TData>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  pageSize?: number;
  searchPlaceholder?: string;
  enableColumnResizing?: boolean;
  enableColumnVisibility?: boolean;
  enableGlobalFilter?: boolean;
  toolbarLeft?: React.ReactNode;
  toolbarRight?: React.ReactNode;
  loading?: boolean;
  emptyMessage?: string;
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  getRowId?: (row: TData) => string;
  /** Unique ID for persisting column visibility in localStorage */
  tableId?: string;
  /** Render additional rows after each data row (e.g. expandable sub-rows) */
  renderSubRow?: (row: TData) => React.ReactNode | null;
  /** Default sorting state */
  defaultSorting?: SortingState;
}

export function DataTable<TData>({
  columns,
  data,
  onRowClick,
  pageSize = 15,
  searchPlaceholder,
  enableColumnResizing = true,
  enableColumnVisibility = true,
  enableGlobalFilter = true,
  toolbarLeft,
  toolbarRight,
  loading = false,
  emptyMessage = 'No se encontraron resultados',
  enableRowSelection = false,
  rowSelection: controlledRowSelection,
  onRowSelectionChange: controlledOnRowSelectionChange,
  getRowId,
  tableId,
  renderSubRow,
  defaultSorting,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(defaultSorting || []);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [internalRowSelection, setInternalRowSelection] = useState<RowSelectionState>({});
  const rowSelection = controlledRowSelection ?? internalRowSelection;
  const onRowSelectionChange = controlledOnRowSelectionChange ?? setInternalRowSelection;

  const storageKey = tableId ? `datatable-cols-${tableId}` : null;

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    // Try to restore from localStorage
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) return JSON.parse(saved);
      } catch { /* ignore */ }
    }
    // Fallback: build from defaultHidden
    const vis: VisibilityState = {};
    columns.forEach((col) => {
      const id = (col as any).accessorKey || col.id;
      if (id && (col.meta as DataTableColumnMeta)?.defaultHidden) {
        vis[id] = false;
      }
    });
    return vis;
  });

  // Persist column visibility to localStorage
  const handleColumnVisibilityChange = (updater: any) => {
    setColumnVisibility((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  };

  // Map meta.width to TanStack's size
  const columnDefs = useMemo(
    () =>
      columns.map((col) => ({
        ...col,
        size: (col.meta as DataTableColumnMeta)?.width ?? 150,
        minSize: (col.meta as DataTableColumnMeta)?.minWidth ?? 50,
        filterFn: col.filterFn ?? ((col.meta as DataTableColumnMeta)?.filterOptions ? multiSelectFilterFn : 'includesString'),
      })),
    [columns]
  );

  const table = useReactTable({
    data,
    columns: columnDefs,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnVisibility,
      ...(enableRowSelection && { rowSelection }),
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    ...(enableRowSelection && {
      enableRowSelection: true,
      onRowSelectionChange: (updater: any) => {
        const newValue = typeof updater === 'function' ? updater(rowSelection) : updater;
        onRowSelectionChange(newValue);
      },
    }),
    ...(getRowId && { getRowId }),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn,
    columnResizeMode: 'onChange',
    enableColumnResizing,
    initialState: {
      pagination: {
        pageSize: (() => {
          if (tableId) {
            try { const saved = localStorage.getItem(`datatable-pagesize-${tableId}`); if (saved) return parseInt(saved); } catch {}
          }
          return pageSize;
        })(),
      },
    },
  });

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      {(enableGlobalFilter || enableColumnVisibility || toolbarLeft || toolbarRight) && (
        <DataTableToolbar
          table={table}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          searchPlaceholder={searchPlaceholder}
          enableColumnVisibility={enableColumnVisibility}
          toolbarLeft={toolbarLeft}
          toolbarRight={toolbarRight}
        />
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full caption-bottom text-sm">

              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <DataTableColumnHeader key={header.id} header={header} />
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={table.getVisibleLeafColumns().length}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Cargando...
                    </td>
                  </tr>
                ) : table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={table.getVisibleLeafColumns().length}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => {
                    return (
                      <Fragment key={row.id}>
                      <tr
                        className={cn(
                          "border-b border-border transition-colors",
                          onRowClick && "cursor-pointer hover:bg-muted/50"
                        )}
                        onClick={() => onRowClick?.(row.original)}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const cellMeta = cell.column.columnDef.meta as DataTableColumnMeta | undefined;
                          const cellAlign = cellMeta?.align ?? 'left';
                          return (
                            <td
                              key={cell.id}
                              className={cn(
                                "px-2 py-1.5 align-middle text-sm",
                                cellAlign === 'center' && 'text-center',
                                cellAlign === 'right' && 'text-right'
                              )}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })}
                      </tr>
                      {renderSubRow?.(row.original)}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
      </div>

      {/* Pagination */}
      <DataTablePagination table={table} tableId={tableId} />
    </div>
  );
}
